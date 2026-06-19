# Mesh Splitter — Design Document

## 1. Overview

A local web application that splits large 3D printer STL meshes into smaller printable chunks that fit a user-configured build volume (default: BambuLab X1C, 250×250×250mm). Each chunk gets alignment connectors, coordinate labels, and the app generates a detailed PDF assembly instruction booklet.

## 2. Architecture

mesh-split/
├── backend/           # FastAPI Python backend
│   ├── main.py        # API entry point
│   ├── api.py         # Route definitions
│   ├── schemas.py     # Pydantic models
│   ├── slicer.py      # Grid-based mesh splitting
│   ├── connectorator.py  # Connector generation
│   ├── manifolder.py  # Boolean ops & manifold repair
│   ├── labeler.py     # Text embossing on parts
│   ├── pdfgen.py      # PDF assembly instructions
│   └── requirements.txt
├── frontend/          # Vue 3 + Vite + Three.js
│   ├── src/
│   │   ├── App.vue
│   │   ├── components/
│   │   │   ├── MeshUploader.vue
│   │   │   ├── BuildVolumeConfig.vue
│   │   │   ├── SplitConfig.vue
│   │   │   ├── ConnectorConfig.vue
│   │   │   ├── ThreePreview.vue
│   │   │   ├── PartList.vue
│   │   │   └── ExportPanel.vue
│   │   ├── composables/useMeshApi.js
│   │   └── main.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── start.ps1

### Tech Stack

Backend: Python 3.11+, FastAPI, Uvicorn, Trimesh, python-manifold, ReportLab, matplotlib
Frontend: Vue 3 (Composition API), Vite, Three.js + OrbitControls, Axios, Tailwind CSS

## 3. Backend Modules

### slicer.py — Grid-Based Splitting
- Align mesh to origin, compute cell size from grid divisions, clamp to build volume
- slice_plane with 6 planes per cell to extract each chunk
- Assign labels X{ix}Y{iy}Z{iz}

### connectorator.py — Alignment Connectors
- Detect adjacent chunk pairs, find shared cut face
- Dowel: male/female cylinders with clearance. Parameters: diameter (6mm), depth (8mm), clearance (0.2mm)
- Three connector types: Dowel, Mortise+Tenon, Key (future: selectable in UI)

### manifolder.py — Manifold Repair
- Validate: is_watertight, is_volume, Euler characteristic
- Repair via fill_holes, fallback to manifold3d

### labeler.py — Part Labeling
- Find topmost exterior face, generate text geometry, deboss/emboss onto face

### pdfgen.py — Assembly Instructions
- Cover page, parts list table, assembly steps, connector map, exploded view

### API Routes
POST /api/upload, POST /api/split, POST /api/connectors
POST /api/export-stl, POST /api/export-pdf
GET /api/preview-all

## 4. Frontend Components

All fully responsive via Tailwind CSS breakpoints.

- MeshUploader: drag-drop STL, shows mesh info
- BuildVolumeConfig: X Y Z inputs + presets
- SplitConfig: X Y Z range sliders (1-5)
- ConnectorConfig: type dropdown, params, apply button
- ThreePreview: Three.js canvas with colored chunk rendering
- PartList: grid of part cards
- ExportPanel: STL zip + PDF download buttons

## 5. Data Flow

Upload STL → validate → set grid + build vol → split → add connectors → preview in 3D → export STLs + PDF

## 6. Edge Cases

- Non-manifold input: reject with diagnostic
- Single chunk: skip split if fits volume
- Grid too fine: warn if cell < 10mm
- Empty cell: skip, no zero-volume part
- Connector overlap: detect and prevent

## 7. Non-Goals (Future)

Intelligent splits, curved connectors, batch processing, 3MF profiles, cloud deployment
