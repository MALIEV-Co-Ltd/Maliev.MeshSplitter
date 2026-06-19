import numpy as np
import trimesh


def split_mesh_grid(
    mesh: trimesh.Trimesh,
    build_volume: list[float],
    grid_divisions: list[int],
) -> tuple[list[dict], np.ndarray]:
    bounds = mesh.bounds.copy()
    min_corner = bounds[0].copy()
    extents = bounds[1] - bounds[0]

    working = trimesh.Trimesh(
        vertices=mesh.vertices.copy(),
        faces=mesh.faces.copy(),
    )
    working.vertices -= min_corner

    cell_sizes = extents / np.array(grid_divisions, dtype=float)

    if np.any(cell_sizes > np.array(build_volume, dtype=float)):
        raise ValueError("Cell size exceeds build volume")

    chunks = []
    gx, gy, gz = grid_divisions

    for ix in range(gx):
        xs = ix * cell_sizes[0]
        xe = (ix + 1) * cell_sizes[0]
        for iy in range(gy):
            ys = iy * cell_sizes[1]
            ye = (iy + 1) * cell_sizes[1]
            for iz in range(gz):
                zs = iz * cell_sizes[2]
                ze = (iz + 1) * cell_sizes[2]

                chunk = trimesh.Trimesh(
                    vertices=working.vertices.copy(),
                    faces=working.faces.copy(),
                )
                for origin, normal in [
                    (np.array([xs, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])),
                    (np.array([xe, 0.0, 0.0]), np.array([-1.0, 0.0, 0.0])),
                    (np.array([0.0, ys, 0.0]), np.array([0.0, 1.0, 0.0])),
                    (np.array([0.0, ye, 0.0]), np.array([0.0, -1.0, 0.0])),
                    (np.array([0.0, 0.0, zs]), np.array([0.0, 0.0, 1.0])),
                    (np.array([0.0, 0.0, ze]), np.array([0.0, 0.0, -1.0])),
                ]:
                    if chunk is None or len(chunk.faces) == 0:
                        break
                    chunk = chunk.slice_plane(
                        plane_origin=origin,
                        plane_normal=normal,
                        cap=True,
                    )

                if chunk is None or len(chunk.faces) == 0:
                    continue

                if not chunk.is_watertight:
                    try:
                        chunk.fill_holes()
                    except Exception:
                        pass

                if not chunk.is_watertight or len(chunk.faces) == 0:
                    continue

                centroid = chunk.centroid + min_corner
                chunks.append({
                    "mesh": chunk,
                    "label": f"X{ix}Y{iy}Z{iz}",
                    "original_centroid": centroid,
                })

    return chunks, bounds
