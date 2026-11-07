import ezdxf
import pytest
import json
import subprocess
import sys
from pathlib import Path

from src.dxf_area_parser import DXFAreaParser, RoomExtractionConfig, UnitScale


def test_closed_polylines_labels_and_overlapping_voids(tmp_path):
    drawing = ezdxf.new("R2010")
    model = drawing.modelspace()
    model.add_lwpolyline([(0, 0), (5000, 0), (5000, 4000), (0, 4000)], close=True, dxfattribs={"layer": "RM$"})
    model.add_lwpolyline([(1000, 1000), (3000, 1000), (3000, 2000), (1000, 2000)], close=True, dxfattribs={"layer": "COLUMNS"})
    model.add_lwpolyline([(2000, 1000), (4000, 1000), (4000, 2000), (2000, 2000)], close=True, dxfattribs={"layer": "COLUMNS"})
    model.add_text("RM-001", dxfattribs={"insert": (500, 500), "layer": "ROOM_LABELS"})
    filename = tmp_path / "rooms.dxf"
    drawing.saveas(filename)

    rooms = DXFAreaParser(RoomExtractionConfig(unit_scale=UnitScale.MM)).parse_dxf_file(filename)

    assert list(rooms) == ["RM-001"]
    assert rooms["RM-001"].net_area_m2 == pytest.approx(17.0)
    assert len(rooms["RM-001"].geometry_geojson["coordinates"]) == 2


def test_curved_room_boundary_is_rejected(tmp_path):
    drawing = ezdxf.new("R2010")
    drawing.modelspace().add_lwpolyline(
        [(0, 0, 1), (5000, 0, 0), (5000, 4000, 0), (0, 4000, 0)],
        format="xyb", close=True, dxfattribs={"layer": "RM$"},
    )
    filename = tmp_path / "curved.dxf"
    drawing.saveas(filename)
    with pytest.raises(ValueError, match="Curved room boundaries"):
        DXFAreaParser().parse_dxf_file(filename)


def test_portal_cli_extracts_labeled_rooms_and_desks(tmp_path):
    drawing = ezdxf.new("R2010")
    drawing.header["$INSUNITS"] = 4
    model = drawing.modelspace()
    model.add_lwpolyline([(0, 0), (5000, 0), (5000, 4000), (0, 4000)], close=True, dxfattribs={"layer": "RM$"})
    model.add_text("RM-001", dxfattribs={"insert": (500, 500), "layer": "ROOM_LABELS"})
    model.add_lwpolyline([(1000, 1000), (2000, 1000), (2000, 1500), (1000, 1500)], close=True, dxfattribs={"layer": "DESKS"})
    filename = tmp_path / "rooms.dxf"
    drawing.saveas(filename)

    script = Path(__file__).resolve().parents[1] / "src" / "portal_extract.py"
    result = subprocess.run([sys.executable, str(script), str(filename)], check=True, capture_output=True, text=True)
    parsed = json.loads(result.stdout)
    assert parsed["rooms"][0]["RoomCode"] == "RM-001"
    assert parsed["rooms"][0]["NetAreaM2"] == 20
    assert parsed["desks"][0]["room_code"] == "RM-001"
    assert parsed["geojson"]["features"][0]["geometry"]["type"] == "Polygon"


def test_portal_cli_rejects_unspecified_units(tmp_path):
    drawing = ezdxf.new("R2010")
    drawing.header["$INSUNITS"] = 0
    filename = tmp_path / "unitless.dxf"
    drawing.saveas(filename)
    script = Path(__file__).resolve().parents[1] / "src" / "portal_extract.py"
    result = subprocess.run([sys.executable, str(script), str(filename)], capture_output=True, text=True)
    assert result.returncode != 0
    assert "units" in result.stderr.lower()


def test_portal_sample_dxf_is_readable(tmp_path):
    filename = tmp_path / "sample.dxf"
    filename.write_text("\n".join([
        "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        "0", "LWPOLYLINE", "100", "AcDbEntity", "8", "RM$", "100", "AcDbPolyline", "90", "4", "70", "1",
        "10", "0", "20", "0", "10", "5000", "20", "0",
        "10", "5000", "20", "4000", "10", "0", "20", "4000",
        "0", "TEXT", "100", "AcDbEntity", "8", "ROOM_LABELS", "100", "AcDbText", "10", "2500", "20", "2000", "40", "200", "1", "RM-001",
        "0", "ENDSEC", "0", "EOF", "",
    ]))
    script = Path(__file__).resolve().parents[1] / "src" / "portal_extract.py"
    result = subprocess.run([sys.executable, str(script), str(filename)], check=True, capture_output=True, text=True)
    assert json.loads(result.stdout)["rooms"][0]["RoomCode"] == "RM-001"
