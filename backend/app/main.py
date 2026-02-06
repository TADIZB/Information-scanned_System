from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
from uuid import uuid4 # Tạo ID ngẫu nhiên

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile # framework API
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from PIL import Image # Lưu ảnh ra file .png

from pdf import build_pdf
from pipeline import layout_and_ocr, load_image, pil_to_cv, resize_image, warp_perspective


BASE_DIR = Path(__file__).resolve().parents[1]
STORAGE_DIR = BASE_DIR / "storage"
WARPED_DIR = STORAGE_DIR / "warped"
PDF_DIR = STORAGE_DIR / "pdf"

for folder in (WARPED_DIR, PDF_DIR):
    folder.mkdir(parents=True, exist_ok=True)


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/files/warped", StaticFiles(directory=WARPED_DIR), name="warped")
app.mount("/files/pdf", StaticFiles(directory=PDF_DIR), name="pdf")


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)) -> Dict[str, Any]: # Nhận file hình ảnh từ client
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    data = await file.read()   
    image = resize_image(load_image(data)) 
    cv_image = pil_to_cv(image) # Chuyển PIL sang OpenCV
    warped = warp_perspective(cv_image) # Tìm góc giấy và bẻ lại cho thẳng
    blocks = layout_and_ocr(warped.image) 
    warped_id = uuid4().hex
    warped_path = WARPED_DIR / f"{warped_id}.png" 
    warped_image = np.clip(warped.image, 0, 255).astype("uint8") # Đảm bảo pixel trong phạm vi rồi chuyển về chuẩn ảnh PNG
    Image.fromarray(warped_image[:, :, ::-1]).save(warped_path) 
# Trả JSON về fe
    return {
        "warped_image_id": warped_id,
        "warped_preview_url": f"/files/warped/{warped_id}.png",
        "blocks": blocks,
    }


@app.post("/export")
async def export(payload: Dict[str, Any]) -> Response:
    warped_id = payload.get("warped_image_id")
    blocks = payload.get("blocks", [])
    if not warped_id:
        raise HTTPException(status_code=400, detail="warped_image_id is required.")
    image_path = WARPED_DIR / f"{warped_id}.png"
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Warped image not found.")
    pdf_bytes = build_pdf(str(image_path), blocks) # Tạo PDF từ ảnh đã bẻ và các block text
    pdf_id = uuid4().hex
    pdf_path = PDF_DIR / f"{pdf_id}.pdf"
    pdf_path.write_bytes(pdf_bytes)
    return JSONResponse(
        {
            "export_pdf_url": f"/files/pdf/{pdf_id}.pdf",
            "export_pdf_id": pdf_id,
        }
    )