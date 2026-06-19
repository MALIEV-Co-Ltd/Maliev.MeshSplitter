import io
import re
from datetime import date
from itertools import combinations

import numpy as np

import matplotlib
matplotlib.use("Agg")
from matplotlib.figure import Figure
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
    PageBreak,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER


def _exploded_view(chunks: list[dict]) -> bytes:
    fig = Figure(figsize=(6, 5), dpi=120)
    ax = fig.add_subplot(111, projection="3d")
    colors_list = [
        "#4e79a7", "#f28e2b", "#e15759", "#76b7b2",
        "#59a14f", "#edc948", "#b07aa1", "#ff9da7",
        "#9c755f", "#bab0ac",
    ]
    z_offset = 15.0
    for i, chunk in enumerate(chunks):
        mesh = chunk["mesh"]
        verts = mesh.vertices
        faces = mesh.faces
        poly = Poly3DCollection(
            verts[faces],
            alpha=0.85,
            facecolor=colors_list[i % len(colors_list)],
            edgecolor="black",
            linewidth=0.3,
        )
        offset = i * z_offset
        poly.set_verts([v + [0, 0, offset] for v in verts[faces]])
        ax.add_collection3d(poly)

    all_verts = np.vstack([c["mesh"].vertices for c in chunks])
    max_range = (np.ptp(all_verts, axis=0).max() / 2) + (len(chunks) * z_offset / 2)
    mid_pt = all_verts.mean(axis=0) + [0, 0, (len(chunks) - 1) * z_offset / 2]
    ax.set_xlim(mid_pt[0] - max_range, mid_pt[0] + max_range)
    ax.set_ylim(mid_pt[1] - max_range, mid_pt[1] + max_range)
    ax.set_zlim(mid_pt[2] - max_range, mid_pt[2] + max_range)
    ax.set_xlabel("X (mm)")
    ax.set_ylabel("Y (mm)")
    ax.set_zlabel("Z (mm)")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    buf.seek(0)
    return buf.read()


def _parse_label(label: str) -> tuple[int, int, int]:
    nums = re.findall(r"\d+", label)
    if len(nums) >= 3:
        return int(nums[0]), int(nums[1]), int(nums[2])
    return 0, 0, 0


def _are_adjacent(c1: dict, c2: dict) -> bool:
    l1, l2 = c1["label"], c2["label"]
    x1, y1, z1 = _parse_label(l1)
    x2, y2, z2 = _parse_label(l2)
    return abs(x1 - x2) + abs(y1 - y2) + abs(z1 - z2) == 1


def _connector_pairs(chunks: list[dict]) -> list[tuple[int, int]]:
    pairs = []
    for i, j in combinations(range(len(chunks)), 2):
        if _are_adjacent(chunks[i], chunks[j]):
            pairs.append((i, j))
    return pairs


def generate_assembly_pdf(chunks: list[dict], filename: str) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CoverTitle", parent=styles["Title"], fontSize=28, spaceAfter=12, alignment=TA_CENTER
    )
    subtitle_style = ParagraphStyle(
        "CoverSub", parent=styles["Normal"], fontSize=14, alignment=TA_CENTER, spaceAfter=6
    )
    heading_style = ParagraphStyle(
        "SectionHead", parent=styles["Heading1"], fontSize=18, spaceBefore=16, spaceAfter=8
    )
    body_style = ParagraphStyle(
        "BodyText2", parent=styles["Normal"], fontSize=10, leading=14, spaceAfter=4
    )

    elements = []
    exploded_png = _exploded_view(chunks)

    # --- Page 1: Cover ---
    elements.append(Spacer(1, 60 * mm))
    elements.append(Paragraph(f"Assembly Instructions", title_style))
    elements.append(Spacer(1, 8 * mm))
    elements.append(Paragraph(f"File: {filename}", subtitle_style))
    elements.append(Paragraph(f"Parts: {len(chunks)}", subtitle_style))
    elements.append(Paragraph(f"Date: {date.today().isoformat()}", subtitle_style))
    elements.append(Spacer(1, 10 * mm))
    cover_img = Image(io.BytesIO(exploded_png), width=160 * mm, height=120 * mm)
    elements.append(cover_img)
    elements.append(PageBreak())

    # --- Page 2: Parts List ---
    elements.append(Paragraph("Parts List", heading_style))
    header = ["#", "Label", "X (mm)", "Y (mm)", "Z (mm)", "Volume (cm³)"]
    data = [header]
    for i, c in enumerate(chunks):
        cent = c.get("original_centroid", c["mesh"].centroid)
        vol_cm3 = c["mesh"].volume / 1000.0
        data.append([
            str(i + 1),
            c["label"],
            f"{cent[0]:.1f}",
            f"{cent[1]:.1f}",
            f"{cent[2]:.1f}",
            f"{vol_cm3:.2f}",
        ])
    col_widths = [20, 50, 50, 50, 50, 55]
    t = Table(data, colWidths=[w * mm for w in col_widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4e79a7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
    ]))
    elements.append(t)
    elements.append(PageBreak())

    # --- Page 3: Assembly Steps ---
    elements.append(Paragraph("Assembly Steps", heading_style))
    pairs = _connector_pairs(chunks)
    adj_map: dict[int, list[int]] = {i: [] for i in range(len(chunks))}
    for i, j in pairs:
        adj_map[i].append(j)
        adj_map[j].append(i)

    for i, c in enumerate(chunks):
        text = f"<b>Step {i + 1}:</b> Take part <b>{c['label']}</b>"
        if adj_map[i]:
            neighbors = ", ".join(f"<b>{chunks[n]['label']}</b>" for n in adj_map[i])
            text += f". Connect to {neighbors}"
        text += "."
        elements.append(Paragraph(text, body_style))
        elements.append(Spacer(1, 2 * mm))

    if not chunks:
        elements.append(Paragraph("No parts to assemble.", body_style))

    elements.append(PageBreak())

    # --- Page 4: Connector Map ---
    elements.append(Paragraph("Connector Map", heading_style))
    conn_header = ["Part A", "Label A", "Part B", "Label B"]
    conn_data = [conn_header]
    for i, j in pairs:
        conn_data.append([
            str(i + 1),
            chunks[i]["label"],
            str(j + 1),
            chunks[j]["label"],
        ])
    if not pairs:
        conn_data.append(["—", "No connections found", "", ""])

    conn_widths = [30, 60, 30, 60]
    ct = Table(conn_data, colWidths=[w * mm for w in conn_widths], repeatRows=1)
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4e79a7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (0, 1), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f2f2")]),
    ]))
    elements.append(ct)

    doc.build(elements)
    buf.seek(0)
    return buf.getvalue()
