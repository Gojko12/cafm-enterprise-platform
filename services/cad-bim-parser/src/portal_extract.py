import json
import sys
from pathlib import Path

import ezdxf
from shapely.geometry import shape

from dxf_area_parser import DXFAreaParser, RoomExtractionConfig, UnitScale
from desk_extractor import DeskExtractor, DeskExtractionConfig


def extract(path: Path) -> dict:
    drawing = ezdxf.readfile(path)
    units = drawing.header.get("$INSUNITS", 0)
    scales = {2: UnitScale.FT, 4: UnitScale.MM, 5: UnitScale.CM, 6: UnitScale.M}
    if units not in scales:
        raise ValueError(f"Unsupported or unspecified DXF drawing units: {units}")
    scale = scales[units]
    parser = DXFAreaParser(RoomExtractionConfig(
        unit_scale=scale,
        boundary_layers=["RM$", "A-AREA-BOUNDARY", "ROOM_POLYGONS", "BOUNDARIES"],
    ))
    rooms = parser.parse_dxf_file(path)
    if not rooms:
        raise ValueError("No room boundaries found on the configured layers")
    desks = DeskExtractor(DeskExtractionConfig(unit_scale=float(scale.value))).extract_desks_from_dxf(
        path, {code: shape(room.geometry_geojson) for code, room in rooms.items()}
    )
    if desks.error_message:
        raise ValueError(desks.error_message)
    return {
        "rooms": [
            {"RoomCode": room.room_code, "Name": room.room_name or room.room_code,
             "NetAreaM2": room.net_area_m2, "Polygon": room.geometry_geojson}
            for room in rooms.values()
        ],
        "geojson": parser.export_geojson(rooms),
        "svg": parser.export_svg(rooms),
        "desks": [desk.model_dump() for desk in desks.desks],
        "unmatchedDesks": [desk.model_dump() for desk in desks.unmatched_desks],
        "units": units,
        "engine": "python",
    }


if __name__ == "__main__":
    try:
        print(json.dumps(extract(Path(sys.argv[1]))))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
