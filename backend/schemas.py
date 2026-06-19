from pydantic import BaseModel
from typing import List, Optional


class MeshInfo(BaseModel):
    filename: str
    vertex_count: int
    face_count: int
    is_watertight: bool
    bbox: List[float]
    volume: float


class SplitConfig(BaseModel):
    build_volume: List[float] = [250.0, 250.0, 250.0]
    grid_divisions: List[int] = [2, 2, 1]


class ConnectorConfig(BaseModel):
    connector_type: str = "dowel"
    diameter: float = 6.0
    depth: float = 8.0
    clearance: float = 0.2
    count_per_face: int = 2
    apply_to_all: bool = True


class ChunkInfo(BaseModel):
    index: int
    label: str
    bbox: List[float]
    volume: float
    is_watertight: bool


class SplitResult(BaseModel):
    chunks: List[ChunkInfo]
    original_bbox: List[float]
    grid_divisions: List[int]


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
