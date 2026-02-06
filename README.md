# TADIZB - Scanner 

1. Giới Thiệu

**TADIZB** là một ứng dụng web dùng để phân tích bất kỳ loại tài liệu giấy nào thành PDF thông qua công nghệ **Computer Vision** và **OCR**.

Ứng dụng cho phép người dùng:
- Chụp ảnh tài liệu trực tiếp từ camera hoặc upload file ảnh
- Sửa chữa và điều chỉnh text được nhận diện
- Xuất PDF 

---

2. Tính Năng Chính

**Chụp/Upload Ảnh**
- Chụp ảnh từ camera của thiết bị
- Upload file ảnh từ máy tính
- Hỗ trợ định dạng: JPG, PNG, etc.

**Xử Lý Ảnh Thông Minh**
- Tự động phát hiện góc giấy trong ảnh
- Bẻ góc để ảnh thẳng
- Cắt và alignment 

**OCR & Trích Xuất Text**
- Nhận diện text tự động bằng Tesseract
- Giữ nguyên bố cục và tọa độ

**Chỉnh Sửa & Điều Chỉnh**
- Sửa text được nhận diện sai
- Visualize boxes text trên ảnh

**Xuất PDF Searchable**
- PDF chứa cả ảnh gốc và text nhúng
- Text có thể copy, tìm kiếm

---

3. Kiến Trúc Hệ Thống

```
┌────────────────────────────────────────────┐
│         FRONTEND (React + Vite)            │
│     http://localhost:3000                  │
├────────────────────────────────────────────┤
│ • Camera Module                            │
│ • Image Preview                            │
│ • OCR Result Editor                        │
│ • PDF Export Handler                       │
└─────────────────┬──────────────────────────┘
                  │
          HTTP (REST API)
                  │
┌─────────────────▼──────────────────────────┐
│      BACKEND (FastAPI + Python)            │
│     http://localhost:8000                  │
├────────────────────────────────────────────┤
│ Endpoints:                                 │
│ • POST /analyze    → Phân tích ảnh         │
│ • POST /export     → Tạo PDF               │
│ • GET /health      → Health check          │
│ • GET /files/*     → Static file serving   │
└─────────────────┬──────────────────────────┘
                  │
        ┌─────────▼─────────┐
        │    Storage Dir    │
        ├─────────┬─────────┤
        │ warped/ │  pdf/   │
        └─────────┴─────────┘
```

---

4. Luồng Xử Lý Dữ Liệu

**Stage 1: Camera → Preview**
```
┌──────────────┐
│ Chụp Ảnh     │
│ Camera       │
└──────┬───────┘
       │ canvas.toBlob()
       ▼
┌──────────────────┐
│ Preview Ảnh      │
│ Gốc (JPEG)       │
└──────┬───────────┘
       │ Click "Phân tích ảnh"
       │ POST /analyze
       ▼
```

**Stage 2: Analyze (Backend)**
```
Input: Raw Image (Blob)
   │
   ├─ load_image()
   │  └─ Mở ảnh, tự xoay theo EXIF
   │
   ├─ resize_image()
   │  └─ Scale max 2000px (tối ưu)
   │
   ├─ pil_to_cv()
   │  └─ Chuyển PIL(RGB) → OpenCV(BGR)
   │
   ├─ find_document_contour()
   │  ├─ Convert to Grayscale
   │  ├─ Gaussian Blur (5x5)
   │  ├─ Canny Edge Detection
   │  ├─ Morphological Operations
   │  ├─ Find Contours
   │  └─ Approx PolyDP → 4 góc
   │
   ├─ warp_perspective()
   │  ├─ Order 4 points
   │  ├─ Calculate max width/height
   │  ├─ Get Perspective Transform matrix
   │  └─ Apply warp
   │
   ├─ layout_and_ocr()
   │  ├─ Tesseract OCR
   │  ├─ Group words into lines
   │  └─ Extract bounding boxes
   │
   ├─ Save warped image
   │  └─ storage/warped/{uuid}.png
   │
   ▼
Output: {
  warped_image_id: "abc123...",
  warped_preview_url: "/files/warped/abc123....png",
  blocks: [
    {
      type: "text",
      bbox: [x1, y1, x2, y2],
      lines: [{ text: "...", bbox: [...], conf: 0.95 }],
      confidence: 0.95
    }
  ]
}
```

**Stage 3: Edit (Frontend)**
```
┌─────────────────────────────┐
│ Hiển thị ảnh warped         │
│ + Canvas overlay (boxes)    │
│ + Text input fields         │
└──────────────┬──────────────┘
               │
      ┌────────▼────────┐
      │ Người dùng      │
      │ sửa text        │
      └────────┬────────┘
               │
      ┌────────▼────────┐
      │ updateLineText()│
      │ cập nhật state  │
      └────────┬────────┘
               │
      ┌────────▼─────────────┐
      │ Click "Export PDF"   │
      │ POST /export         │
      └────────┬─────────────┘
               ▼
```

