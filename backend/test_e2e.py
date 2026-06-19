"""End-to-end test: starts server, tests all endpoints, cleans up."""
import subprocess, time, requests, os, sys, signal

BASE = "http://localhost:8080/api"
server_proc = None

try:
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"],
        cwd=os.path.dirname(__file__),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    time.sleep(4)

    # Upload
    stl_path = os.path.join(os.path.dirname(__file__), "test_box.stl")
    with open(stl_path, "rb") as f:
        r = requests.post(f"{BASE}/upload", files={"file": f})
    assert r.status_code == 200, f"Upload failed: {r.status_code}"
    info = r.json()
    assert info["is_watertight"], "Mesh not watertight"
    print(f"UPLOAD OK: {info['filename']}, {info['vertex_count']} verts, wt={info['is_watertight']}")

    # Split
    r = requests.post(f"{BASE}/split", json={"build_volume": [250,250,250], "grid_divisions": [2,2,1]})
    assert r.status_code == 200, f"Split failed: {r.status_code}"
    data = r.json()
    assert len(data["chunks"]) == 4, f"Expected 4 chunks, got {len(data['chunks'])}"
    for c in data["chunks"]:
        assert c["is_watertight"], f"{c['label']} not watertight"
    print(f"SPLIT OK: {len(data['chunks'])} chunks, all watertight")

    # Preview
    r = requests.get(f"{BASE}/preview-all")
    assert r.status_code == 200
    chunks = r.json()
    assert len(chunks) == 4
    assert "vertices" in chunks[0] and "faces" in chunks[0]
    print(f"PREVIEW OK: {len(chunks)} chunks with vertex data")

    # Connectors
    r = requests.post(f"{BASE}/connectors", json={
        "connector_type": "dowel", "diameter": 6, "depth": 8,
        "clearance": 0.2, "count_per_face": 2, "apply_to_all": True
    })
    assert r.status_code == 200, f"Connectors failed: {r.status_code}"
    data = r.json()
    for c in data["chunks"]:
        assert c["is_watertight"], f"{c['label']} not watertight after connectors"
    print(f"CONNECTORS OK: all {len(data['chunks'])} chunks remain watertight")

    # Export STL
    r = requests.post(f"{BASE}/export-stl")
    assert r.status_code == 200
    assert len(r.content) > 100
    print(f"EXPORT STL OK: {len(r.content)} bytes")

    # Export PDF
    r = requests.post(f"{BASE}/export-pdf")
    assert r.status_code == 200
    assert len(r.content) > 1000
    print(f"EXPORT PDF OK: {len(r.content)} bytes")

    print("\nALL E2E TESTS PASSED")

finally:
    if server_proc:
        server_proc.terminate()
        server_proc.wait(timeout=5)
