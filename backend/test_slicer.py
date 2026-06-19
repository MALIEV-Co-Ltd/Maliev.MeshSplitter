import pytest
import trimesh
import numpy as np
from slicer import split_mesh_grid


def test_split_2x2x1():
    mesh = trimesh.primitives.Box(extents=[200, 200, 100])
    chunks, bbox = split_mesh_grid(mesh, [250, 250, 250], [2, 2, 1])
    assert len(chunks) == 4
    for c in chunks:
        assert c["mesh"].is_watertight
        assert all(c["mesh"].bounds[1][i] - c["mesh"].bounds[0][i] <= 250 for i in range(3))
    assert set(c["label"] for c in chunks) == {"X0Y0Z0", "X0Y1Z0", "X1Y0Z0", "X1Y1Z0"}


def test_split_single_chunk():
    mesh = trimesh.primitives.Box(extents=[100, 100, 100])
    chunks, _ = split_mesh_grid(mesh, [250, 250, 250], [1, 1, 1])
    assert len(chunks) == 1 and chunks[0]["label"] == "X0Y0Z0"


def test_split_fits_build_volume():
    mesh = trimesh.primitives.Box(extents=[300, 100, 100])
    chunks, _ = split_mesh_grid(mesh, [250, 250, 250], [2, 1, 1])
    assert len(chunks) == 2
    for c in chunks:
        sz = c["mesh"].bounds[1] - c["mesh"].bounds[0]
        assert all(sz <= [250, 250, 250])


def test_split_too_large():
    mesh = trimesh.primitives.Box(extents=[500, 100, 100])
    with pytest.raises(ValueError):
        split_mesh_grid(mesh, [250, 250, 250], [1, 1, 1])
