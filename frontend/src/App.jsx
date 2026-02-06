import React, { useCallback, useEffect, useRef, useState } from "react";
import { analyzeImage, API_BASE, exportPdf } from "./api.js";

const emptyState = {
  previewUrl: "",
  warpedImageId: "",
  warpedPreviewUrl: "",
  blocks: [],
};

export default function App() {
  const videoRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const warpedImageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState("camera");
  const [captureBlob, setCaptureBlob] = useState(null);
  const [state, setState] = useState(emptyState);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (stage !== "camera") {
      return;
    }
    let stream;
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

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) {
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      setCaptureBlob(blob);
      setState((prev) => ({ ...prev, previewUrl: URL.createObjectURL(blob) }));
      setStage("preview");
    }, "image/jpeg");
  }, []);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
      setError("Vui lòng chọn file ảnh.");
      return;
    }
    const blob = file;
    setCaptureBlob(blob);
    setState((prev) => ({ ...prev, previewUrl: URL.createObjectURL(blob) }));
    setStage("preview");
    setError("");
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!captureBlob) {
      return;
    }
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

  const handleReAnalyze = useCallback(async () => {
    if (!captureBlob) {
      return;
    }
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
    } catch (err) {
      setError("Phân tích thất bại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }, [captureBlob]);

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const image = warpedImageRef.current;
    if (!canvas || !image) {
      return;
    }
    const displayWidth = image.clientWidth || image.width;
    const displayHeight = image.clientHeight || image.height;
    const naturalWidth = image.naturalWidth || displayWidth;
    const naturalHeight = image.naturalHeight || displayHeight;
    if (!displayWidth || !displayHeight) {
      return;
    }
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ff6f3c";
    ctx.fillStyle = "rgba(255, 111, 60, 0.12)";
    const scaleX = displayWidth / naturalWidth;
    const scaleY = displayHeight / naturalHeight;
    state.blocks.forEach((block) => {
      const [x1, y1, x2, y2] = block.bbox || [];
      if (x1 === undefined) {
        return;
      }
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

  const updateLineText = (blockIndex, lineIndex, value) => {
    setState((prev) => {
      const blocks = prev.blocks.map((block, bIndex) => {
        if (bIndex !== blockIndex) {
          return block;
        }
        const lines = (block.lines || []).map((line, lIndex) => {
          if (lIndex !== lineIndex) {
            return line;
          }
          return { ...line, text: value };
        });
        return { ...block, lines };
      });
      return { ...prev, blocks };
    });
  };

  /*const splitBlocksToLines = () => {
    setState((prev) => {
      const blocks = prev.blocks.flatMap((block) => {
        if (block.type !== "text") {
          return [block];
        }
        return (block.lines || []).map((line) => ({
          type: "text",
          bbox: line.bbox,
          lines: [line],
          confidence: line.conf,
        }));
      });
      return { ...prev, blocks };
    });
  };

  const mergeAllText = () => {
    setState((prev) => {
      const lines = prev.blocks
        .flatMap((block) => (block.type === "text" ? block.lines || [] : []))
        .filter((line) => line.text && line.text.trim().length > 0);
      if (!lines.length) {
        return prev;
      }
      const bbox = lines.reduce(
        (acc, line) => [
          Math.min(acc[0], line.bbox[0]),
          Math.min(acc[1], line.bbox[1]),
          Math.max(acc[2], line.bbox[2]),
          Math.max(acc[3], line.bbox[3]),
        ],
        [lines[0].bbox[0], lines[0].bbox[1], lines[0].bbox[2], lines[0].bbox[3]]
      );
      return {
        ...prev,
        blocks: [
          {
            type: "text",
            bbox,
            lines: [
              {
                text: lines.map((line) => line.text).join(" "),
                bbox,
                conf: Math.min(...lines.map((line) => line.conf || 1)),
              },
            ],
            confidence: Math.min(...lines.map((line) => line.conf || 1)),
          },
        ],
      };
    });
  };*/

  const handleExport = useCallback(async () => {
    if (!state.warpedImageId) {
      return;
    }
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
          <div>
            <h1>TADIZB</h1>
          </div>
        </div>
        <div className="actions">
          {stage !== "camera" && (
            <button className="ghost" onClick={handleReset}>
              Chụp lại
            </button>
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
                <button className="primary" onClick={handleCapture}>
                  Chụp ảnh
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  className="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload ảnh
                </button>
              </>
            )}
            {stage === "preview" && (
              <button className="primary" disabled={busy} onClick={handleAnalyze}>
                {busy ? "Đang phân tích..." : "Phân tích ảnh"}
              </button>
            )}
            {stage === "edit" && (
              <>
                <button className="secondary" disabled={busy} onClick={handleReAnalyze}>
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
            <div className="hint">
              Chụp hoặc upload ảnh để phân tích. Kết quả sẽ hiển thị tại đây.
            </div>
          )}
          {stage === "edit" && (
            <>
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
                        onChange={(event) =>
                          updateLineText(blockIndex, lineIndex, event.target.value)
                        }
                      />
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}