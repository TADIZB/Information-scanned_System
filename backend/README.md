# Backend (FastAPI)

## Setup
1. Install Tesseract OCR binary.
2. Create venv and install deps:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run
```powershell
uvicorn app.main:app --reload --port 8000
```

## Notes
- Storage: `backend/storage/warped` and `backend/storage/pdf`
- API:
  - `POST /analyze` (multipart form, image file)
  - `POST /export` (json with `warped_image_id` + `blocks`)