**Stage 4: Export (Backend)**
```
Input: {
  warped_image_id: "abc123...",
  blocks: [...]  // edited by user
}
   │
   ├─ Load warped image
   │  └─ storage/warped/{uuid}.png
   │
   ├─ build_pdf()
   │  ├─ Create PDF canvas (same size as image)
   │  ├─ Draw background image
   │  ├─ For each block:
   │  │  ├─ If type="text":
   │  │  │  └─ drawString() text (searchable)
   │  │  └─ If type="image"/"table":
   │  │     └─ drawImage() cropped region
   │  └─ Save PDF bytes
   │
   ├─ Save PDF file
   │  └─ storage/pdf/{uuid}.pdf
   │
   ▼
Output: {
  export_pdf_url: "/files/pdf/xyz789....pdf",
  export_pdf_id: "xyz789..."
}
```

**Stage 4: Download (Frontend)**
```
fetch(PDF URL) → blob
   → create download link
   → click() → download
```

---

5. Các Thuật Toán Sử Dụng

**a. Document Contour Detection** 
Phát hiện góc giấy trong ảnh chụp xiên.

**Các bước:**
1. **Grayscale Conversion**: RGB → Mức xám
2. **Gaussian Blur** (5×5): Giảm noise
3. **Canny Edge Detection** (threshold: 50-150): Phát hiện cạnh sắc nét
4. **Morphological Closing** (5×5, 2x): Hàn các vết nứt nhỏ
5. **Contour Finding**: Tìm tất cả đường bao
6. **Area Filtering**: Lọc contour 5%-95% diện tích ảnh
7. **Poly DP Approximation**: Xấp xỉ thành hình 4 cạnh

**Kết quả**: 4 điểm góc `[[x1, y1], [x2, y2], [x3, y3], [x4, y4]]`

---

**b. Perspective Warp Transform** 
Biến ảnh xiên thành ảnh thẳng.

**Công thức:**
```
1. order_points() → Sắp xếp theo vị trí:
   • Điểm 0: top-left    (sum min)
   • Điểm 1: top-right   (diff min)
   • Điểm 2: bottom-right (sum max)
   • Điểm 3: bottom-left (diff max)

2. Tính tỷ lệ thực tế:
   • max_width = max(||br-bl||, ||tr-tl||)
   • max_height = max(||tr-br||, ||tl-bl||)

3. Tạo ma trận biến đổi:
   M = getPerspectiveTransform(src_pts, dst_pts)
   
4. Áp dụng biến đổi:
   warped = warpPerspective(image, M, (width, height))
```

**Kết quả**: Ảnh thẳng chính xác dạng camera quan sát từ trên xuống.

---

**c. Tesseract OCR** 
Nhận diện text từ ảnh.

**Quá trình:**
1. Chuyển ảnh sang RGB
2. Gọi `pytesseract.image_to_data()`
3. Nhân diện từng **từ** (word) và tọa độ bao
4. Nhóm các từ cùng dòng lại thành **line**
5. Lấy confidence score (0-100) cho mỗi từ

**Output**:
```python
{
  'text': ['Hello', 'World'],
  'left': [10, 60],
  'top': [5, 5],
  'width': [40, 50],
  'height': [20, 20],
  'conf': [95, 88],
  'block_num': [1, 1],
  'line_num': [1, 1]
}
```

---

**d. Line Grouping & Layout Analysis** 
Nhóm các từ thành các dòng, giữ nguyên bố cục.

**Kết quả**:
```python
for each word:
  line_key = (block_num, line_num)
  if line_key not in groups:
    create new line entry
  else:
    merge word into line:
    • bbox: expand to contain word
    • text: append word
    • conf: take minimum confidence
```

**Mục đích**: Giữ nguyên cấu trúc dòng, dễ sửa chữa.

---

**e. PDF Generation** 
Tạo PDF từ ảnh + text OCR.

**Quá trình:**
1. Tải ảnh warped (Background layer)
2. Tạo PDF canvas cùng kích thước ảnh
3. Vẽ ảnh làm nền
4. **Với từng text block:**
   - Tính **font size** dựa trên chiều cao box
   - Gọi `drawString(text, x, y)` ← **Text searchable**
5. **Với image/table blocks:**
   - Cắt ảnh (crop) theo bbox
   - Vẽ lại vào PDF
6. Save PDF bytes

**Tọa độ Conversion:**
```
PDF coordinates (bottom-left origin):
y_pdf = page_height - y_image

(vì PDF tính từ dưới lên, ảnh tính từ trên xuống)
```

---

6. Cấu Trúc Dự Án

