"""
src/__init__.py
Enterprise CAFM Platform — CAD/BIM Parser Service
"""

__version__ = "3.0.0"
__author__ = "CAFM Engineering"

from src.dxf_area_parser import DXFAreaParser
from src.desk_extractor import DeskExtractor
from src.ifc_metadata_parser import IFCMetadataParser
from src.firestore_sync import FirestoreSync

__all__ = [
    "DXFAreaParser",
    "DeskExtractor",
    "IFCMetadataParser",
    "FirestoreSync",
]
