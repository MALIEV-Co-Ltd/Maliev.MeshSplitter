import numpy as np
import trimesh


def _boolean_union(meshes):
    for engine in ["manifold", "scad", "blender"]:
        try:
            result = trimesh.boolean.union(meshes, engine=engine)
            if result is not None and hasattr(result, 'vertices'):
                return result
        except Exception:
            continue
    return None


def _boolean_difference(meshes):
    for engine in ["manifold", "scad", "blender"]:
        try:
            result = trimesh.boolean.difference(meshes, engine=engine)
            if result is not None and hasattr(result, 'vertices'):
                return result
        except Exception:
            continue
    return None


def _boolean_intersection(meshes):
    for engine in ["manifold", "scad", "blender"]:
        try:
            result = trimesh.boolean.intersection(meshes, engine=engine)
            if result is not None and hasattr(result, 'vertices'):
                return result
        except Exception:
            continue
    return None


def create_dowel(position, direction, diameter, depth):
    direction = np.array(direction, dtype=float)
    direction = direction / np.linalg.norm(direction)

    cylinder = trimesh.creation.cylinder(
        radius=diameter / 2,
        height=depth,
        sections=32,
    )

    z_axis = np.array([0, 0, 1], dtype=float)
    if not np.allclose(direction, z_axis):
        rot_axis = np.cross(z_axis, direction)
        if np.linalg.norm(rot_axis) > 1e-10:
            rot_axis = rot_axis / np.linalg.norm(rot_axis)
            angle = np.arccos(np.clip(np.dot(z_axis, direction), -1.0, 1.0))
            transform = trimesh.transformations.rotation_matrix(angle, rot_axis)
            cylinder.apply_transform(transform)

    cylinder.apply_translation(position)
    return cylinder


def _perpendicular_vectors(normal):
    normal = np.array(normal, dtype=float)
    normal = normal / np.linalg.norm(normal)
    if abs(normal[0]) < 0.9:
        v1 = np.cross(normal, np.array([1, 0, 0], dtype=float))
    else:
        v1 = np.cross(normal, np.array([0, 1, 0], dtype=float))
    v1 = v1 / np.linalg.norm(v1)
    v2 = np.cross(normal, v1)
    return v1, v2


def _offset_positions(center, v1, v2, count, spacing):
    if count <= 1:
        return [np.array(center, dtype=float)]

    side = int(np.ceil(np.sqrt(count)))
    positions = []
    for i in range(side):
        for j in range(side):
            if len(positions) >= count:
                break
            offset = (i - (side - 1) / 2) * spacing * v1 + (
                j - (side - 1) / 2
            ) * spacing * v2
            positions.append(np.array(center, dtype=float) + offset)
    return positions


def add_connectors(chunks, config):
    if config.connector_type == "none":
        return chunks

    chunks = [dict(c) for c in chunks]
    n = len(chunks)

    for i in range(n):
        for j in range(i + 1, n):
            try:
                intersection = _boolean_intersection(
                    [chunks[i]["mesh"], chunks[j]["mesh"]]
                )
            except Exception:
                continue

            if intersection is None or intersection.volume < 1.0:
                continue

            face_center = intersection.centroid
            centroid_a = chunks[i].get(
                "original_centroid", chunks[i]["mesh"].centroid
            )
            centroid_b = chunks[j].get(
                "original_centroid", chunks[j]["mesh"].centroid
            )
            normal = np.array(centroid_b, dtype=float) - np.array(
                centroid_a, dtype=float
            )
            norm = np.linalg.norm(normal)
            if norm < 1e-10:
                continue
            normal = normal / norm

            v1, v2 = _perpendicular_vectors(normal)
            spacing = config.diameter * 2
            positions = _offset_positions(
                face_center, v1, v2, config.count_per_face, spacing
            )

            for pos in positions:
                try:
                    male_pos = pos - (config.depth / 2) * normal
                    male = create_dowel(
                        male_pos, -normal, config.diameter, config.depth
                    )

                    female_diameter = config.diameter + config.clearance * 2
                    female_pos = pos + (config.depth / 2) * normal
                    female = create_dowel(
                        female_pos, normal, female_diameter, config.depth
                    )

                    result = _boolean_union(
                        [chunks[i]["mesh"], male]
                    )
                    if result is not None:
                        chunks[i]["mesh"] = result

                    result = _boolean_difference(
                        [chunks[j]["mesh"], female]
                    )
                    if result is not None:
                        chunks[j]["mesh"] = result
                except Exception:
                    continue

    for c in chunks:
        if not c["mesh"].is_watertight:
            try:
                c["mesh"].fill_holes()
            except Exception:
                pass

    return chunks
