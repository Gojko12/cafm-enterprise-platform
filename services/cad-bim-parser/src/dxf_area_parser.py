"""
src/dxf_area_parser.py

Production-grade DXF parser for extracting room boundaries, calculating net area m2,
extracting room labels (RoomCode), and exporting GeoJSON + SVG representations.

Supports:
- Multiple room boundary layer configurations (RM$, A-AREA-BOUNDARY, ROOM_POLYGONS, etc.)
- Unit scaling (mm, cm, m, ft -> meters)
- Nested closed polylines as column/void islands for net area subtraction
- TEXT, MTEXT, and block INSERT ATTRIB entity matching for room labels
- Spatial containment validation using Shapely
- SVG export with viewBox alignment and label anchors
- LibreDWG / ODA CLI wrapper for .dwg -> .dxf conversion
"""

import json
import subprocess
import tempfile
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional
from xml.etree import ElementTree as ET

import ezdxf
from pydantic import BaseModel, Field, field_validator
from shapely.geometry import Point, Polygon, LinearRing, MultiPolygon
from shapely.ops import unary_union


class UnitScale(str, Enum):
    """DXF drawing unit to meters conversion."""
    MM = "0.001"
    CM = "0.01"
    M = "1.0"
    FT = "0.3048"


class RoomBoundaryLayer(str, Enum):
    """Common room boundary layer naming conventions."""
    RM_PREFIX = "RM$"
    A_AREA_BOUNDARY = "A-AREA-BOUNDARY"
    ROOM_POLYGONS = "ROOM_POLYGONS"
    BOUNDARIES = "BOUNDARIES"


class ExtractedRoom(BaseModel):
    """Extracted room with calculated net area and spatial geometry."""
    room_code: str = Field(..., description="Room identifier (e.g., RM-001)")
    room_name: Optional[str] = Field(None, description="Human-readable room name")
    net_area_m2: float = Field(..., ge=0, description="Net area in square meters, rounded to 2 decimals")
    geometry_wkt: str = Field(..., description="WKT representation of room polygon")
    geometry_geojson: dict = Field(..., description="GeoJSON Polygon object")
    label_anchor: tuple = Field(..., description="(lon, lat) label anchor point for SVG/map display")
    center_point: tuple = Field(..., description="(lon, lat) polygon centroid")
    bounding_box: dict = Field(..., description="GeoJSON bbox [minLon, minLat, maxLon, maxLat]")

    @field_validator("net_area_m2")
    @classmethod
    def round_area(cls, v: float) -> float:
        return round(v, 2)


class RoomExtractionConfig(BaseModel):
    """Configuration for room boundary and label extraction."""
    boundary_layers: list[str] = Field(
        default_factory=lambda: [RoomBoundaryLayer.RM_PREFIX.value, RoomBoundaryLayer.A_AREA_BOUNDARY.value],
        description="Layer names to search for room boundary polylines"
    )
    void_layers: list[str] = Field(
        default_factory=lambda: ["VOIDS", "COLUMNS", "SHAFTS"],
        description="Layer names for internal column/void islands to subtract"
    )
    label_layers: list[str] = Field(
        default_factory=lambda: ["ROOM_LABELS", "TEXT", "0"],
        description="Layer names to search for room label TEXT/MTEXT/ATTRIB entities"
    )
    unit_scale: UnitScale = Field(default=UnitScale.MM, description="DXF drawing unit to meters")
    min_area_m2: float = Field(default=0.1, ge=0, description="Minimum area threshold to include a room")
    label_pattern: Optional[str] = Field(
        default=r"^[A-Z]{1,3}-\d{3}$",
        description="Regex pattern for matching room codes (e.g., RM-001)"
    )


@dataclass
class DWGConversionResult:
    """Result of DWG -> DXF conversion."""
    success: bool
    dxf_path: Optional[Path] = None
    error_message: Optional[str] = None
    converter_used: str = ""


