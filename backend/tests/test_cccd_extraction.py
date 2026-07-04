"""Kiểm tra các điều kiện chặt cho CCCD, họ tên và ngày sinh."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline import extract_cccd_info
from app.services.gemini_ocr import _enforce_document_rules


def test_extracts_values_only_near_labels():
    result = extract_cccd_info(
        "Họ và tên: NGUYỄN THANH HIẾU\n"
        "Số CCCD: 001207012345\n"
        "Ngày sinh / DOB: 27/12/2007"
    )

    assert result["ho_va_ten"] == "NGUYỄN THANH HIẾU"
    assert result["so_cccd"] == "001207012345"
    assert result["ngay_sinh"] == "27/12/2007"


def test_does_not_treat_student_id_as_cccd():
    result = extract_cccd_info(
        "HÀ NỘI\nTHẺ SINH VIÊN\nMSSV / Student ID: 202516562\n"
        "Ngày sinh / DOB: 27/12/2007"
    )

    assert result["ho_va_ten"] is None
    assert result["so_cccd"] is None
    assert result["ngay_sinh"] == "27/12/2007"


def test_rejects_unlabelled_cccd_and_unlabelled_or_invalid_birth_date():
    unlabelled = extract_cccd_info("001207012345\n27/12/2007\n30/07/2029")
    invalid_date = extract_cccd_info("Ngày sinh: 31/02/2007")

    assert unlabelled["so_cccd"] is None
    assert unlabelled["ngay_sinh"] is None
    assert invalid_date["ngay_sinh"] is None


def test_rejects_location_as_name_in_spatial_fallback():
    blocks = [{"lines": [{"text": "HÀ NỘI", "conf": 99, "bbox": [0, 10, 100, 30]}]}]

    result = extract_cccd_info("HÀ NỘI", blocks=blocks, image_height=100)

    assert result["ho_va_ten"] is None


def test_ai_result_is_also_checked_by_deterministic_rules():
    result = _enforce_document_rules(
        "HÀ NỘI\nMSSV / Student ID: 202516562\nNgày sinh: 27/12/2007",
        {
            "ho_va_ten": "HÀ NỘI",
            "so_cccd": "202516562",
            "ngay_sinh": "27/12/2007",
        },
    )

    assert result["ho_va_ten"] is None
    assert result["so_cccd"] is None
    assert result["ngay_sinh"] == "27/12/2007"
