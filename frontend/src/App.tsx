import React, { useCallback, useEffect, useRef, useState, ChangeEvent } from "react";
// Đảm bảo file api.ts đã export các interface tương ứng
import { analyzeImage, API_BASE, exportPdf } from "./api";

// --- 1. Định nghĩa các Kiểu dữ liệu (Interfaces) ---

interface Line {
  text: string;
  bbox: [number, number, number, number];
  conf?: number;
}

interface Block {
  type: string;
  bbox: [number, number, number, number];
  lines: Line[];
  confidence?: number;
}

interface AppState {
  previewUrl: string;
  warpedImageId: string;
  warpedPreviewUrl: string;
  blocks: Block[];
}

type Stage = "camera" | "preview" | "edit";

const emptyState: AppState = {
  previewUrl: "",
  warpedImageId: "",
  warpedPreviewUrl: "",
  blocks: [],
};

// --- 2. Component chính ---

export default function App() {
  // Định nghĩa Type cho Refs
  const videoRef = useRef < HTMLVideoElement | null > (null);
  const captureCanvasRef = useRef < HTMLCanvasElement | null > (null);
  const overlayCanvasRef = useRef < HTMLCanvasElement | null > (null);
  const warpedImageRef = useRef < HTMLImageElement | null > (null);
  const fileInputRef = useRef < HTMLInputElement | null > (null);

  // State với kiểu dữ liệu rõ ràng
  const [stage, setStage] = useState < Stage > ("camera");
  const [captureBlob, setCaptureBlob] = useState < Blob | null > (null);
  const [state, setState] = useState < AppState > (emptyState);
  const [error, setError] = useState < string > ("");
  const [busy, setBusy] = useState < boolean > (false);

  // Xử lý Camera
  useEffect(() => {
    if (stage !== "camera") return;

    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((mediaStream) => {
        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      })
      .catch(() => setError("Không thể mở camera. Hãy kiểm tra quyền truy cập."));

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stage]);

  // Chụp ảnh từ Video
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setCaptureBlob(blob);
      setState((prev) => ({ ...prev, previewUrl: URL.createObjectURL(blob) }));
      setStage("preview");
    }, "image/jpeg");
  }, []);

  // Upload file
  const handleFileUpload = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setError("Vui lòng chọn file ảnh.");
      return;
    }
    setCaptureBlob(file);
    setState((prev) => ({ ...prev, previewUrl: URL.createObjectURL(file) }));
    setStage("preview");
    setError("");
  }, []);

  // Hàm dùng chung cho Analyze và Re-Analyze
  const performAnalysis = useCallback(async () => {
    if (!captureBlob) return;
    setBusy(true);
    setError("");
    try {
      const data = await analyzeImage(captureBlob);
      setState((prev) => ({
        ...prev,
        warpedPreviewUrl: `${API_BASE}${data.warped_preview_url}`,
        warpedImageId: data.warped_image_id,
        blocks: data.blocks || [],
      }));
      setStage("edit");
    } catch (err) {
      setError("Phân tích thất bại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }, [captureBlob]);

  // Vẽ Overlay lên Canvas (Bounding Boxes)
  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const image = warpedImageRef.current;
    if (!canvas || !image) return;

    const displayWidth = image.clientWidth || image.width;
    const displayHeight = image.clientHeight || image.height;
    const naturalWidth = image.naturalWidth || displayWidth;
    const naturalHeight = image.naturalHeight || displayHeight;

    if (!displayWidth || !displayHeight) return;

    canvas.width = displayWidth;
    canvas.height = displayHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff6f3c";
    ctx.fillStyle = "rgba(255, 111, 60, 0.12)";

    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;

    state.blocks.forEach((block) => {
      const [x1, y1, x2, y2] = block.bbox || [];
      if (x1 === undefined) return;

      const dx = x1 * scaleX;
      const dy = y1 * scaleY;
      const dw = (x2 - x1) * scaleX;
      const dh = (y2 - y1) * scaleY;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeRect(dx, dy, dw, dh);
    });
  }, [state.blocks]);

  useEffect(() => {
    if (stage === "edit") {
      drawOverlay();
    }
  }, [stage, drawOverlay]);

  // Cập nhật text từng dòng
  const updateLineText = (blockIndex: number, lineIndex: number, value: string) => {
    setState((prev) => {
      const blocks = prev.blocks.map((block, bIndex) => {
        if (bIndex !== blockIndex) return block;
        const lines = (block.lines || []).map((line, lIndex) => {
          if (lIndex !== lineIndex) return line;
          return { ...line, text: value };
        });
        return { ...block, lines };
      });
      return { ...prev, blocks };
    });
  };

  // Xuất file PDF
  const handleExport = useCallback(async () => {
    if (!state.warpedImageId) return;
    setBusy(true);
    setError("");
    try {
      const data = await exportPdf({
        warped_image_id: state.warpedImageId,
        blocks: state.blocks,
      });
      const fileUrl = `${API_BASE}${data.export_pdf_url}`;
      const downloadResponse = await fetch(fileUrl);
      const blob = await downloadResponse.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reconstructed.pdf";
      link.click();
    } catch (err) {
      setError("Export thất bại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }, [state.blocks, state.warpedImageId]);

  const handleReset = () => {
    setStage("camera");
    setCaptureBlob(null);
    setState(emptyState);
    setError("");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <div><h1>TADIZB</h1></div>
        </div>
        <div className="actions">
          {stage !== "camera" && (
            <button className="ghost" onClick={handleReset}>Chụp lại</button>
          )}
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <main className="layout">
        <section className="panel camera-panel">
          <h2>Camera</h2>
          {stage === "camera" && (
            <div className="camera-frame">
              <video ref={videoRef} autoPlay playsInline />
              <div className="guide" />
            </div>
          )}
          {stage === "preview" && (
            <div className="preview-frame">
              <img src={state.previewUrl} alt="Preview" />
            </div>
          )}
          {stage === "edit" && (
            <div className="preview-frame">
              <div className="overlay-wrapper">
                <img
                  ref={warpedImageRef}
                  src={state.warpedPreviewUrl}
                  alt="Warped"
                  onLoad={drawOverlay}
                />
                <canvas ref={overlayCanvasRef} />
              </div>
            </div>
          )}

          <div className="panel-actions">
            {stage === "camera" && (
              <>
                <button className="primary" onClick={handleCapture}>Chụp ảnh</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button className="secondary" onClick={() => fileInputRef.current?.click()}>
                  Upload ảnh
                </button>
              </>
            )}
            {stage === "preview" && (
              <button className="primary" disabled={busy} onClick={performAnalysis}>
                {busy ? "Đang phân tích..." : "Phân tích ảnh"}
              </button>
            )}
            {stage === "edit" && (
              <>
                <button className="secondary" disabled={busy} onClick={performAnalysis}>
                  {busy ? "Đang phân tích lại..." : "Phân tích lại"}
                </button>
                <button className="primary" disabled={busy} onClick={handleExport}>
                  {busy ? "Đang xuất PDF..." : "Export PDF"}
                </button>
              </>
            )}
          </div>
          <canvas ref={captureCanvasRef} className="hidden" />
        </section>

        <section className="panel editor-panel">
          <h2>Kết quả</h2>
          {stage !== "edit" && (
            <div className="hint">Chụp hoặc upload ảnh để phân tích.</div>
          )}
          {stage === "edit" && (
            <div className="block-list">
              {state.blocks.map((block, blockIndex) => (
                <div className="block-card" key={`block-${blockIndex}`}>
                  <div className="block-meta">
                    <span>{block.type}</span>
                    <span>conf: {(block.confidence || 0).toFixed(2)}</span>
                  </div>
                  {(block.lines || []).map((line, lineIndex) => (
                    <input
                      key={`line-${lineIndex}`}
                      value={line.text}
                      onChange={(e) => updateLineText(blockIndex, lineIndex, e.target.value)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}