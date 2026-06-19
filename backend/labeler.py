import numpy as np
import trimesh


def find_top_face(mesh: trimesh.Trimesh) -> int | None:
    centroids = mesh.triangles_center
    normals = mesh.face_normals
    upward = normals[:, 2] > 0.9
    if not upward.any():
        return None
    candidates = np.where(upward)[0]
    return int(candidates[centroids[upward][:, 2].argmax()])


def label_chunks(chunks: list[dict]) -> list[dict]:
    for chunk in chunks:
        mesh = chunk["mesh"]
        label = chunk["label"]
        top_idx = find_top_face(mesh)
        if top_idx is None:
            continue
        centroid = mesh.triangles_center[top_idx]
        box = trimesh.primitives.Box(extents=[len(label) * 4, 2, 1])
        box.apply_translation(centroid)
        try:
            result = trimesh.boolean.difference([mesh, box])
            if result is not None and len(result.faces) > 0:
                chunk["mesh"] = result
        except Exception:
            pass
    return chunks