```
GR2/
├── README.md                 # Báo cáo này
├── frontend/
│   ├── index.html           # HTML entry point
│   ├── package.json         # Dependencies
│   ├── vite.config.js       # Vite config
│   └── src/
│       ├── main.jsx         # React entry
│       ├── App.jsx          # Main component
│       ├── api.js           # API calls (axios)
│       └── styles.css       # Styling
│
├── backend/
│   ├── requirements.txt     # Python dependencies
│   ├── README.md           # Backend notes
│   └── app/
│       ├
│       ├── main.py         # FastAPI app + endpoints
│       ├── pipeline.py     # Image processing
│       ├── pdf.py          # PDF generation
│       └── __pycache__/
│
└── storage/
    ├── warped/             # Warped images (PNG)
    └── pdf/                # Generated PDFs
```
7. Các Hàm Hook Quan Trọng (React)

```javascript
// 1. Chụp ảnh từ video
handleCapture() 
  → canvas.toBlob() 
  → setCaptureBlob() 
  → stage = "preview"

// 2. Gửi ảnh lên server phân tích
handleAnalyze(blob)
  → POST /analyze
  → setState({ warpedPreviewUrl, blocks })
  → stage = "edit"

// 3. Vẽ overlay lên canvas
drawOverlay()
  → Draw rectangles cho từng block
  → Fill color: rgba(255, 111, 60, 0.12)
  → Stroke color: #ff6f3c

// 4. Cập nhật text khi người dùng sửa
updateLineText(blockIdx, lineIdx, newText)
  → setState({ blocks[...].lines[...].text })

// 5. Export PDF
handleExport()
  → POST /export { warped_image_id, blocks }
  → Download PDF blob
```

8. Các Endpoint API

**a. GET /health**

**b. POST /analyze**

**c. POST /export**

**d. GET /files/warped/{image_id}.png**

**e. GET /files/pdf/{pdf_id}.pdf**

9. Hướng Dẫn Cài Đặt & Chạy

**Yêu Cầu Hệ Thống**
- Python 3.8+
- Node.js 16+
- Tesseract OCR (Windows/Linux/Mac)

**Windows: Cài Tesseract**
```powershell
# Choco
choco install tesseract

```

---

**Backend Setup**

```powershell
cd backend

# Tạo virtual environment
python -m venv .venv

# Kích hoạt environment
.venv\Scripts\Activate

# Cài dependencies
pip install -r requirements.txt

# Chạy server (reload mode)
uvicorn app.main:app --reload
# Server chạy tại http://localhost:8000
```

**Frontend Setup**

```powershell
cd frontend

# Cài npm packages
npm install

# Chạy dev server
npm run dev
# Frontend chạy tại http://localhost:3000
```


10. Công Nghệ Sử Dụng

**Frontend**
| Công Nghệ | Mục Đích |
|-----------|---------|
| **React** | UI framework |
| **Vite** | Build tool (nhanh hơn Webpack) |
| **Axios** | HTTP client |
| **Canvas API** | Vẽ overlay boxes |
| **MediaDevices API** | Truy cập camera |

**Backend**
| Công Nghệ | Mục Đích |
|-----------|---------|
| **FastAPI** | Web framework (async) |
| **OpenCV** | Computer Vision (contour, warp) |
| **Tesseract** | OCR engine |
| **PIL/Pillow** | Image processing |
| **NumPy** | Matrix operations |
| **ReportLab** | PDF generation |

**DevOps**
| Công Nghệ | Mục Đích |
|-----------|---------|
| **Python venv** | Package isolation |
| **npm** | Node package manager |
| **Uvicorn** | ASGI server |

---

9. Hướng Dẫn Sử Dụng

**Chụp Ảnh Mới**
1. Truy cập [http://localhost:3000](http://localhost:3000)
2. Click "Chụp ảnh" (camera sẽ mở)
3. Định vị tài liệu trong frame
4. Click "Chụp ảnh"

**Upload Ảnh Có Sẵn**
1. Click "Upload ảnh" (chọn file PNG/JPG)
2. Ảnh sẽ hiển thị trong preview

**Phân Tích Ảnh**
1. Click "Phân tích ảnh" 
2. Ứng dụng sẽ:
   - Phát hiện góc giấy
   - Bẻ góc (warp)
   - Nhận diện text (OCR)
   - Hiển thị kết quả

**Sửa Text**
1. Sanitary kết quả OCR trong panel "Kết quả"
2. Sửa text sai trong các ô input
3. Boxes sẽ update realtime

**Xuất PDF**
1. Click "Export PDF"
2. PDF sẽ tự động download
3. PDF chứa:
   - Ảnh warped làm nền
   - Text searchable nhúng lên

---


11. Tài Liệu Tham Khảo

- **OpenCV Perspective Transform**: https://docs.opencv.org/master/da/d54/group__imgproc__transform.html
- **FastAPI**: https://fastapi.tiangolo.com/
- **React Hooks**: https://react.dev/reference/react/hooks
- **ReportLab**: https://www.reportlab.com/docs/reportlab-userguide.pdf

---


12. Tác giả dự án: **Trương Anh Đức**


13. License

Dự án này được phát triển cho mục đích learning/demo.

---


