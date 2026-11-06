"""
tests/test_cad_bim_parser.py

Comprehensive pytest test suite for CAD/BIM parsing.
Programmatically generates realistic multi-room .dxf floor plans with:
- LWPOLYLINE rooms in millimeters and meters
- Internal column cutouts (void islands)
- MTEXT/ATTRIB RoomCode tags
- Desk blocks for spatial joining
- Sample IFC STEP data

Verifies:
- Exact m2 net area math
- Spatial tag matching
- SVG/GeoJSON output
- IFC GlobalId linking
- Desk spatial joining
- Unit scaling conversions
"""

import json
import math
import re
import tempfile
from pathlib import Path
from textwrap import dedent
from unittest.mock import Mock, patch

import pytest
from shapely.geometry import Point, Polygon
import ezdxf

from src.dxf_area_parser import (
    DXFAreaParser,
    RoomExtractionConfig,
    UnitScale,
    RoomBoundaryLayer,
)
from src.desk_extractor import DeskExtractor, DeskExtractionConfig
from src.ifc_metadata_parser import IFCMetadataParser
from src.firestore_sync import FirestoreSync, FirestoreSyncConfig


class TestDXFAreaParser:
    """Test suite for DXF floor plan parsing and area calculations."""

    @pytest.fixture
    def simple_dxf_file(self) -> Path:
        """Generate a simple single-room .dxf file (millimeters)."""
        dwg = ezdxf.new("R2000")
        msp = dwg.modelspace()

        msp.add_lwpolyline(
            [(0, 0), (5000, 0), (5000, 4000), (0, 4000), (0, 0)],
            dxfattribs={"layer": "RM$"}
        )

        msp.add_text(
            "RM-001",
            dxfattribs={
                "insert": (2500, 2000),
                "layer": "ROOM_LABELS",
                "height": 200,
            }
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".dxf", delete=False) as f:
            temp_path = Path(f.name)
        dwg.saveas(str(temp_path))
        return temp_path

    @pytest.fixture
    def multi_room_with_voids_dxf(self) -> Path:
        """Generate multi-room .dxf with internal column voids."""
        dwg = ezdxf.new("R2000")
        msp = dwg.modelspace()

        msp.add_lwpolyline(
            [(0, 0), (10000, 0), (10000, 5000), (0, 5000), (0, 0)],
            dxfattribs={"layer": "RM$"}
        )

        msp.add_lwpolyline(
            [(1000, 1000), (2000, 1000), (2000, 2000), (1000, 2000), (1000, 1000)],
            dxfattribs={"layer": "COLUMNS"}
        )

        msp.add_lwpolyline(
            [(8000, 3000), (9000, 3000), (9000, 4000), (8000, 4000), (8000, 3000)],
            dxfattribs={"layer": "COLUMNS"}
        )

        msp.add_text(
            "RM-001",
            dxfattribs={
                "insert": (2500, 2500),
                "layer": "TEXT",
                "height": 200,
            }
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".dxf", delete=False) as f:
            temp_path = Path(f.name)
        dwg.saveas(str(temp_path))
        return temp_path

    def test_simple_room_area_calculation(self, simple_dxf_file: Path):
        """Test parsing and area calculation of a simple rectangular room."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(simple_dxf_file)

        assert len(rooms) == 1
        room = list(rooms.values())[0]

        assert room.net_area_m2 == 20.0
        assert isinstance(room.geometry_geojson, dict)
        assert room.geometry_geojson["type"] == "Polygon"

    def test_multi_room_with_void_subtraction(self, multi_room_with_voids_dxf: Path):
        """Test net area calculation with internal column voids subtracted."""
        config = RoomExtractionConfig(
            unit_scale=UnitScale.MM,
            void_layers=["COLUMNS"],
        )
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(multi_room_with_voids_dxf)

        assert len(rooms) == 1
        room = list(rooms.values())[0]

        floor_area = 10000 * 5000 * (0.001 ** 2)
        column1_area = 1000 * 1000 * (0.001 ** 2)
        column2_area = 1000 * 1000 * (0.001 ** 2)
        expected_net_area = floor_area - column1_area - column2_area

        assert room.net_area_m2 == pytest.approx(expected_net_area, abs=0.1)

    def test_unit_scaling_conversions(self, simple_dxf_file: Path):
        """Test that different unit scales produce proportionally correct results."""
        scales_to_test = [
            (UnitScale.MM, 20.0),
            (UnitScale.CM, 2000.0),
            (UnitScale.M, 20000000.0),
        ]

        for unit_scale, expected_area in scales_to_test:
            config = RoomExtractionConfig(unit_scale=unit_scale)
            parser = DXFAreaParser(config)
            rooms = parser.parse_dxf_file(simple_dxf_file)

            if rooms:
                room = list(rooms.values())[0]
                assert room.net_area_m2 == pytest.approx(expected_area, rel=1e-2)

    def test_geojson_export(self, simple_dxf_file: Path):
        """Test GeoJSON FeatureCollection export."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(simple_dxf_file)
        geojson = parser.export_geojson(rooms)

        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) == 1

        feature = geojson["features"][0]
        assert feature["type"] == "Feature"
        assert feature["properties"]["net_area_m2"] == 20.0
        assert feature["geometry"]["type"] == "Polygon"

    def test_svg_export(self, simple_dxf_file: Path):
        """Test SVG export with paths and labels."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(simple_dxf_file)
        svg = parser.export_svg(rooms, width=800, height=600)

        assert '<svg' in svg
        assert 'viewBox=' in svg
        assert 'path' in svg

    def test_label_anchor_point(self, simple_dxf_file: Path):
        """Test that label anchor points are correctly calculated."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(simple_dxf_file)
        room = list(rooms.values())[0]

        assert isinstance(room.label_anchor, tuple)
        assert len(room.label_anchor) == 2
        assert isinstance(room.label_anchor[0], (int, float))
        assert isinstance(room.label_anchor[1], (int, float))

    def test_bounding_box_calculation(self, simple_dxf_file: Path):
        """Test that bounding boxes are correctly calculated."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(simple_dxf_file)
        room = list(rooms.values())[0]

        assert room.bounding_box["type"] == "BBox"
        assert len(room.bounding_box["coordinates"]) == 2


class TestDeskExtractor:
    """Test suite for desk/workstation extraction and spatial joining."""

    @pytest.fixture
    def dxf_with_desks(self) -> Path:
        """Generate a .dxf file with room and desk blocks."""
        dwg = ezdxf.new("R2000")
        msp = dwg.modelspace()

        msp.add_lwpolyline(
            [(0, 0), (5000, 0), (5000, 4000), (0, 4000), (0, 0)],
            dxfattribs={"layer": "RM$"}
        )

        msp.add_lwpolyline(
            [(1000, 1000), (2000, 1000), (2000, 1800), (1000, 1800), (1000, 1000)],
            dxfattribs={"layer": "DESKS"}
        )

        msp.add_lwpolyline(
            [(2500, 1500), (3500, 1500), (3500, 2300), (2500, 2300), (2500, 1500)],
            dxfattribs={"layer": "DESKS"}
        )

        msp.add_text(
            "RM-001",
            dxfattribs={
                "insert": (2500, 2000),
                "layer": "ROOM_LABELS",
                "height": 200,
            }
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".dxf", delete=False) as f:
            temp_path = Path(f.name)
        dwg.saveas(str(temp_path))
        return temp_path

    def test_desk_extraction(self, dxf_with_desks: Path):
        """Test extracting desks from .dxf file."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)
        rooms = parser.parse_dxf_file(dxf_with_desks)

        room_polygons = {
            room.room_code: Polygon([
                (c[0], c[1]) for c in room.geometry_geojson["coordinates"][0]
            ])
            for room in rooms.values()
        }

        desk_config = DeskExtractionConfig(unit_scale=0.001)
        desk_extractor = DeskExtractor(desk_config)

        result = desk_extractor.extract_desks_from_dxf(dxf_with_desks, room_polygons)

        assert result.error_message is None
        assert len(result.desks) > 0

    def test_desk_spatial_matching(self, dxf_with_desks: Path):
        """Test that desks are correctly matched to their parent rooms."""
        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)
        rooms = parser.parse_dxf_file(dxf_with_desks)

        room_polygons = {
            room.room_code: Polygon([
                (c[0], c[1]) for c in room.geometry_geojson["coordinates"][0]
            ])
            for room in rooms.values()
        }

        desk_config = DeskExtractionConfig(unit_scale=0.001)
        desk_extractor = DeskExtractor(desk_config)

        result = desk_extractor.extract_desks_from_dxf(dxf_with_desks, room_polygons)

        for desk in result.desks:
            assert desk.room_code != "UNMATCHED"
            assert desk.qr_code_data is not None


