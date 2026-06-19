# Mesh Splitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\- [ ]\) syntax for tracking.

**Goal:** Build a local web app that splits STL meshes into printable chunks with alignment connectors, labels, and PDF assembly instructions.

**Architecture:** Python FastAPI backend handles all geometry processing (Trimesh + python-manifold). Vue 3 + Three.js frontend provides 3D preview and configuration UI. API-based communication over localhost.

**Tech Stack:** FastAPI + Uvicorn (backend), Trimesh + python-manifold + ReportLab (geometry/pdf), Vue 3 + Vite + Three.js + Tailwind CSS (frontend), Axios (HTTP).

## Global Constraints

- Python 3.11+, Node.js 20+
- All processing runs locally — no cloud dependencies
- Default build volume: 250×250×250mm (BambuLab X1C)
- All output STLs must be manifold (watertight)
- UI must be fully responsive (mobile, tablet, desktop)
- Single start script launches both backend and frontend
- Backend port: 8080, Frontend port: 5173 with proxy to backend

---

### Task 1: Project Scaffolding

**Files:**
- Create: \ackend/requirements.txt\
- Create: \ackend/main.py\
- Create: \ackend/api.py\
- Create: \ackend/schemas.py\
- Create: \ackend/__init__.py\
- Create: \rontend/vite.config.js\
- Create: \rontend/tailwind.config.js\
- Create: \rontend/postcss.config.js\
- Create: \rontend/src/style.css\
- Create: \rontend/index.html\
- Create: \rontend/src/main.js\
- Create: \rontend/src/App.vue\
- Create: \start.ps1\
- Create: \.gitignore\

- [ ] **Step 1: Create backend directory and requirements.txt**

run: mkdir -p backend frontend/src/components frontend/src/composables

`
fastapi==0.111.0
uvicorn[standard]==0.30.1
trimesh==4.4.9
numpy==1.26.4
python-multipart==0.0.9
pydantic==2.7.4
reportlab==4.2.2
matplotlib==3.9.0
manifold3d==3.0.4
scipy==1.14.0
Pillow==10.3.0
`

- [ ] **Step 2: Create backend/schemas.py**

- [ ] **Step 3: Create backend/api.py with upload, split, connectors, export, preview endpoints**

- [ ] **Step 4: Create backend/main.py with CORS and router**

- [ ] **Step 5: Create frontend/vite.config.js with /api proxy to :8080**

- [ ] **Step 6: Create frontend/index.html with viewport meta and #app div**

- [ ] **Step 7: Create frontend/src/main.js and style.css (Tailwind directives)**

- [ ] **Step 8: Create App.vue placeholder with 7 component imports and grid layout**

- [ ] **Step 9: Create start.ps1 — installs venv + deps, starts both servers**

- [ ] **Step 10: Create .gitignore for pycache, venv, node_modules, dist**

- [ ] **Step 11: git init and initial commit**

---

### Task 2: Backend Slicer Module

**Files:**
- Create: \ackend/slicer.py\
- Test: \ackend/test_slicer.py\

- [ ] **Step 1: Create test_slicer.py** with tests for 2x2x1 split, single chunk, and build volume check

- [ ] **Step 2: Create slicer.py** with \split_mesh_grid(mesh, build_volume, grid_divisions)\ using slice_plane per cell

- [ ] **Step 3: Run tests and commit**

---

### Task 3: Backend Manifolder + Labeler

**Files:**
- Create: \ackend/manifolder.py\
- Create: \ackend/labeler.py\
- Test: \ackend/test_manifolder.py\

- [ ] **Step 1: Create manifolder.py** with validate_manifold() and repair_manifold() using fill_holes and manifold3d

- [ ] **Step 2: Create labeler.py** with find_top_face() and label_chunks() for embossing text on parts

- [ ] **Step 3: Create test_manifolder.py** and run tests

- [ ] **Step 4: Commit**

---

### Task 4: Backend Connectorator Module

**Files:**
- Create: \ackend/connectorator.py\

- [ ] **Step 1: Create connectorator.py** with create_dowel() and add_connectors() — detects adjacent chunks, places dowel pins on shared face

- [ ] **Step 2: Commit**

---

### Task 5: Backend PDF Generator

**Files:**
- Create: \ackend/pdfgen.py\

- [ ] **Step 1: Create pdfgen.py** with exploded view render (matplotlib 3D) and ReportLab layout: cover, parts table, assembly steps, connector map

- [ ] **Step 2: Commit**

---

### Task 6: Frontend Composable + Config Components

**Files:**
- Create: \rontend/src/composables/useMeshApi.js\
- Rewrite: \rontend/src/components/MeshUploader.vue\
- Rewrite: \rontend/src/components/BuildVolumeConfig.vue\
- Rewrite: \rontend/src/components/SplitConfig.vue\
- Rewrite: \rontend/src/components/ConnectorConfig.vue\

- [ ] **Step 1: Create useMeshApi.js** with uploadStl, splitMesh, addConnectors, exportStl, exportPdf

- [ ] **Step 2: Write MeshUploader.vue** — drag-drop STL, shows mesh info, emits uploaded

- [ ] **Step 3: Write BuildVolumeConfig.vue** — three number inputs + preset buttons (X1C, MK4, V2.4)

- [ ] **Step 4: Write SplitConfig.vue** — X Y Z range sliders (1-5), emits split event

- [ ] **Step 5: Write ConnectorConfig.vue** — type dropdown, diameter/depth/clearance/count params, apply button

- [ ] **Step 6: Commit**

---

### Task 7: Frontend 3D Preview + PartList + ExportPanel + Integration

**Files:**
- Rewrite: \rontend/src/components/ThreePreview.vue\
- Rewrite: \rontend/src/components/PartList.vue\
- Rewrite: \rontend/src/components/ExportPanel.vue\
- Rewrite: \rontend/src/App.vue\

- [ ] **Step 1: Write ThreePreview.vue** — Three.js scene with OrbitControls, shows colored chunks, updates on prop change

- [ ] **Step 2: Write PartList.vue** — grid of part cards with label, volume, click to select

- [ ] **Step 3: Write ExportPanel.vue** — two buttons: STL zip + PDF download

- [ ] **Step 4: Rewrite App.vue** — wire everything together, preview-all API call after split

- [ ] **Step 5: Build frontend and verify no errors**

- [ ] **Step 6: Commit**

---

### Task 8: Final Verification

- [ ] **Step 1: Run all backend tests** — python -m pytest -v

- [ ] **Step 2: Full frontend build** — npx vite build

- [ ] **Step 3: Start script test** — .\\start.ps1 launches both servers

- [ ] **Step 4: Manual test** — upload STL, split 2x2x1, verify chunks fit build volume, add connectors, export STL zip and PDF
