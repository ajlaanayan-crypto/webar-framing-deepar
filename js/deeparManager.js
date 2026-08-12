/**
 * DeepAR Web SDK Manager for CyberVision AR
 * Triggers 3D Face Filters when MediaPipe framing gesture is detected
 */
class DeepARManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.deepAR = null;
    this.isInitialized = false;
    this.activeEffect = 'aviators'; // Default sample effect
    this.effectsMap = {
      'aviators': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/aviators',
      'koala': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/koala',
      'dalmatians': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/dalmatians',
      'flowers': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/flowers',
      'lion': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/lion',
      'slash': 'https://cdn.jsdelivr.net/npm/deepar@5.4.1/effects/slash'
    };
    
    // DeepAR Web SDK License Key (Free Preview / Trial key format)
    this.licenseKey = 'a566cf2c7e0081d5ee45b98a005ee5dc3d9f3d9b407a513511ff31ff21516766487e4be68b31a3fb';
  }

  async init(videoElement) {
    try {
      if (typeof deepar === 'undefined' && typeof DeepAR === 'undefined') {
        console.warn('DeepAR Web SDK script not found. Loading fallback mode.');
        return false;
      }

      const deeparLib = typeof deepar !== 'undefined' ? deepar : window.DeepAR;

      this.deepAR = await deeparLib.initialize({
        licenseKey: this.licenseKey,
        canvas: this.canvas,
        effect: this.effectsMap[this.activeEffect],
        numberOfFaces: 1
      });

      this.isInitialized = true;
      console.log('DeepAR Web SDK initialized successfully!');
      return true;

    } catch (err) {
      console.warn('DeepAR Initialization Notice:', err);
      // Degrade gracefully if license key requires active domain registration
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Switch 3D Face AR effect when framing gesture is detected
   */
  async switchEffect(effectName) {
    if (!this.isInitialized || !this.deepAR) return;

    if (this.effectsMap[effectName]) {
      this.activeEffect = effectName;
      await this.deepAR.switchEffect(this.effectsMap[effectName]);
    }
  }

  /**
   * Clear active face effect
   */
  async clearEffect() {
    if (!this.isInitialized || !this.deepAR) return;
    await this.deepAR.clearEffect();
  }

  shutdown() {
    if (this.deepAR && typeof this.deepAR.shutdown === 'function') {
      this.deepAR.shutdown();
    }
    this.isInitialized = false;
  }
}

window.DeepARManager = DeepARManager;