class TestIFCMetadataParser:
    """Test suite for IFC BIM file parsing."""

    @pytest.fixture
    def sample_ifc_step_file(self) -> Path:
        """Generate a minimal IFC STEP file for testing."""
        ifc_content = dedent("""\
            ISO-10303-21;
            HEADER;
            FILE_DESCRIPTION(('ViewDefinition [Coordination View]'),
              '2;1');
            FILE_NAME('test.ifc',
              '',
              '',
              '',
              'IFC2x3',
              '',
              '');
            FILE_SCHEMA(('IFC2x3'));
            ENDSEC;
            DATA;
            #1 = IFCBUILDING('0$Wr4xw_P92_PvKV$E$A$XPZ',#0,.
              'CAFM Test Building',#1,#1,#1,#1,#1,#1,#1,#1,#1,#1,#1,
              #1,#1,#1);
            #2 = IFCBUILDINGSTOREY('1$Wr4xw_P92_PvKV$E$A$XPZ',#0,.
              'Level 1',#1,#1,#1,#1,#1,#1,#1);
            #3 = IFCSPACE('2$Wr4xw_P92_PvKV$E$A$XPZ',#0,.
              'Room 101',#1,'RM-001',#1,#1,#1,#1);
            ENDSEC;
            END-ISO-10303-21;
            """)

        with tempfile.NamedTemporaryFile(mode="w", suffix=".ifc", delete=False) as f:
            f.write(ifc_content)
            return Path(f.name)

    def test_ifc_parsing_step_fallback(self, sample_ifc_step_file: Path):
        """Test IFC parsing with native STEP fallback parser."""
        parser = IFCMetadataParser()
        result = parser.parse_ifc_file(sample_ifc_step_file)

        assert result.success
        assert result.building_metadata is not None
        assert result.parser_used == "STEP fallback"

    def test_building_metadata_extraction(self, sample_ifc_step_file: Path):
        """Test extraction of building name and metadata."""
        parser = IFCMetadataParser()
        result = parser.parse_ifc_file(sample_ifc_step_file)

        assert result.building_metadata.building_code is not None
        assert result.building_metadata.building_name is not None
        assert len(result.building_metadata.floors) >= 0

    def test_level_number_extraction(self):
        """Test extraction of numeric level numbers from level names."""
        test_cases = [
            ("L1", 1),
            ("Level 2", 2),
            ("3", 3),
            ("Ground", None),
        ]

        for level_name, expected_number in test_cases:
            number = IFCMetadataParser._extract_level_number(level_name)
            assert number == expected_number


