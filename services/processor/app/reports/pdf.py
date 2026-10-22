"""Render an audit report PDF with ReportLab."""

from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.reports.schemas import (
    DISCLAIMER,
    RECON_LABELS,
    REVIEW_LABELS,
    ReportPayload,
)

NAVY = colors.HexColor("#0F172A")
SIGNAL = colors.HexColor("#2563EB")
AMBER = colors.HexColor("#F59E0B")
LINE = colors.HexColor("#E2E8F0")
INK = colors.HexColor("#334155")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("Brand", fontName="Helvetica-Bold", fontSize=18, textColor=colors.white))
    ss.add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=15, textColor=NAVY, spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=10, spaceAfter=3))
    ss.add(ParagraphStyle("Body", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=13, alignment=TA_LEFT))
    ss.add(ParagraphStyle("Meta", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=12))
    ss.add(ParagraphStyle("Quote", fontName="Helvetica-Oblique", fontSize=9, textColor=INK, leading=12, leftIndent=10))
    ss.add(ParagraphStyle("Small", fontName="Helvetica", fontSize=8, textColor=colors.HexColor("#64748B")))
    ss.add(ParagraphStyle("Disc", fontName="Helvetica", fontSize=8.5, textColor=NAVY, leading=12))
    return ss


def _header_band(ss) -> Table:
    t = Table([[Paragraph("ScopeSignal", ss["Brand"]), Paragraph(
        '<font color="white" size=11>Audit Report</font>', ss["Body"])]], colWidths=[3 * inch, 4 * inch])
    t.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING", (0, 0), (0, 0), 14),
            ("RIGHTPADDING", (1, 0), (1, 0), 14),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ])
    )
    return t


def _esc(text: str) -> str:
    return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_pdf(payload: ReportPayload) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=LETTER, topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch, title="ScopeSignal Audit Report",
    )
    ss = _styles()
    flow: list = [_header_band(ss), Spacer(1, 12)]

    # Project identification + audit metadata.
    flow.append(Paragraph(_esc(payload.project_name), ss["H1"]))
    meta_bits = []
    if payload.project_reference:
        meta_bits.append(f"Ref {_esc(payload.project_reference)}")
    if payload.trade:
        meta_bits.append(_esc(payload.trade))
    meta_bits.append(f"Audit date: {_esc(payload.audit_date)}")
    if payload.model_identifier:
        meta_bits.append(f"Model: {_esc(payload.model_identifier)}")
    if payload.pipeline_version:
        meta_bits.append(_esc(payload.pipeline_version))
    flow.append(Paragraph(" &nbsp;·&nbsp; ".join(meta_bits), ss["Meta"]))

    # Analysis scope / supplied records.
    flow.append(Paragraph("Analysis scope", ss["H2"]))
    flow.append(Paragraph(
        f"{len(payload.documents)} document(s) analyzed; {payload.register_count} change-order "
        f"register entr{'y' if payload.register_count == 1 else 'ies'} supplied.", ss["Body"]))
    if payload.documents:
        flow.append(Paragraph(_esc(", ".join(payload.documents)), ss["Small"]))

    # Findings summary table.
    flow.append(Paragraph("Findings", ss["H1"]))
    rows = [["#", "Potential event", "Register", "Reviewer decision"]]
    for i, f in enumerate(payload.findings, 1):
        rows.append([
            str(i),
            Paragraph(_esc(f.title), ss["Body"]),
            RECON_LABELS.get(f.reconciliation_status, f.reconciliation_status),
            REVIEW_LABELS.get(f.review_status, f.review_status),
        ])
    table = Table(rows, colWidths=[0.3 * inch, 3.5 * inch, 1.5 * inch, 1.6 * inch], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), SIGNAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    flow.append(table)
    if not payload.findings:
        flow.append(Paragraph("No potential scope-change events were identified.", ss["Body"]))

    # Evidence appendix.
    if payload.findings:
        flow.append(Paragraph("Evidence appendix", ss["H1"]))
        for i, f in enumerate(payload.findings, 1):
            flow.append(Paragraph(f"{i}. {_esc(f.title)}", ss["H2"]))
            sub = []
            if f.change_type:
                sub.append(_esc(f.change_type.replace("_", " ")))
            if f.event_date:
                sub.append(_esc(f.event_date))
            if f.parties:
                sub.append(_esc(", ".join(f.parties)))
            sub.append(RECON_LABELS.get(f.reconciliation_status, f.reconciliation_status))
            sub.append("Decision: " + REVIEW_LABELS.get(f.review_status, f.review_status))
            flow.append(Paragraph(" · ".join(sub), ss["Small"]))
            for e in f.evidence:
                cite = e.filename + (f" · {e.source_locator}" if e.source_locator else "")
                flow.append(Paragraph(f'"{_esc(e.exact_excerpt)}"', ss["Quote"]))
                flow.append(Paragraph(_esc(cite), ss["Small"]))
            if f.matches:
                for m in f.matches:
                    ref = _esc(m.external_reference or "—")
                    flow.append(Paragraph(f"Register: {ref} — {_esc(m.explanation)}", ss["Meta"]))
            else:
                flow.append(Paragraph("Register: no corresponding entry in the supplied register.", ss["Meta"]))
            if f.review_notes:
                flow.append(Paragraph(f"Reviewer notes: {_esc(f.review_notes)}", ss["Meta"]))
            flow.append(Spacer(1, 6))
            flow.append(HRFlowable(width="100%", thickness=0.4, color=LINE))

    # Limitations.
    flow.append(Paragraph("Limitations", ss["H1"]))
    disc = Table([[Paragraph(DISCLAIMER, ss["Disc"])]], colWidths=[6.6 * inch])
    disc.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ("BOX", (0, 0), (-1, -1), 1, AMBER),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    flow.append(disc)

    doc.build(flow)
    return buf.getvalue()
