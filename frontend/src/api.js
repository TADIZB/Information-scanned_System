import axios from 'axios';

export const API_BASE = "http://localhost:8000";

export async function analyzeImage(blob) {
  const formData = new FormData();
  formData.append("file", blob, "capture.jpg");
  try {
    const response = await axios.post(`${API_BASE}/analyze`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    throw new Error("Analyze failed");
  }
}

export async function exportPdf(payload) {
  try {
    const response = await axios.post(`${API_BASE}/export`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  } catch (error) {
    throw new Error("Export failed");
  }
}