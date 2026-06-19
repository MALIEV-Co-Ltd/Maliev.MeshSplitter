from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from schemas import MeshInfo, SplitConfig, ConnectorConfig, SplitResult, ChunkInfo
from typing import List, Optional
import tempfile, os, io, zipfile, trimesh

router = APIRouter()

current_mesh: Optional[trimesh.Trimesh] = None
current_chunks: List[dict] = []
current_filename: str = ""


@router.post("/upload", response_model=MeshInfo)
async def upload_stl(file: UploadFile = File(...)):
    global current_mesh, current_filename
    if not file.filename.endswith(".stl"):
        raise HTTPException(400, detail="Only STL files are supported")
    content = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        mesh = trimesh.load(tmp_path)
        if not isinstance(mesh, trimesh.Trimesh):
            mesh = mesh.dump(concatenate=True)
        current_mesh = mesh
        current_filename = file.filename
        bbox = mesh.bounds.flatten().tolist() if mesh.bounds is not None else [0.0] * 6
        return MeshInfo(
            filename=file.filename,
            vertex_count=len(mesh.vertices),
            face_count=len(mesh.faces),
            is_watertight=mesh.is_watertight,
            bbox=bbox,
            volume=mesh.volume if mesh.is_watertight else 0.0,
        )
    finally:
        os.unlink(tmp_path)


def _chunks_to_result(chunks: List[dict], orig_bbox=None, grid_div=None) -> SplitResult:
    return SplitResult(
        chunks=[ChunkInfo(
            index=i,
            label=c["label"],
            bbox=c["mesh"].bounds.flatten().tolist() if c["mesh"].bounds is not None else [0.0]*6,
            volume=c["mesh"].volume,
            is_watertight=c["mesh"].is_watertight,
        ) for i, c in enumerate(chunks)],
        original_bbox=orig_bbox or [],
        grid_divisions=grid_div or [],
    )


@router.post("/split", response_model=SplitResult)
async def split_mesh(config: SplitConfig):
    global current_mesh, current_chunks
    if current_mesh is None:
        raise HTTPException(400, detail="No mesh uploaded")
    if not current_mesh.is_watertight:
        raise HTTPException(400, detail="Mesh must be watertight")
    from slicer import split_mesh_grid
    current_chunks, orig_bbox = split_mesh_grid(current_mesh, config.build_volume, config.grid_divisions)
    return _chunks_to_result(current_chunks, list(orig_bbox), config.grid_divisions)


@router.post("/connectors", response_model=SplitResult)
async def add_connectors(config: ConnectorConfig):
    global current_chunks
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to add connectors to")
    from connectorator import add_connectors
    current_chunks = add_connectors(current_chunks, config)
    return _chunks_to_result(current_chunks)


@router.post("/export-stl")
async def export_stl():
    global current_chunks, current_filename
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to export")
    buf = io.BytesIO()
    base = current_filename.replace(".stl", "") if current_filename else "mesh"
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for c in current_chunks:
            stl_buf = io.BytesIO()
            c["mesh"].export(stl_buf, file_type="stl")
            zf.writestr(f"{c['label']}.stl", stl_buf.getvalue())
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base}_chunks.zip"'},
    )


@router.post("/export-pdf")
async def export_pdf():
    global current_chunks, current_filename
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to export")
    from pdfgen import generate_assembly_pdf
    base = current_filename.replace(".stl", "") if current_filename else "mesh"
    pdf_bytes = generate_assembly_pdf(current_chunks, base)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{base}_assembly.pdf"'},
    )


@router.get("/preview-all")
async def preview_all():
    global current_chunks
    if not current_chunks:
        raise HTTPException(400, detail="No chunks to preview")
    return [{
        "vertices": c["mesh"].vertices.tolist(),
        "faces": c["mesh"].faces.tolist(),
        "label": c["label"],
    } for c in current_chunks]
