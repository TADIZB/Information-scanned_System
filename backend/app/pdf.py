from __future__ import annotations

import io
from typing import Any, Dict, List

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas


def _image_bbox_to_pdf(bbox: List[int], page_height: int) -> List[int]:
    x1, y1, x2, y2 = bbox
    pdf_y1 = page_height - y2
    pdf_y2 = page_height - y1
    return [x1, pdf_y1, x2, pdf_y2]


def build_pdf(image_path: str, blocks: List[Dict[str, Any]]) -> bytes:
    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(width, height))

    if not blocks:
        pdf.drawImage(ImageReader(image), 0, 0, width=width, height=height)
        pdf.showPage()
        pdf.save()
        buffer.seek(0)
        return buffer.read()

    for block in blocks:
        block_type = block.get("type")
        bbox = block.get("bbox") or [0, 0, width, height]
        if block_type in ("image", "table"):
            x1, y1, x2, y2 = bbox
            cropped = image.crop((x1, y1, x2, y2))
            pdf_bbox = _image_bbox_to_pdf(bbox, height)
            pdf.drawImage(
                ImageReader(cropped),
                pdf_bbox[0],
                pdf_bbox[1],
                width=pdf_bbox[2] - pdf_bbox[0],
                height=pdf_bbox[3] - pdf_bbox[1],
            )
            continue

        if block_type == "text":
            lines = block.get("lines", [])
            for line in lines:
                text = line.get("text", "").strip()
                if not text:
                    continue
                line_bbox = line.get("bbox") or bbox
                pdf_bbox = _image_bbox_to_pdf(line_bbox, height)
                font_size = max(8, int((pdf_bbox[3] - pdf_bbox[1]) * 0.8))
                pdf.setFont("Helvetica", font_size)
                pdf.drawString(pdf_bbox[0], pdf_bbox[1], text)

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.read()
