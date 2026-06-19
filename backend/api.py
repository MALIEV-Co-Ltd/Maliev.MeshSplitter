from fastapi import APIRouter, UploadFile, File, HTTPException
from schemas import MeshInfo, SplitConfig, ConnectorConfig, SplitResult, ChunkInfo, ErrorResponse
from typing import List
import io
import zipfile
import trimesh
import numpy as np

router = APIRouter()

current_mesh = None
current_chunks = []
current_filename = ""


@router.post("/upload", response_model=MeshInfo)
async def upload_stl(file: UploadFile = File(...)):
    global current_mesh, current_filename
    if not file.filename.endswith(".stl"):
        raise HTTPException(400, detail="Only STL files are supported")
    content = await file.read()
    mesh = trimesh.load(io.BytesIO(content), file_type="stl")
    current_mesh = mesh
    current_filename = file.filename
    bbox = mesh.bounds.flatten().tolist() if mesh.bounds is not None else [0.0] * 6
    return MeshInfo(
        filename=file.filename,
        vertex_count=len(mesh.vertices),
        face_count=len(mesh.faces),
        is_watertight=mesh.is_watertight,
        bbox=bbox,
        volume=mesh.volume,
    )


def _mesh_to_chunk_info(mesh, index: int) -> ChunkInfo:
    bbox = mesh.bounds.flatten().tolist() if mesh.bounds is not None else [0.0] * 6
    return ChunkInfo(
        index=index,
        label=f"chunk_{index:04d}",
        bbox=bbox,
        volume=mesh.volume,
        is_watertight=mesh.is_watertight,
    )


@router.post("/split", response_model=SplitResult)
async def split_mesh(config: SplitConfig):
    global current_mesh, current_chunks
    if current_mesh is None:
        raise HTTPException(400, detail="No mesh uploaded")
    from slicer import split_mesh_grid
    current_chunks = split_mesh_grid(current_mesh, config.grid_divisions)
    original_bbox = current_mesh.bounds.flatten().tolist()
    chunks_info = [_mesh_to_chunk_info(c, i) for i, c in enumerate(current_chunks)]
    return SplitResult(
        chunks=chunks_info,
        original_bbox=original_bbox,
        grid_divisions=config.grid_divisions,
    )


@router.post("/connectors", response_model=SplitResult)
async def add_connectors(config: ConnectorConfig):
    global current_chunks
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to add connectors to")
    from connectorator import add_connectors
    current_chunks = add_connectors(current_chunks, config)
    chunks_info = [_mesh_to_chunk_info(c, i) for i, c in enumerate(current_chunks)]
    first_bbox = current_chunks[0].bounds.flatten().tolist() if current_chunks[0].bounds is not None else [0.0] * 6
    return SplitResult(
        chunks=chunks_info,
        original_bbox=first_bbox,
        grid_divisions=[0, 0, 0],
    )


@router.post("/export-stl")
async def export_stl():
    global current_chunks, current_filename
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to export")
    buf = io.BytesIO()
    base = current_filename.replace(".stl", "") if current_filename else "mesh"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, chunk in enumerate(current_chunks):
            stl_buf = io.BytesIO()
            chunk.export(stl_buf, file_type="stl")
            stl_buf.seek(0)
            zf.writestr(f"{base}_chunk_{i:04d}.stl", stl_buf.read())
    buf.seek(0)
    from starlette.responses import StreamingResponse
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base}_chunks.zip"'},
    )


@router.post("/export-pdf")
async def export_pdf():
    global current_chunks, current_mesh, current_filename
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to export")
    from pdfgen import generate_assembly_pdf
    base = current_filename.replace(".stl", "") if current_filename else "mesh"
    pdf_buf = generate_assembly_pdf(current_chunks, current_mesh, base)
    from starlette.responses import StreamingResponse
    return StreamingResponse(
        iter([pdf_buf.getvalue()]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{base}_assembly.pdf"'},
    )


@router.get("/preview-all")
async def preview_all():
    global current_chunks
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to preview")
    result = []
    for i, chunk in enumerate(current_chunks):
        vertices = chunk.vertices.tolist() if hasattr(chunk, 'vertices') else []
        faces = chunk.faces.tolist() if hasattr(chunk, 'faces') else []
        result.append({
            "vertices": vertices,
            "faces": faces,
            "label": f"chunk_{i:04d}",
        })
    return result
