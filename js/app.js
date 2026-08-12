/**
 * Main Application Controller for CyberVision AR
 * Integrates DeepAR Web SDK 3D Face Filters triggered by MediaPipe Hand Framing Gestures
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const videoEl = document.getElementById('webcam-feed');
  const arCanvasEl = document.getElementById('ar-canvas');
  const deeparCanvasEl = document.getElementById('deepar-canvas');
  
  const startScreen = document.getElementById('start-screen');
  const btnStartCamera = document.getElementById('btn-start-camera');
  const cameraError = document.getElementById('camera-error');
  
  const btnToggleCamera = document.getElementById('btn-toggle-camera');
  const btnToggleMirror = document.getElementById('btn-toggle-mirror');
  const btnToggleSkeleton = document.getElementById('btn-toggle-skeleton');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const btnSnapPhoto = document.getElementById('btn-snap-photo');

  // Status HUD Elements
  const valFps = document.getElementById('val-fps');
  const valHands = document.getElementById('val-hands');
  const valGesture = document.getElementById('val-gesture');
  const chipGesture = document.getElementById('chip-gesture');
  const hudFrameInfo = document.getElementById('hud-frame-info');
  const hudValEffect = document.getElementById('hud-val-effect');
  const hudValStatus = document.getElementById('hud-val-status');

  // Modal Elements
  const modalSnapshot = document.getElementById('modal-snapshot');
  const snapshotImgPreview = document.getElementById('snapshot-img-preview');
  const btnDownloadSnap = document.getElementById('btn-download-snap');
  const btnCloseModal = document.getElementById('btn-close-modal');

  // Controllers
  const tracker = new HandTracker();
  const renderer = new ARRenderer(arCanvasEl);
  const deepARManager = new DeepARManager(deeparCanvasEl);

  let mediaStream = null;
  let selectedDeepAREffect = 'aviators';

  // FPS tracking variables
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let isGestureActive = false;

  /**
   * Start Webcam & DeepAR Engine
   */
  async function startWebcam() {
    try {
      cameraError.classList.add('hidden');
      btnStartCamera.disabled = true;

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoEl.srcObject = mediaStream;
      await videoEl.play();

      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      renderer.resize(vw, vh);

      // Hide start screen overlay
      startScreen.classList.add('hidden');

      // Initialize DeepAR Web SDK
      await deepARManager.init(videoEl);

      // Initialize MediaPipe Hand Tracker
      await tracker.init(videoEl, onHandTrackerResults);
      tracker.startTracking();

      btnSnapPhoto.disabled = false;
      window.arAudio.playClick();

    } catch (err) {
      console.error('WebAR Error:', err);
      cameraError.textContent = `Camera Access Failed: ${err.message || 'Permission denied'}. Please allow camera access.`;
      cameraError.classList.remove('hidden');
      btnStartCamera.disabled = false;
    }
  }

  /**
   * Stop Webcam & DeepAR Engine
   */
  function stopWebcam() {
    if (tracker) {
      tracker.stopTracking();
    }
    if (deepARManager) {
      deepARManager.shutdown();
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    videoEl.srcObject = null;
    renderer.clear();
    startScreen.classList.remove('hidden');
    btnStartCamera.disabled = false;
    btnSnapPhoto.disabled = true;
    hudFrameInfo.classList.add('hidden');
    chipGesture.className = 'status-chip status-idle';
    valGesture.textContent = 'MAKE FRAME GESTURE';
    valHands.textContent = '0 / 2';
    isGestureActive = false;
  }

  /**
   * Hand Tracker Results Callback
   */
  function onHandTrackerResults(results, frameData) {
    // 1. Calculate FPS
    const now = performance.now();
    frameCount++;
    if (now - lastFrameTime >= 1000) {
      valFps.textContent = Math.round((frameCount * 1000) / (now - lastFrameTime));
      frameCount = 0;
      lastFrameTime = now;
    }

    if (videoEl.videoWidth && videoEl.videoHeight) {
      renderer.resize(videoEl.videoWidth, videoEl.videoHeight);
    }

    // 2. Render AR Quadrilateral Overlay
    renderer.render(results, frameData, videoEl);

    // 3. Update HUD & DeepAR Effect Trigger
    const handCount = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
    valHands.textContent = `${handCount} / 2`;

    if (frameData) {
      chipGesture.className = 'status-chip status-active';
      valGesture.textContent = `DEEPAR EFFECT: ${selectedDeepAREffect.toUpperCase()}`;
      hudFrameInfo.classList.remove('hidden');
      hudValEffect.textContent = selectedDeepAREffect.toUpperCase();
      hudValStatus.textContent = 'FRAME LOCKED';

      if (!isGestureActive) {
        window.arAudio.playLockChime();
        // Trigger DeepAR Face Effect when gesture is detected!
        deepARManager.switchEffect(selectedDeepAREffect);
        isGestureActive = true;
      }
    } else {
      chipGesture.className = 'status-chip status-idle';
      valGesture.textContent = 'MAKE FRAME GESTURE';
      hudFrameInfo.classList.add('hidden');
      isGestureActive = false;
    }
  }

  /**
   * Capture Composite AR Snapshot (Video + DeepAR + AR Canvas)
   */
  function captureSnapshot() {
    window.arAudio.playShutterSnap();

    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = arCanvasEl.width;
    snapCanvas.height = arCanvasEl.height;
    const snapCtx = snapCanvas.getContext('2d');

    // Draw Video Feed
    if (renderer.isMirrored) {
      snapCtx.translate(snapCanvas.width, 0);
      snapCtx.scale(-1, 1);
    }
    snapCtx.drawImage(videoEl, 0, 0, snapCanvas.width, snapCanvas.height);

    // Reset Transform & Draw DeepAR + AR Canvas Layer
    snapCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (deepARManager.isInitialized) {
      snapCtx.drawImage(deeparCanvasEl, 0, 0);
    }
    snapCtx.drawImage(arCanvasEl, 0, 0);

    const dataUrl = snapCanvas.toDataURL('image/png');
    snapshotImgPreview.src = dataUrl;
    btnDownloadSnap.href = dataUrl;
    modalSnapshot.classList.remove('hidden');
  }

  // --- Event Listeners ---

  btnStartCamera.addEventListener('click', startWebcam);

  btnToggleCamera.addEventListener('click', () => {
    window.arAudio.playClick();
    if (mediaStream) {
      stopWebcam();
    } else {
      startWebcam();
    }
  });

  btnToggleMirror.addEventListener('click', () => {
    window.arAudio.playClick();
    renderer.isMirrored = !renderer.isMirrored;
    btnToggleMirror.classList.toggle('active', renderer.isMirrored);
    videoEl.classList.toggle('mirrored', renderer.isMirrored);
    arCanvasEl.classList.toggle('mirrored', renderer.isMirrored);
    deeparCanvasEl.classList.toggle('mirrored', renderer.isMirrored);
  });

  btnToggleSkeleton.addEventListener('click', () => {
    window.arAudio.playClick();
    renderer.showSkeleton = !renderer.showSkeleton;
    btnToggleSkeleton.classList.toggle('active', renderer.showSkeleton);
  });

  btnAudioToggle.addEventListener('click', () => {
    window.arAudio.enabled = !window.arAudio.enabled;
    btnAudioToggle.classList.toggle('active', window.arAudio.enabled);
    if (window.arAudio.enabled) window.arAudio.playClick();
  });

  // DeepAR Face Effect Tabs
  document.querySelectorAll('.filter-buttons .btn-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      window.arAudio.playClick();
      document.querySelectorAll('.filter-buttons .btn-tab').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      selectedDeepAREffect = e.target.getAttribute('data-effect');
      deepARManager.switchEffect(selectedDeepAREffect);
    });
  });

  btnSnapPhoto.addEventListener('click', captureSnapshot);

  btnCloseModal.addEventListener('click', () => {
    window.arAudio.playClick();
    modalSnapshot.classList.add('hidden');
  });

  modalSnapshot.addEventListener('click', (e) => {
    if (e.target === modalSnapshot) {
      modalSnapshot.classList.add('hidden');
    }
  });
});