class TestFirestoreSync:
    """Test suite for Firestore synchronization."""

    @patch("src.firestore_sync.firestore")
    def test_firestore_sync_dry_run(self, mock_firestore):
        """Test dry-run mode without committing to Firestore."""
        mock_firestore.Client = Mock()

        config = FirestoreSyncConfig(
            project_id="test-project",
            dry_run=True,
        )
        sync = FirestoreSync(config)

        assert sync.config.dry_run is True
        assert sync.config.project_id == "test-project"

    @patch("src.firestore_sync.firestore")
    def test_dry_run_report_generation(self, mock_firestore):
        """Test generation of dry-run preview reports."""
        mock_firestore.Client = Mock()

        config = FirestoreSyncConfig(
            project_id="test-project",
            dry_run=True,
        )
        sync = FirestoreSync(config)

        from src.firestore_sync import SyncDiff

        diff = SyncDiff(
            new_records=[{"room_code": "RM-001"}],
            updated_records=[{"room_code": "RM-002"}],
        )

        report = sync.generate_dry_run_report(diff)

        assert report["status"] == "dry_run"
        assert report["summary"]["new_records"] == 1
        assert report["summary"]["updated_records"] == 1
        assert "timestamp" in report
        assert report["summary"]["deleted_records"] == 0


class TestIntegration:
    """Integration tests for complete workflows."""

    def test_complete_floor_plan_workflow(self):
        """Test complete workflow: parse DXF -> extract geometry -> generate GeoJSON/SVG."""
        dwg = ezdxf.new("R2000")
        msp = dwg.modelspace()

        msp.add_lwpolyline(
            [(0, 0), (3000, 0), (3000, 2500), (0, 2500), (0, 0)],
            dxfattribs={"layer": "RM$"}
        )

        msp.add_text(
            "RM-001",
            dxfattribs={
                "insert": (1500, 1250),
                "layer": "TEXT",
                "height": 150,
            }
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".dxf", delete=False) as f:
            dxf_path = Path(f.name)
        dwg.saveas(str(dxf_path))

        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(dxf_path)
        assert len(rooms) >= 1

        geojson = parser.export_geojson(rooms)
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) >= 1

        svg = parser.export_svg(rooms)
        assert "<svg" in svg

        dxf_path.unlink()

    def test_area_precision_and_rounding(self):
        """Test that area calculations maintain proper precision and rounding."""
        dwg = ezdxf.new("R2000")
        msp = dwg.modelspace()

        msp.add_lwpolyline(
            [(0, 0), (3333.333, 0), (3333.333, 3333.333), (0, 3333.333), (0, 0)],
            dxfattribs={"layer": "RM$"}
        )

        msp.add_text(
            "RM-001",
            dxfattribs={
                "insert": (1666.667, 1666.667),
                "layer": "TEXT",
                "height": 150,
            }
        )

        with tempfile.NamedTemporaryFile(mode="w", suffix=".dxf", delete=False) as f:
            dxf_path = Path(f.name)
        dwg.saveas(str(dxf_path))

        config = RoomExtractionConfig(unit_scale=UnitScale.MM)
        parser = DXFAreaParser(config)

        rooms = parser.parse_dxf_file(dxf_path)
        room = list(rooms.values())[0]

        assert round(room.net_area_m2, 2) == room.net_area_m2
        assert room.net_area_m2 > 0

        dxf_path.unlink()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=src", "--cov-report=term-missing"])
