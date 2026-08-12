/**
 * Hand Tracker Module using MediaPipe Hands
 * Ultra-fast tracking for L-shape Anime & Full-Hand Spider-Man gestures
 */
class HandTracker {
  constructor() {
    this.hands = null;
    this.onResultsCallback = null;
    this.isTracking = false;
    
    // Smoothed 4-point quadrilateral corners: [P0, P1, P2, P3]
    this.smoothedQuad = null;
    this.smoothingAlpha = 0.45; // High responsiveness for fast hand movement
  }

  async init(videoElement, onResults) {
    this.onResultsCallback = onResults;

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55
    });

    this.hands.onResults((results) => this.handleResults(results));

    // High performance frame processing loop
    const processFrame = async () => {
      if (this.isTracking && videoElement && videoElement.readyState >= 2) {
        await this.hands.send({ image: videoElement });
      }
      if (this.isTracking) {
        requestAnimationFrame(processFrame);
      }
    };

    this.startTracking = () => {
      this.isTracking = true;
      requestAnimationFrame(processFrame);
    };

    this.stopTracking = () => {
      this.isTracking = false;
    };
  }

  handleResults(results) {
    let frameData = null;
    const handLandmarks = results.multiHandLandmarks || [];
    
    if (handLandmarks.length === 2) {
      frameData = this.detectGestures(handLandmarks[0], handLandmarks[1]);
    } else {
      this.smoothedQuad = null;
    }

    if (this.onResultsCallback) {
      this.onResultsCallback(results, frameData);
    }
  }

  /**
   * Detects whether hands form L-Shape (Anime Filter) or Full Hand (Spider-Man Filter)
   */
  detectGestures(hand1, hand2) {
    const getHandInfo = (hand) => {
      const wrist = hand[0];
      const thumbTip = hand[4];
      const indexTip = hand[8];
      const middleTip = hand[12];
      const ringTip = hand[16];
      const pinkyTip = hand[20];

      const thumbMcp = hand[2];
      const indexMcp = hand[5];

      // Measure finger extensions from wrist
      const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const wristDist = (p) => dist(p, wrist);

      const isIndexExt = wristDist(indexTip) > wristDist(indexMcp) * 1.3;
      const isThumbExt = dist(thumbTip, thumbMcp) > 0.04;
      const isMiddleExt = wristDist(middleTip) > wristDist(hand[10]) * 1.2;
      const isRingExt = wristDist(ringTip) > wristDist(hand[14]) * 1.2;
      const isPinkyExt = wristDist(pinkyTip) > wristDist(hand[18]) * 1.2;

      const openFingersCount = [isIndexExt, isThumbExt, isMiddleExt, isRingExt, isPinkyExt].filter(Boolean).length;

      return {
        thumbTip, indexTip, middleTip, ringTip, pinkyTip, wrist,
        isLShape: isIndexExt && isThumbExt && !isRingExt && !isPinkyExt,
        isFullHand: openFingersCount >= 4
      };
    };

    const h1 = getHandInfo(hand1);
    const h2 = getHandInfo(hand2);

    let gestureType = null; // 'anime' | 'spiderman'

    if (h1.isFullHand && h2.isFullHand) {
      gestureType = 'spiderman';
    } else if (h1.isLShape && h2.isLShape) {
      gestureType = 'anime';
    } else {
      // Fallback if hands are open framing
      gestureType = (h1.isFullHand || h2.isFullHand) ? 'spiderman' : 'anime';
    }

    // Select 4 defining points for the quadrilateral frame
    let points = [];
    if (gestureType === 'anime') {
      // L-shape: 1 index finger tip & 1 thumb tip from each hand
      points = [
        { x: h1.indexTip.x, y: h1.indexTip.y },
        { x: h1.thumbTip.x, y: h1.thumbTip.y },
        { x: h2.indexTip.x, y: h2.indexTip.y },
        { x: h2.thumbTip.x, y: h2.thumbTip.y }
      ];
    } else {
      // Spider-Man full hand: use index & pinky/thumb tips to define wide frame
      points = [
        { x: h1.indexTip.x, y: h1.indexTip.y },
        { x: h1.pinkyTip.x, y: h1.pinkyTip.y },
        { x: h2.indexTip.x, y: h2.indexTip.y },
        { x: h2.pinkyTip.x, y: h2.pinkyTip.y }
      ];
    }

    // Sort 4 points radially clockwise around their centroid to form a clean quadrilateral
    const sortedQuad = this.sortPointsClockwise(points);

    // Smooth quadrilateral points using EMA
    if (!this.smoothedQuad || this.smoothedQuad.gestureType !== gestureType) {
      this.smoothedQuad = {
        points: sortedQuad,
        gestureType
      };
    } else {
      const alpha = this.smoothingAlpha;
      for (let i = 0; i < 4; i++) {
        this.smoothedQuad.points[i].x += (sortedQuad[i].x - this.smoothedQuad.points[i].x) * alpha;
        this.smoothedQuad.points[i].y += (sortedQuad[i].y - this.smoothedQuad.points[i].y) * alpha;
      }
      this.smoothedQuad.gestureType = gestureType;
    }

    return this.smoothedQuad;
  }

  /**
   * Sorts 4 points in radial order to form a convex quadrilateral
   */
  sortPointsClockwise(points) {
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

    return [...points].sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });
  }
}

window.HandTracker = HandTracker;
