import trimesh
import numpy as np


def validate_manifold(mesh: trimesh.Trimesh) -> bool:
    if not mesh.is_watertight:
        return False
    if not mesh.is_volume:
        return False
    V = len(mesh.vertices)
    E = mesh.edges_unique.shape[0]
    F = len(mesh.faces)
    if V - E + F != 2:
        return False
    return True


def repair_manifold(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    try:
        mesh.fill_holes()
    except Exception:
        pass
    if not mesh.is_watertight:
        try:
            import manifold3d
            m3d = manifold3d.Mesh(
                vert_properties=np.array(mesh.vertices, dtype=np.float32),
                tri_verts=np.array(mesh.faces, dtype=np.uint32),
            )
            man = manifold3d.Manifold(m3d)
            result = man.to_mesh()
            if result is not None and result.vert_properties.shape[0] > 0:
                mesh = trimesh.Trimesh(
                    vertices=result.vert_properties,
                    faces=result.tri_verts,
                )
        except Exception:
            pass
    return mesh
