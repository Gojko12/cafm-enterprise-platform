"""
src/main.py

Firebase Cloud Functions v2 (Python) entrypoints for CAD/BIM parsing.
Exposes HTTP and Storage trigger functions for uploading DXF, DWG, and IFC files.
"""

import io
import json
from pathlib import Path
from typing import Optional

try:
    from firebase_functions import storage_fn, https_fn
    from firebase_admin import initialize_app, storage
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False

from src.dxf_area_parser import DXFAreaParser, RoomExtractionConfig
from src.desk_extractor import DeskExtractor, DeskExtractionConfig
from src.ifc_metadata_parser import IFCMetadataParser
from src.firestore_sync import FirestoreSync, FirestoreSyncConfig


if FIREBASE_AVAILABLE:
    initialize_app()

    @storage_fn.on_finalized()
    def process_floor_plan_cad_upload(event: storage_fn.CloudEvent) -> None:
        """
        Storage trigger: Process uploaded DXF floor plan files.

        Triggered when a .dxf file is uploaded to gs://bucket/floor-plans/

        Extracts room boundaries, calculates net areas, and syncs to Firestore.
        """
        file_path = event.data["name"]
        bucket_name = event.data["bucket"]

        if not (file_path.endswith(".dxf") or file_path.endswith(".dwg")):
            return

        try:
            bucket = storage.bucket(bucket_name)
            blob = bucket.blob(file_path)

            with io.BytesIO() as temp_file:
                blob.download_to_file(temp_file)
                temp_file.seek(0)

                temp_path = Path(f"/tmp/{blob.name.split('/')[-1]}")
                with open(temp_path, "wb") as f:
                    f.write(temp_file.getvalue())

            dxf_parser = DXFAreaParser(RoomExtractionConfig())
            rooms = dxf_parser.parse_dxf_file(temp_path)

            geojson = dxf_parser.export_geojson(rooms)
            svg = dxf_parser.export_svg(rooms)

            bl_id = file_path.split("/")[1]
            level_name = file_path.split("/")[2].replace(".dxf", "").replace(".dwg", "")

            sync_config = FirestoreSyncConfig(
                project_id="cafm-enterprise",
                dry_run=False,
            )
            firestore_sync = FirestoreSync(sync_config)
            diff = firestore_sync.sync_rooms(rooms, bl_id, level_name)

            geojson_blob = bucket.blob(f"floor-plans/{bl_id}/{level_name}.geojson")
            geojson_blob.upload_from_string(
                json.dumps(geojson),
                content_type="application/json"
            )

            svg_blob = bucket.blob(f"floor-plans/{bl_id}/{level_name}.svg")
            svg_blob.upload_from_string(svg, content_type="image/svg+xml")

        except Exception as e:
            print(f"Error processing CAD upload: {str(e)}")
            raise

    @https_fn.on_request()
    def preview_cad_extraction_dry_run(req: https_fn.Request) -> https_fn.Response:
        """
        HTTP endpoint: Preview CAD extraction in dry-run mode.

        POST /preview_cad_extraction_dry_run
        Content-Type: multipart/form-data
        Form data:
          - file: DXF file
          - bl_id: Building ID
          - level_name: Floor level name

        Returns:
          JSON with extracted rooms, GeoJSON, and dry-run diff
        """
        if req.method != "POST":
            return https_fn.Response("Method not allowed", status_code=405)

        try:
            file = req.files.get("file")
            bl_id = req.form.get("bl_id")
            level_name = req.form.get("level_name")

            if not all([file, bl_id, level_name]):
                return https_fn.Response("Missing required parameters", status_code=400)

            temp_path = Path(f"/tmp/{file.filename}")
            file.save(str(temp_path))

            dxf_parser = DXFAreaParser(RoomExtractionConfig())
            rooms = dxf_parser.parse_dxf_file(temp_path)

            geojson = dxf_parser.export_geojson(rooms)

            sync_config = FirestoreSyncConfig(
                project_id="cafm-enterprise",
                dry_run=True,
            )
            firestore_sync = FirestoreSync(sync_config)
            diff = firestore_sync.sync_rooms(rooms, bl_id, level_name)

            report = firestore_sync.generate_dry_run_report(diff)
            report["geojson_preview"] = geojson
            report["rooms_extracted"] = len(rooms)

            return https_fn.Response(
                json.dumps(report, indent=2),
                status_code=200,
                content_type="application/json"
            )

        except Exception as e:
            return https_fn.Response(
                json.dumps({"error": str(e)}),
                status_code=500,
                content_type="application/json"
            )

    @https_fn.on_request()
    def process_bim_ifc_upload(req: https_fn.Request) -> https_fn.Response:
        """
        HTTP endpoint: Process IFC BIM file upload.

        POST /process_bim_ifc_upload
        Content-Type: multipart/form-data
        Form data:
          - file: IFC file
          - bl_id: Building ID

        Returns:
          JSON with extracted building hierarchy and equipment metadata
        """
        if req.method != "POST":
            return https_fn.Response("Method not allowed", status_code=405)

        try:
            file = req.files.get("file")
            bl_id = req.form.get("bl_id")

            if not all([file, bl_id]):
                return https_fn.Response("Missing required parameters", status_code=400)

            temp_path = Path(f"/tmp/{file.filename}")
            file.save(str(temp_path))

            ifc_parser = IFCMetadataParser()
            result = ifc_parser.parse_ifc_file(temp_path)

            if not result.success:
                return https_fn.Response(
                    json.dumps({"error": result.error_message}),
                    status_code=400,
                    content_type="application/json"
                )

            response_data = {
                "building_code": result.building_metadata.building_code,
                "building_name": result.building_metadata.building_name,
                "floors_count": len(result.building_metadata.floors),
                "entity_count": result.entity_count,
                "parser_used": result.parser_used,
            }

            return https_fn.Response(
                json.dumps(response_data, indent=2),
                status_code=200,
                content_type="application/json"
            )

        except Exception as e:
            return https_fn.Response(
                json.dumps({"error": str(e)}),
                status_code=500,
                content_type="application/json"
            )
