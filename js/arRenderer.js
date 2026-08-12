/**
 * AR Renderer Canvas Engine for CyberVision AR
 * Supports Quadrilateral Clipping, Real-Time Posterize & Sobel Edge-Detection Cel-Shaded Comic Filter
 */
class ARRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.showSkeleton = true;
    this.isMirrored = true;

    // Offscreen Canvas Buffer for Real-Time Pixel Processing
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });

    // Animation state
    this.pulsePhase = 0;
    this.spiderWebAngle = 0;
    this.animeSpeedOffset = 0;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(results, frameData, videoElement) {
    this.clear();
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 1. Render Hand Skeletons if enabled
    if (this.showSkeleton && results && results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((landmarks) => {
        this.drawHandSkeleton(landmarks, width, height);
      });
    }

    // 2. Render AR Quadrilateral Overlay & Live Filter
    if (frameData && frameData.points && frameData.points.length === 4) {
      const points = frameData.points.map(p => ({
        x: p.x * width,
        y: p.y * height
      }));

      this.pulsePhase += 0.06;
      this.spiderWebAngle += 0.03;
      this.animeSpeedOffset = (this.animeSpeedOffset + 4) % 100;

      if (frameData.gestureType === 'anime') {
        this.renderAnimeCameraFilter(points, videoElement, width, height);
      } else if (frameData.gestureType === 'spiderman') {
        this.renderSpiderManFilter(points, videoElement, width, height);
      }
    }
  }

  drawHandSkeleton(landmarks, width, height) {
    const ctx = this.ctx;
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],[0,17]
    ];

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;

    connections.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    });

    landmarks.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, idx === 4 || idx === 8 ? 6 : 3, 0, 2 * Math.PI);
      ctx.fillStyle = (idx === 4 || idx === 8) ? '#ff0055' : '#00f0ff';
      ctx.shadowColor = (idx === 4 || idx === 8) ? '#ff0055' : '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.fill();
    });

    ctx.restore();
  }

  traceQuadPath(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
  }

  /**
   * Real-Time Cel-Shaded Comic Book Filter with Posterization & Sobel Edge Detection
   */
  renderAnimeCameraFilter(points, videoElement, width, height) {
    const ctx = this.ctx;
    ctx.save();

    // 1. Clip canvas inside exact hand Quadrilateral
    this.traceQuadPath(ctx, points);
    ctx.clip();

    // 2. Prepare Offscreen Buffer for Cel-Shaded Pixel Processing
    const quadMinX = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))));
    const quadMinY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
    const quadMaxX = Math.min(width, Math.ceil(Math.max(...points.map(p => p.x))));
    const quadMaxY = Math.min(height, Math.ceil(Math.max(...points.map(p => p.y))));
    const bw = Math.max(1, quadMaxX - quadMinX);
    const bh = Math.max(1, quadMaxY - quadMinY);

    this.offscreenCanvas.width = bw;
    this.offscreenCanvas.height = bh;
    const octx = this.offscreenCtx;

    // Apply CSS Contrast & Saturation as requested
    octx.save();
    octx.filter = 'contrast(150%) saturate(200%)';
    octx.drawImage(videoElement, quadMinX, quadMinY, bw, bh, 0, 0, bw, bh);
    octx.restore();

    // Perform Posterization & Sobel Edge Detection Pixel Manipulation
    try {
      const imageData = octx.getImageData(0, 0, bw, bh);
      const data = imageData.data;
      const gray = new Uint8Array(bw * bh);

      // Pass 1: Color Quantization (Posterization) + Grayscale extraction
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Grayscale for Sobel
        gray[i >> 2] = (r * 0.299 + g * 0.587 + b * 0.114) | 0;

        // Posterize RGB channels into 4 discrete color steps (Cel-shading)
        data[i]     = Math.min(255, ((r >> 6) << 6) + 32);
        data[i + 1] = Math.min(255, ((g >> 6) << 6) + 32);
        data[i + 2] = Math.min(255, ((b >> 6) << 6) + 32);
      }

      // Pass 2: Sobel Edge Detection for Comic Book Outlines
      for (let y = 1; y < bh - 1; y++) {
        for (let x = 1; x < bw - 1; x++) {
          const idx = y * bw + x;

          // Sobel Kernels
          const gx = -gray[idx - bw - 1] + gray[idx - bw + 1]
                     - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                     - gray[idx + bw - 1] + gray[idx + bw + 1];
          const gy = -gray[idx - bw - 1] - 2 * gray[idx - bw] - gray[idx - bw + 1]
                     + gray[idx + bw - 1] + 2 * gray[idx + bw] + gray[idx + bw + 1];
          
          const mag = Math.abs(gx) + Math.abs(gy);

          // Draw dark comic outline if edge gradient magnitude exceeds threshold
          if (mag > 110) {
            const pIdx = idx << 2;
            data[pIdx] = 12;     // Dark ink edge
            data[pIdx + 1] = 12;
            data[pIdx + 2] = 12;
          }
        }
      }

      octx.putImageData(imageData, 0, 0);
      ctx.drawImage(this.offscreenCanvas, quadMinX, quadMinY);

    } catch (e) {
      // Fallback if cross-origin or canvas read fails
      ctx.save();
      ctx.filter = 'contrast(150%) saturate(200%)';
      ctx.drawImage(videoElement, 0, 0, width, height);
      ctx.restore();
    }

    // 3. Speed lines overlay from center
    const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
    const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15);
      ctx.lineTo(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300);
      ctx.stroke();
    }

    // Comic Panel Tag
    ctx.font = '900 22px "Orbitron", sans-serif';
    ctx.fillStyle = '#ffea00';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.strokeText('CEL-SHADED COMIC PANEL ★', cx, cy);
    ctx.fillText('CEL-SHADED COMIC PANEL ★', cx, cy);

    ctx.restore(); // Unclip

    // 4. Draw Quadrilateral Comic Frame Outer Border
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 6;
    this.traceQuadPath(ctx, points);
    ctx.stroke();

    ctx.strokeStyle = '#ffea00';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffea00';
    ctx.shadowBlur = 12;
    this.traceQuadPath(ctx, points);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Spider-Man Filter Inside & Around Hand Quadrilateral
   */
  renderSpiderManFilter(points, videoElement, width, height) {
    const ctx = this.ctx;
    ctx.save();

    // 1. Clip canvas inside exact hand Quadrilateral
    this.traceQuadPath(ctx, points);
    ctx.clip();

    // 2. Draw Live Video Feed with contrast(150%) & saturate(200%)
    ctx.save();
    ctx.filter = 'contrast(150%) saturate(200%) sepia(15%)';
    ctx.drawImage(videoElement, 0, 0, width, height);
    ctx.restore();

    // Red/Dark Vignette tint inside frame
    const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4;
    const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4;

    const radGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 250);
    radGrad.addColorStop(0, 'rgba(255, 0, 50, 0.15)');
    radGrad.addColorStop(1, 'rgba(10, 0, 30, 0.65)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);

    // 3. Spider Web Lattice inside Quad
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;

    points.forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    });

    const ringCount = 4;
    for (let r = 1; r <= ringCount; r++) {
      const factor = r / ringCount;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % 4];
        const rx1 = cx + (p1.x - cx) * factor;
        const ry1 = cy + (p1.y - cy) * factor;
        const rx2 = cx + (p2.x - cx) * factor;
        const ry2 = cy + (p2.y - cy) * factor;

        if (i === 0) ctx.moveTo(rx1, ry1);
        ctx.quadraticCurveTo(cx, cy, rx2, ry2);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // 4. Spider-Man Glowing Eyes in Center
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e60000';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(cx - 25, cy - 10);
    ctx.quadraticCurveTo(cx - 5, cy - 25, cx - 5, cy + 5);
    ctx.quadraticCurveTo(cx - 20, cy + 15, cx - 25, cy - 10);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 25, cy - 10);
    ctx.quadraticCurveTo(cx + 5, cy - 25, cx + 5, cy + 5);
    ctx.quadraticCurveTo(cx + 20, cy + 15, cx + 25, cy - 10);
    ctx.fill(); ctx.stroke();

    ctx.restore(); // Unclip

    // 5. Outer Spider-Man Web Outer Frame
    ctx.save();
    ctx.strokeStyle = '#e60000';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#e60000';
    ctx.shadowBlur = 15;
    this.traceQuadPath(ctx, points);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    this.traceQuadPath(ctx, points);
    ctx.stroke();

    ctx.font = '900 20px "Orbitron", sans-serif';
    ctx.fillStyle = '#e60000';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.textAlign = 'center';
    ctx.strokeText('🕷️ SPIDER-VISION 🕷️', cx, cy + 55);
    ctx.fillText('🕷️ SPIDER-VISION 🕷️', cx, cy + 55);

    ctx.restore();
  }
}

window.ARRenderer = ARRenderer;
