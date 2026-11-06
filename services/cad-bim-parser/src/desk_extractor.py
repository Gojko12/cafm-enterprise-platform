"""
src/desk_extractor.py

Production-grade desk/workstation extractor from floor plans.
Extracts desk block insertions or closed desk polygons and spatially joins to parent RoomCode.
Generates desk coordinates, QR check-in metadata, and DeskReservation records.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import ezdxf
from pydantic import BaseModel, Field
from shapely.geometry import Point, Polygon


class ExtractedDesk(BaseModel):
    """Extracted desk/workstation with parent room assignment."""
    desk_id: str = Field(..., description="Unique desk identifier (e.g., D-001-001)")
    desk_name: Optional[str] = Field(None, description="Human-readable desk name")
    room_code: str = Field(..., description="Parent RoomCode")
    center_x: float = Field(..., description="Desk center X coordinate")
    center_y: float = Field(..., description="Desk center Y coordinate")
    width_m: Optional[float] = Field(None, description="Desk width in meters")
    height_m: Optional[float] = Field(None, description="Desk depth in meters")
    desk_type: str = Field(default="Standard", description="Desk type (Standard, Standing, Meeting, etc.)")
    is_permanent: bool = Field(default=False, description="Permanent assignment vs. reservable")
    qr_code_data: Optional[str] = Field(None, description="QR code content (typically desk_id)")


class DeskExtractionConfig(BaseModel):
    """Configuration for desk extraction."""
    desk_layers: list[str] = Field(
        default_factory=lambda: ["DESKS", "FURNITURE", "A-FURN-DESK"],
        description="Layer names to search for desk entities"
    )
    desk_block_names: list[str] = Field(
        default_factory=lambda: ["DESK", "WORKSTATION", "TABLE"],
        description="Block names to search for desk INSERT entities"
    )
    unit_scale: float = Field(default=0.001, description="DXF unit to meters conversion")


@dataclass
class DeskSearchResult:
    """Result of desk extraction from DXF."""
    desks: list[ExtractedDesk]
    unmatched_desks: list[ExtractedDesk]
    error_message: Optional[str] = None


class DeskExtractor:
    """
    Extract desks/workstations from floor plans and spatially join to rooms.
    """

    def __init__(self, config: Optional[DeskExtractionConfig] = None):
        self.config = config or DeskExtractionConfig()

    def extract_desks_from_dxf(
        self,
        dxf_path: Path,
        room_polygons: dict[str, Polygon],
    ) -> DeskSearchResult:
        """
        Extract desks from DXF and spatially join to room polygons.

        Args:
            dxf_path: Path to .dxf file
            room_polygons: Dictionary mapping room_code -> Polygon

        Returns:
            DeskSearchResult with matched and unmatched desks
        """
        try:
            dwg = ezdxf.readfile(str(dxf_path))
        except Exception as e:
            return DeskSearchResult(
                desks=[],
                unmatched_desks=[],
                error_message=f"Failed to read DXF: {str(e)}",
            )

        msp = dwg.modelspace()
        unit_scale = self.config.unit_scale

        desks = self._extract_desk_entities(msp, unit_scale)

        matched_desks = []
        unmatched_desks = []

        for desk in desks:
            desk_point = Point(desk.center_x, desk.center_y)
            matched = False

            for room_code, room_polygon in room_polygons.items():
                if room_polygon.contains(desk_point):
                    desk.room_code = room_code
                    desk.qr_code_data = desk.desk_id
                    matched_desks.append(desk)
                    matched = True
                    break

            if not matched:
                unmatched_desks.append(desk)

        return DeskSearchResult(
            desks=matched_desks,
            unmatched_desks=unmatched_desks,
        )

    def _extract_desk_entities(self, msp: Any, unit_scale: float) -> list[ExtractedDesk]:
        """Extract desk entities (INSERT or LWPOLYLINE) from modelspace."""
        desks: list[ExtractedDesk] = []
        desk_counter = 1

        for entity in msp.query():
            if entity.dxf.layer not in self.config.desk_layers:
                continue

            if entity.dxftype() == "INSERT":
                if entity.dxf.name in self.config.desk_block_names:
                    x, y = entity.dxf.insert[0] * unit_scale, entity.dxf.insert[1] * unit_scale
                    desk_id = f"D-{desk_counter:03d}"

                    desk = ExtractedDesk(
                        desk_id=desk_id,
                        desk_name=None,
                        room_code="UNMATCHED",
                        center_x=x,
                        center_y=y,
                        desk_type="Standard",
                        is_permanent=False,
                    )
                    desks.append(desk)
                    desk_counter += 1

            elif entity.dxftype() == "LWPOLYLINE":
                coords = [
                    (p[0] * unit_scale, p[1] * unit_scale)
                    for p in entity.get_points()
                ]
                if len(coords) >= 4:
                    try:
                        poly = Polygon(coords)
                        if poly.is_valid:
                            centroid = poly.centroid
                            desk_id = f"D-{desk_counter:03d}"

                            desk = ExtractedDesk(
                                desk_id=desk_id,
                                desk_name=None,
                                room_code="UNMATCHED",
                                center_x=centroid.x,
                                center_y=centroid.y,
                                width_m=poly.bounds[2] - poly.bounds[0],
                                height_m=poly.bounds[3] - poly.bounds[1],
                                desk_type="Standard",
                                is_permanent=False,
                            )
                            desks.append(desk)
                            desk_counter += 1
                    except Exception:
                        pass

        return desks
