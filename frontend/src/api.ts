import axios from 'axios';

export const API_BASE = "http://localhost:8000";

export interface LineData {
  text: string;
  bbox: [number, number, number, number];
  conf?: number;
}

export interface BlockData {
  type: string;
  bbox: [number, number, number, number];
  lines: LineData[];
  confidence?: number;
}

export interface AnalyzeResponse {
  warped_image_id: string;
  warped_preview_url: string;
  blocks: BlockData[];
}

export interface ExportResponse {
  export_pdf_url: string;
}

export interface ExportPayload {
  warped_image_id: string;
  blocks: BlockData[];
}

export async function analyzeImage(blob: Blob): Promise<AnalyzeResponse> {
  const formData = new FormData();

  const fileName = (blob as File).name || "capture.jpg";
  formData.append("file", blob, fileName);

  try {
    const response = await axios.post<AnalyzeResponse>(
      `${API_BASE}/analyze`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error during image analysis:", error);
    throw new Error("Analyze failed");
  }
}


export async function exportPdf(payload: ExportPayload): Promise<ExportResponse> {
  try {
    const response = await axios.post<ExportResponse>(
      `${API_BASE}/export`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return response.data;
  } catch (error) {
    console.error("Error during PDF export:", error);
    throw new Error("Export failed");
  }
}