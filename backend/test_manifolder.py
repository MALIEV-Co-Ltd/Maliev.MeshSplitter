import trimesh
from manifolder import validate_manifold, repair_manifold


def _box_mesh():
    ref = trimesh.primitives.Box(extents=[50, 50, 50])
    return trimesh.Trimesh(
        vertices=ref.vertices.copy(),
        faces=ref.faces.copy(),
    )


def test_validate_watertight():
    assert validate_manifold(trimesh.primitives.Box(extents=[50, 50, 50])) == True


def test_validate_non_watertight():
    mesh = _box_mesh()
    mesh.faces = mesh.faces[:-1]
    assert validate_manifold(mesh) == False


def test_repair():
    mesh = _box_mesh()
    mesh.faces = mesh.faces[:-1]
    repaired = repair_manifold(mesh)
    assert repaired.is_watertight
