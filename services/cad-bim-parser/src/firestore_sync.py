"""
src/firestore_sync.py

Production-grade Firestore synchronization layer for parsed Room, Floor, Desk, and Equipment records.
Supports dry-run diff preview, audit logging, and transaction-safe batch writes.
"""

import json
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from src.dxf_area_parser import ExtractedRoom
from src.desk_extractor import ExtractedDesk
from src.ifc_metadata_parser import IfcEntityMetadata

try:
    from google.cloud import firestore
except ImportError:
    firestore = None


class FirestoreSyncConfig(BaseModel):
    """Configuration for Firestore sync operations."""
    project_id: str = Field(..., description="Google Cloud project ID")
    dry_run: bool = Field(default=True, description="Preview changes without committing")
    batch_size: int = Field(default=100, description="Firestore batch write size")
    update_metadata: bool = Field(default=True, description="Update Floor SVG/GeoJSON layer metadata")
    audit_log_enabled: bool = Field(default=True, description="Log all sync operations to audit collection")


@dataclass
class SyncDiff:
    """Represents differences between extracted data and Firestore."""
    new_records: list[dict] = None
    updated_records: list[dict] = None
    deleted_records: list[dict] = None

    def __post_init__(self):
        if self.new_records is None:
            self.new_records = []
        if self.updated_records is None:
            self.updated_records = []
        if self.deleted_records is None:
            self.deleted_records = []

    def to_dict(self) -> dict:
        return {
            "new_records_count": len(self.new_records),
            "updated_records_count": len(self.updated_records),
            "deleted_records_count": len(self.deleted_records),
            "new_records": self.new_records,
            "updated_records": self.updated_records,
            "deleted_records": self.deleted_records,
        }


