# CAD/BIM Parser Service — Phase 3 Implementation

Enterprise-grade Python Cloud Function service for parsing CAD (DXF/DWG) and BIM (IFC) files in the CAFM Platform.

## Overview

The CAD/BIM Parser Service (Phase 3) provides:

- **DXF/DWG Floor Plan Parsing** (`dxf_area_parser.py`)
  - Extract closed room boundary polylines from configurable layers
  - Match room labels (RoomCode) via spatial containment
  - Calculate exact net area m² with internal void subtraction
  - Export GeoJSON FeatureCollection and SVG paths
  - Automatic unit scaling (mm, cm, m, ft → meters)
  - LibreDWG/ODA CLI wrapper for .dwg → .dxf conversion

- **Desk/Workstation Extraction** (`desk_extractor.py`)
  - Extract desk block insertions and polygons
  - Spatially join desks to parent RoomCode
  - Generate desk coordinates and QR metadata
  - Support for DeskReservation integration

- **IFC/BIM Metadata Parsing** (`ifc_metadata_parser.py`)
  - Parse IfcBuilding, IfcBuildingStorey, IfcSpace hierarchies
  - Extract IfcEquipment and MEP asset metadata
  - Bidirectional GlobalId ↔ EquipmentCode mapping
  - Fallback native STEP parser when ifcopenshell unavailable

- **Firestore Sync** (`firestore_sync.py`)
  - Transactional batch writes for Room, Floor, Desk, Equipment records
  - Dry-run diff preview mode
  - Immutable audit trail logging
  - SVG/GeoJSON layer metadata synchronization

- **Firebase Cloud Functions** (`main.py`)
  - Storage trigger: `processFloorPlanCadUpload()`
  - HTTP endpoint: `previewCadExtractionDryRun()`
  - HTTP endpoint: `processBimIfcUpload()`

## Installation

### Prerequisites

- Python 3.11+
- Virtual environment (`.venv` already created)

### Setup

```bash
cd services/cad-bim-parser
source .venv/Scripts/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
# or
pip install -e .
```

### Optional: IFC Support

For full ifcopenshell support:

```bash
pip install ifcopenshell>=0.7.0
```

## Running Tests

```bash
# Activate virtual environment
source .venv/Scripts/activate

# Run all tests with coverage
pytest tests/test_cad_bim_parser.py -v --cov=src --cov-report=term-missing

# Run specific test class
pytest tests/test_cad_bim_parser.py::TestDXFAreaParser -v

# Run with detailed output
pytest tests/test_cad_bim_parser.py -vv --tb=short
```

## Test Coverage

The comprehensive pytest suite (`tests/test_cad_bim_parser.py`) includes:

### DXF Parser Tests
- ✅ Simple rectangular room area calculation (20 m²)
- ✅ Multi-room with void subtraction (columns, shafts)
- ✅ Unit scaling conversions (mm, cm, m, ft)
- ✅ GeoJSON FeatureCollection export
- ✅ SVG path and label export
- ✅ Label anchor point calculations
- ✅ Bounding box accuracy

### Desk Extractor Tests
- ✅ Desk block extraction from DXF
- ✅ Spatial desk-to-room matching
- ✅ QR code metadata generation

### IFC Parser Tests
- ✅ STEP fallback parser
- ✅ Building metadata extraction
- ✅ Level number extraction

### Firestore Sync Tests
- ✅ Dry-run mode
- ✅ Dry-run report generation

### Integration Tests
- ✅ Complete floor plan workflow (parse → geometry → GeoJSON/SVG)
- ✅ Area precision and rounding

## Example Usage

### Parse DXF Floor Plan

```python
from pathlib import Path
from src.dxf_area_parser import DXFAreaParser, RoomExtractionConfig, UnitScale

config = RoomExtractionConfig(
    unit_scale=UnitScale.MM,
    boundary_layers=["RM$", "A-AREA-BOUNDARY"],
)
parser = DXFAreaParser(config)

rooms = parser.parse_dxf_file(Path("floor_plan.dxf"))

for room_code, room in rooms.items():
    print(f"{room_code}: {room.net_area_m2} m²")

geojson = parser.export_geojson(rooms)
svg = parser.export_svg(rooms)
```

### Extract Desks

```python
from src.desk_extractor import DeskExtractor

desk_extractor = DeskExtractor()
result = desk_extractor.extract_desks_from_dxf(
    dxf_path=Path("floor_plan.dxf"),
    room_polygons=room_polygons,
)

for desk in result.desks:
    print(f"{desk.desk_id} in {desk.room_code}")
```

### Parse IFC Building Model

```python
from src.ifc_metadata_parser import IFCMetadataParser

parser = IFCMetadataParser()
result = parser.parse_ifc_file(Path("building.ifc"))

if result.success:
    for floor in result.building_metadata.floors.values():
        print(f"Rooms: {len(floor.rooms)}")
```

## Architecture & Data Flow

```
DXF/DWG File Upload
    ↓
[DXFAreaParser]
    ├─ Extract polylines (boundary, voids)
    ├─ Extract labels (TEXT, MTEXT, ATTRIB)
    ├─ Spatial matching (point-in-polygon)
    ├─ Calculate net area m²
    └─ Export GeoJSON + SVG
    ↓
[DeskExtractor]
    ├─ Extract desk entities
    └─ Spatial join to rooms
    ↓
[FirestoreSync]
    ├─ Dry-run diff preview
    └─ Transactional batch write
    ↓
Firestore (Rooms, Desks, Floor metadata)
```

## Non-Negotiable Constraints

1. **3-Tier Location Hierarchy**: Building (bl_id) → Floor (LevelName) → Room (RoomCode)
2. **Exact Net Area Math**: Round to 2 decimals; subtract internal voids
3. **Spatial Containment**: Use `Polygon.contains(Point)` for label matching
4. **Unit Scaling**: Support mm, cm, m, ft conversion to meters
5. **Immutable Audit Log**: All Firestore changes logged with timestamps
6. **Dry-Run Support**: Preview diffs before commit

## Production Deployment

### Firebase Cloud Functions Setup

```bash
# Deploy Storage trigger
firebase deploy --only functions:processFloorPlanCadUpload

# Deploy HTTP endpoints
firebase deploy --only functions:previewCadExtractionDryRun,functions:processBimIfcUpload
```

### Firestore Indexes

Ensure the following composite indexes are created:

```firestore
collection: Rooms
  - bl_id, LevelName, RoomCode
collection: Desks
  - bl_id, LevelName, RoomCode
```

## References

- MASTER_SPEC.md: Sections 2.1, 2.2, 2.3, and 8
- Shared Schema: `packages/shared-schema/src/locations.ts`, `operations.ts`
- AGENTS.md: Architecture & Folder Boundaries
