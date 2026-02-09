from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np # Thư viện xử lý ảnh dạng matrix
import pytesseract # OCR chữ
from PIL import Image, ImageOps


@dataclass
class WarpResult:
    image: np.ndarray
    quad: List[List[int]]
    used_warp: bool


def load_image(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    return ImageOps.exif_transpose(image) # Tự xoay ảnh đúng hướng theo EXIF


def resize_image(image: Image.Image, max_dim: int = 2000) -> Image.Image:
    width, height = image.size
    scale = min(1.0, max_dim / max(width, height))
    if scale >= 1.0:
        return image
    new_size = (int(width * scale), int(height * scale))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def pil_to_cv(image: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR) # Chuyển PIL(RGB) sang OpenCV(BGR)


def cv_to_pil(image: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))


def order_points(points: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = points.sum(axis=1) # Chiều ngang
    rect[0] = points[np.argmin(s)]
    rect[2] = points[np.argmax(s)]
    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def find_document_contour(image: np.ndarray) -> np.ndarray | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0) # 5x5, sigmaX=0
    
    edged = cv2.Canny(blurred, 50, 150) # Độ sắc nét
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edged, cv2.MORPH_CLOSE, kernel, iterations=2) # Hàn viền
    contours, _ = cv2.findContours(closed, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    
    # Khống chế các góc
    h, w = image.shape[:2]
    min_area = (h * w) * 0.05 
    max_area = (h * w) * 0.95
    contours = [c for c in contours if min_area < cv2.contourArea(c) < max_area]
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]
    
    for contour in contours:
        peri = cv2.arcLength(contour, True)
        for tolerance in [0.01, 0.015, 0.02, 0.025, 0.03]:
            approx = cv2.approxPolyDP(contour, tolerance * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                if min_area < area < max_area:
                    return approx.reshape(4, 2)
    return None


def warp_perspective(image: np.ndarray) -> WarpResult:
    contour = find_document_contour(image)
    if contour is None:
        h, w = image.shape[:2]
        quad = [[0, 0], [w, 0], [w, h], [0, h]]
        return WarpResult(image=image, quad=quad, used_warp=False)
    rect = order_points(contour.astype("float32"))
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = int(max(width_a, width_b))
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = int(max(height_a, height_b))
    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, dst) # Đưa về HCN với tọa độ gốc
    warped = cv2.warpPerspective(image, matrix, (max_width, max_height))
    quad = rect.astype(int).tolist()
    return WarpResult(image=warped, quad=quad, used_warp=True)


def _group_words_into_lines(data: Dict[str, List[str]]) -> List[Dict[str, Any]]:
    lines: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for i, text in enumerate(data["text"]):
        if not text.strip():
            continue # Bỏ từ rỗng
        line_key = (data["block_num"][i], data["line_num"][i])
        left = int(data["left"][i])
        top = int(data["top"][i])
        width = int(data["width"][i])
        height = int(data["height"][i])
        conf = float(data["conf"][i]) if data["conf"][i] != "-1" else 0.0
        if line_key not in lines: 
            lines[line_key] = {
                "text": text,
                "bbox": [left, top, left + width, top + height],
                "conf": conf,
            } # Lấy tọa độ từ đầu tiên làm khung cho cả dòng
        else:
            line = lines[line_key]
            line["text"] = f"{line['text']} {text}".strip()
            x1, y1, x2, y2 = line["bbox"]
            line["bbox"] = [
                min(x1, left),
                min(y1, top),
                max(x2, left + width),
                max(y2, top + height),
            ]
            line["conf"] = min(line["conf"], conf)
    return list(lines.values())


def layout_and_ocr(image: np.ndarray) -> List[Dict[str, Any]]:
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    data = pytesseract.image_to_data(rgb, output_type=pytesseract.Output.DICT)
    lines = _group_words_into_lines(data)
    blocks: List[Dict[str, Any]] = []
    for line in lines:
        blocks.append(
            {
                "type": "text",
                "bbox": line["bbox"],
                "lines": [line],
                "confidence": line["conf"],
            }
        )
    return blocks # Trả về các block chữ với bbox để vẽ khung cam 