class DXFAreaParser:
    """
    High-performance DXF parser extracting room geometries and calculating net areas.
    """

    def __init__(self, config: Optional[RoomExtractionConfig] = None):
        self.config = config or RoomExtractionConfig()

    def parse_dxf_file(self, dxf_path: Path) -> dict[str, ExtractedRoom]:
        """
        Parse DXF file and extract all rooms with calculated net areas.

        Args:
            dxf_path: Path to .dxf file

        Returns:
            Dictionary mapping room_code -> ExtractedRoom
        """
        try:
            dwg = ezdxf.readfile(str(dxf_path))
        except ezdxf.DXFStructureError as e:
            raise ValueError(f"Invalid DXF file: {e}") from e

        msp = dwg.modelspace()
        unit_scale = float(self.config.unit_scale.value)

        boundary_polylines = self._extract_polylines(msp, self.config.boundary_layers, unit_scale)
        label_entities = self._extract_label_entities(msp, self.config.label_layers)
        void_polylines = self._extract_polylines(msp, self.config.void_layers, unit_scale)

        rooms: dict[str, ExtractedRoom] = {}

        for idx, boundary_geom in enumerate(boundary_polylines):
            if boundary_geom.area < self.config.min_area_m2:
                continue

            room_code, room_name = self._match_label_to_polygon(boundary_geom, label_entities)
            if not room_code:
                room_code = f"ROOM-{idx + 1:03d}"

            net_area_m2 = self._calculate_net_area(boundary_geom, void_polylines)
            if net_area_m2 < self.config.min_area_m2:
                continue

            centroid = boundary_geom.representative_point()
            label_anchor = (centroid.x, centroid.y)
            center_point = (centroid.x, centroid.y)

            bounds = boundary_geom.bounds
            bounding_box = {
                "type": "BBox",
                "coordinates": [[bounds[0], bounds[1]], [bounds[2], bounds[3]]],
            }

            geojson = {
                "type": "Polygon",
                "coordinates": [list(boundary_geom.exterior.coords)],
            }
            if boundary_geom.interiors:
                for interior in boundary_geom.interiors:
                    geojson["coordinates"].append(list(interior.coords))

            rooms[room_code] = ExtractedRoom(
                room_code=room_code,
                room_name=room_name,
                net_area_m2=net_area_m2,
                geometry_wkt=boundary_geom.wkt,
                geometry_geojson=geojson,
                label_anchor=label_anchor,
                center_point=center_point,
                bounding_box=bounding_box,
            )

        return rooms

    def _extract_polylines(
        self,
        msp: Any,
        layer_names: list[str],
        unit_scale: float,
    ) -> list[Polygon]:
        """Extract and convert closed polylines from specified layers to Shapely Polygons."""
        polylines: list[Polygon] = []

        for entity in msp.query():
            if entity.dxf.layer not in layer_names:
                continue

            if entity.dxftype() in ("LWPOLYLINE", "POLYLINE"):
                coords = []
                for point in entity.get_points():
                    x, y = point[0] * unit_scale, point[1] * unit_scale
                    coords.append((x, y))

                if len(coords) >= 4 and coords[0] == coords[-1]:
                    try:
                        poly = Polygon(coords[:-1])
                        if poly.is_valid:
                            polylines.append(poly)
                    except Exception:
                        pass

            elif entity.dxftype() == "HATCH":
                try:
                    for path in entity.paths:
                        coords = []
                        for vertex in path.vertices:
                            x, y = vertex[0] * unit_scale, vertex[1] * unit_scale
                            coords.append((x, y))
                        if len(coords) >= 4 and coords[0] == coords[-1]:
                            poly = Polygon(coords[:-1])
                            if poly.is_valid:
                                polylines.append(poly)
                except Exception:
                    pass

        return polylines

    def _extract_label_entities(self, msp: Any, layer_names: list[str]) -> dict[str, tuple[float, float, Optional[str]]]:
        """
        Extract room labels (TEXT, MTEXT, ATTRIB) from specified layers.

        Returns:
            Dictionary mapping room_code -> (x, y, text_content)
        """
        labels: dict[str, tuple[float, float, Optional[str]]] = {}

        try:
            for entity in msp:
                if hasattr(entity.dxf, "layer") and entity.dxf.layer not in layer_names:
                    continue

                label_text = None
                x, y = 0.0, 0.0

                try:
                    if entity.dxftype() == "TEXT":
                        label_text = entity.dxf.text
                        x, y = entity.dxf.insert[0], entity.dxf.insert[1]
                    elif entity.dxftype() == "MTEXT":
                        label_text = entity.text
                        x, y = entity.dxf.insert[0], entity.dxf.insert[1]
                    elif entity.dxftype() == "INSERT":
                        if hasattr(entity, "attribs"):
                            for attrib in entity.attribs:
                                if hasattr(attrib.dxf, "tag") and attrib.dxf.tag in ("ROOM_CODE", "ROOMCODE", "CODE"):
                                    label_text = attrib.dxf.text
                                    x, y = entity.dxf.insert[0], entity.dxf.insert[1]
                                    break

                    if label_text:
                        room_code = label_text.strip().upper()
                        labels[room_code] = (x, y, label_text)
                except (AttributeError, IndexError):
                    continue
        except Exception:
            pass

        return labels

    def _match_label_to_polygon(
        self,
        polygon: Polygon,
        labels: dict[str, tuple[float, float, Optional[str]]],
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Find room code and name for a polygon by spatial containment of label point.
        """
        for room_code, (label_x, label_y, label_text) in labels.items():
            point = Point(label_x, label_y)
            if polygon.contains(point):
                return room_code, label_text
        return None, None

    def _calculate_net_area(self, boundary: Polygon, void_islands: list[Polygon]) -> float:
        """
        Calculate net area by subtracting void islands (columns, shafts) from boundary.
        """
        net_area = boundary.area

        for void in void_islands:
            if boundary.contains(void):
                net_area -= void.area

        return round(net_area, 2)

    def export_geojson(self, rooms: dict[str, ExtractedRoom]) -> dict:
        """
        Export extracted rooms as GeoJSON FeatureCollection.
        """
        features = []
        for room in rooms.values():
            feature = {
                "type": "Feature",
                "properties": {
                    "room_code": room.room_code,
                    "room_name": room.room_name,
                    "net_area_m2": room.net_area_m2,
                    "label_anchor": room.label_anchor,
                    "center_point": room.center_point,
                },
                "geometry": room.geometry_geojson,
            }
            features.append(feature)

        return {
            "type": "FeatureCollection",
            "features": features,
        }

    def export_svg(
        self,
        rooms: dict[str, ExtractedRoom],
        width: int = 1200,
        height: int = 800,
    ) -> str:
        """
        Export extracted rooms as SVG with viewBox alignment and label anchors.
        """
        if not rooms:
            return '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"></svg>'

        all_bounds = [room.bounding_box for room in rooms.values()]
        min_x = min(b["coordinates"][0][0] for b in all_bounds)
        min_y = min(b["coordinates"][0][1] for b in all_bounds)
        max_x = max(b["coordinates"][1][0] for b in all_bounds)
        max_y = max(b["coordinates"][1][1] for b in all_bounds)

        viewbox = f"{min_x} {min_y} {max_x - min_x} {max_y - min_y}"

        svg_root = ET.Element("svg", {
            "xmlns": "http://www.w3.org/2000/svg",
            "viewBox": viewbox,
            "width": str(width),
            "height": str(height),
            "preserveAspectRatio": "xMidYMid meet",
        })

        ET.SubElement(svg_root, "defs").append(
            ET.fromstring('<style type="text/css">'
                         '.room-path{fill:lightblue;stroke:darkblue;stroke-width:2;}'
                         '.room-label{font-size:12;font-family:Arial;fill:darkblue;}'
                         '</style>')
        )

        for room in rooms.values():
            path_data = self._polygon_to_svg_path(room.geometry_geojson)
            ET.SubElement(svg_root, "path", {
                "d": path_data,
                "class": "room-path",
                "data-room-code": room.room_code,
            })

            anchor_x, anchor_y = room.label_anchor
            ET.SubElement(svg_root, "text", {
                "x": str(anchor_x),
                "y": str(anchor_y),
                "class": "room-label",
                "text-anchor": "middle",
            }).text = f"{room.room_code}\n{room.net_area_m2}m²"

        return ET.tostring(svg_root, encoding="unicode")

    @staticmethod
    def _polygon_to_svg_path(geojson: dict) -> str:
        """Convert GeoJSON Polygon to SVG path data string."""
        coords = geojson.get("coordinates", [])
        if not coords:
            return ""

        path_parts = []
        for ring_idx, ring in enumerate(coords):
            if not ring:
                continue
            move_cmd = "M" if ring_idx == 0 else "M"
            path_parts.append(f"{move_cmd} {ring[0][0]} {ring[0][1]}")
            for point in ring[1:]:
                path_parts.append(f"L {point[0]} {point[1]}")
            path_parts.append("Z")

        return " ".join(path_parts)

    @staticmethod
    def convert_dwg_to_dxf_oda(dwg_path: Path) -> DWGConversionResult:
        """
        Convert .dwg to .dxf using ODA File Converter CLI.

        Requires: ODA File Converter installed and 'ODAFileConverter' in PATH.
        """
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                output_dir = Path(tmpdir)
                output_path = output_dir / f"{dwg_path.stem}.dxf"

                cmd = [
                    "ODAFileConverter",
                    str(dwg_path),
                    str(output_dir),
                    "ACAD2021",
                    "DXF",
                ]

                result = subprocess.run(cmd, capture_output=True, timeout=60, check=True)

                if output_path.exists():
                    with open(output_path, "rb") as src:
                        dxf_content = src.read()
                    return DWGConversionResult(
                        success=True,
                        dxf_path=output_path,
                        converter_used="ODA File Converter",
                    )
                else:
                    return DWGConversionResult(
                        success=False,
                        error_message="ODA File Converter did not produce output",
                        converter_used="ODA File Converter",
                    )

        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError) as e:
            return DWGConversionResult(
                success=False,
                error_message=f"DWG conversion failed: {str(e)}",
                converter_used="ODA File Converter",
            )

    @staticmethod
    def convert_dwg_to_dxf_libredwg(dwg_path: Path) -> DWGConversionResult:
        """
        Convert .dwg to .dxf using LibreDWG CLI (dwg2dxf).

        Requires: LibreDWG installed and 'dwg2dxf' in PATH.
        """
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                output_dir = Path(tmpdir)
                output_path = output_dir / f"{dwg_path.stem}.dxf"

                cmd = ["dwg2dxf", str(dwg_path), str(output_path)]

                result = subprocess.run(cmd, capture_output=True, timeout=60, check=True)

                if output_path.exists():
                    with open(output_path, "rb") as src:
                        dxf_content = src.read()
                    return DWGConversionResult(
                        success=True,
                        dxf_path=output_path,
                        converter_used="LibreDWG",
                    )
                else:
                    return DWGConversionResult(
                        success=False,
                        error_message="LibreDWG did not produce output",
                        converter_used="LibreDWG",
                    )

        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError) as e:
            return DWGConversionResult(
                success=False,
                error_message=f"LibreDWG conversion failed: {str(e)}",
                converter_used="LibreDWG",
            )