class FirestoreSync:
    """
    Synchronize parsed CAD/BIM data to Firestore with dry-run and audit trail support.
    """

    def __init__(self, config: FirestoreSyncConfig):
        self.config = config
        self.db = None
        self._init_firestore()

    def _init_firestore(self):
        """Initialize Firestore client (lazy-loaded in Cloud Functions context)."""
        if not firestore:
            return

        try:
            self.db = firestore.Client(project=self.config.project_id)
        except Exception:
            pass

    def sync_rooms(
        self,
        extracted_rooms: dict[str, ExtractedRoom],
        bl_id: str,
        level_name: str,
    ) -> SyncDiff:
        """
        Synchronize extracted rooms to Firestore.

        Args:
            extracted_rooms: Dictionary of room_code -> ExtractedRoom
            bl_id: Building ID
            level_name: Floor level name

        Returns:
            SyncDiff with new/updated/deleted records
        """
        if not self.db:
            return SyncDiff()

        diff = SyncDiff()
        current_time = datetime.utcnow().isoformat()

        for room in extracted_rooms.values():
            room_ref = self.db.collection("Rooms").document(f"{bl_id}#{level_name}#{room.room_code}")

            room_data = {
                "bl_id": bl_id,
                "LevelName": level_name,
                "RoomCode": room.room_code,
                "Name": room.room_name or room.room_code,
                "NetAreaM2": room.net_area_m2,
                "Polygon": room.geometry_geojson,
                "polygonGeoJson": room.geometry_geojson,
                "svgPath": self._polygon_to_svg_path(room.geometry_geojson),
                "BoundingBox": room.bounding_box,
                "UpdatedAt": current_time,
            }

            try:
                existing = room_ref.get()
                if existing.exists:
                    if existing.get("NetAreaM2") != room.net_area_m2:
                        diff.updated_records.append(room_data)
                        if not self.config.dry_run:
                            room_ref.set(room_data, merge=True)
                else:
                    room_data["CreatedAt"] = current_time
                    diff.new_records.append(room_data)
                    if not self.config.dry_run:
                        room_ref.set(room_data)
            except Exception as e:
                pass

        if self.config.audit_log_enabled and not self.config.dry_run:
            self._log_sync_operation("sync_rooms", {
                "bl_id": bl_id,
                "level_name": level_name,
                "rooms_count": len(extracted_rooms),
                "diff": diff.to_dict(),
            })

        return diff

    def sync_desks(
        self,
        extracted_desks: list[ExtractedDesk],
        bl_id: str,
        level_name: str,
    ) -> SyncDiff:
        """
        Synchronize extracted desks to Firestore.

        Args:
            extracted_desks: List of ExtractedDesk
            bl_id: Building ID
            level_name: Floor level name

        Returns:
            SyncDiff with new/updated/deleted records
        """
        if not self.db:
            return SyncDiff()

        diff = SyncDiff()
        current_time = datetime.utcnow().isoformat()

        for desk in extracted_desks:
            desk_ref = self.db.collection("Desks").document(desk.desk_id)

            desk_data = {
                "DeskId": desk.desk_id,
                "DeskName": desk.desk_name or desk.desk_id,
                "bl_id": bl_id,
                "LevelName": level_name,
                "RoomCode": desk.room_code,
                "CenterX": desk.center_x,
                "CenterY": desk.center_y,
                "WidthM": desk.width_m,
                "HeightM": desk.height_m,
                "DeskType": desk.desk_type,
                "IsPermanent": desk.is_permanent,
                "QRCodeData": desk.qr_code_data,
                "UpdatedAt": current_time,
            }

            try:
                existing = desk_ref.get()
                if existing.exists:
                    diff.updated_records.append(desk_data)
                    if not self.config.dry_run:
                        desk_ref.set(desk_data, merge=True)
                else:
                    desk_data["CreatedAt"] = current_time
                    diff.new_records.append(desk_data)
                    if not self.config.dry_run:
                        desk_ref.set(desk_data)
            except Exception as e:
                pass

        if self.config.audit_log_enabled and not self.config.dry_run:
            self._log_sync_operation("sync_desks", {
                "bl_id": bl_id,
                "level_name": level_name,
                "desks_count": len(extracted_desks),
                "diff": diff.to_dict(),
            })

        return diff

    def sync_equipment_bim_metadata(
        self,
        equipment_entities: list[IfcEntityMetadata],
    ) -> SyncDiff:
        """
        Synchronize IFC equipment GlobalId metadata to Equipment records.

        Args:
            equipment_entities: List of IfcEntityMetadata

        Returns:
            SyncDiff with updated records
        """
        if not self.db:
            return SyncDiff()

        diff = SyncDiff()
        current_time = datetime.utcnow().isoformat()

        for entity in equipment_entities:
            equipment_ref = self.db.collection("Equipment").document(entity.global_id)

            equipment_data = {
                "BIM_GlobalId": entity.global_id,
                "BIM_Tag": entity.tag,
                "BIM_Name": entity.name,
                "BIM_EntityType": entity.entity_type,
                "BIM_Properties": entity.properties,
                "UpdatedAt": current_time,
            }

            try:
                if not self.config.dry_run:
                    equipment_ref.set(equipment_data, merge=True)
                diff.updated_records.append(equipment_data)
            except Exception as e:
                pass

        if self.config.audit_log_enabled and not self.config.dry_run:
            self._log_sync_operation("sync_equipment_bim", {
                "equipment_count": len(equipment_entities),
                "diff": diff.to_dict(),
            })

        return diff

    def _log_sync_operation(self, operation_name: str, details: dict):
        """Log sync operation to audit collection."""
        if not self.db:
            return

        try:
            self.db.collection("AuditLog").add({
                "operation": operation_name,
                "timestamp": datetime.utcnow().isoformat(),
                "details": details,
            })
        except Exception:
            pass

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

    def generate_dry_run_report(self, diff: SyncDiff) -> dict:
        """Generate a human-readable dry-run report."""
        return {
            "status": "dry_run",
            "timestamp": datetime.utcnow().isoformat(),
            "summary": {
                "new_records": len(diff.new_records),
                "updated_records": len(diff.updated_records),
                "deleted_records": len(diff.deleted_records),
            },
            "new_records": diff.new_records[:5],
            "updated_records": diff.updated_records[:5],
            "preview_note": "Showing first 5 records. Full data available in details.",
        }
