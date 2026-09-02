/**
 * 
 * Handles WebSocket streaming from ESP32
 */

class ESPTrackerService {
  constructor() {
    const savedHost = localStorage.getItem('esp_tracker_host');
    this.host = (savedHost && savedHost !== 'localhost' && savedHost !== '127.0.0.1') ? savedHost : '192.168.4.1';
    const savedPort = localStorage.getItem('esp_tracker_port');
    this.port = (savedPort && savedPort !== '8081') ? parseInt(savedPort, 10) : 81;
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectTimer = null;
    this.mode = localStorage.getItem('esp_tracker_mode') || 'esp'; // 'esp' | 'mouse'
    this.mirrorX = localStorage.getItem('esp_tracker_mirror_x') === 'true'; // configurable mirror

    // Screen dimensions
    this.screenWidth = 1200;
    this.screenHeight = 800;

    // Dynamic targets cache for ESP32 Aim-Assist (holes & UI buttons)
    this.currentTargets = [];
    this.lastScreenTargets = [];

    // Live tracking telemetry
    this.raw = {
      xCm: 75.0,
      yCm: 70.0,
      normX: 0.5,
      normY: 0.5,
      confidence: 0.0,
      isDetected: false,
      inDeadZone: false,
      secOnline: false,
      distLO: 0,
      distLI: 0,
      distRI: 0,
      distRO: 0,
      timestamp: 0
    };

    this.currentScreenPos = { x: 600, y: 400 };
    this.targetScreenPos = { x: 600, y: 400 };

    this.inDeadZone = false;
    this.deadZoneOffsetY = 60.0; // Distance in cm from ESP ultrasonics considered behind red zone line (default 60cm)
    this.minYCm = 60.0; // Front boundary of play area (>60cm is top of screen)
    this.maxYCm = 200.0; // Back boundary of play area (60cm offset + 140cm play depth)
    this.lastTrackingTime = Date.now();
    this.trackingLost = false;

    // Callbacks & event listeners
    this.listeners = {
      position: [],
      deadzone: [],
      connection: [],
      tracking: [],
      targetsUpdated: [],
      mirrorChange: [],
      modeChange: []
    };

    // Web Audio API context for warning buzzer
    this.audioCtx = null;
    this.buzzerOsc1 = null;
    this.buzzerOsc2 = null;
    this.buzzerGain = null;
    this.buzzerPulseTimer = null;
    this.isBuzzerPlaying = false;

    // Initialize auto-connection
    this.initWebSocket();
  }

  // ----------------------------------------------------
  // WebSocket Connection Management
  // ----------------------------------------------------
  initWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isConnecting = true;
    this.emit('connection', { status: 'CONNECTING', host: this.host, port: this.port });

    try {
      const url = `ws://${this.host}:${this.port}/`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isConnecting = false;
        console.log(`[ESPTracker] Connected to ESP32 at ${url}`);
        this.emit('connection', { status: 'CONNECTED', host: this.host, port: this.port });
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // Resend active targets immediately upon connecting
        if (this.currentTargets && this.currentTargets.length > 0) {
          this.send({ cmd: 'targets', pts: this.currentTargets });
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        this.isConnected = false;
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.isConnecting = false;
        if (this.inDeadZone) {
          this.inDeadZone = false;
          this.raw.inDeadZone = false;
          this.stopDeadZoneBuzzer();
          this.emit('deadzone', { inDeadZone: false });
        }
        if (wasConnected) {
          console.warn('[ESPTracker] WebSocket connection lost. Reconnecting in 2s...');
        }
        this.emit('connection', { status: 'DISCONNECTED', host: this.host, port: this.port });
        this.scheduleReconnect();
      };
    } catch (e) {
      this.isConnected = false;
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initWebSocket();
    }, 2000);
  }

  setHost(newHost, newPort = 81) {
    this.host = newHost.trim();
    this.port = parseInt(newPort, 10) || 81;
    localStorage.setItem('esp_tracker_host', this.host);
    localStorage.setItem('esp_tracker_port', this.port);
    if (this.ws) {
      this.ws.close();
    }
    this.initWebSocket();
  }

  setMode(newMode) {
    this.mode = newMode === 'mouse' ? 'mouse' : 'esp';
    localStorage.setItem('esp_tracker_mode', this.mode);
    console.log(`[ESPTracker] Mode switched to: ${this.mode}`);
    if (this.mode === 'mouse' && this.inDeadZone) {
      this.inDeadZone = false;
      this.raw.inDeadZone = false;
      this.stopDeadZoneBuzzer();
      this.emit('deadzone', { inDeadZone: false });
    }
    this.emit('modeChange', { mode: this.mode });
    this.emit('connection', { status: this.isConnected ? 'CONNECTED' : 'DISCONNECTED', mode: this.mode });
  }

  toggleMode() {
    const nextMode = this.mode === 'esp' ? 'mouse' : 'esp';
    this.setMode(nextMode);
    return this.mode;
  }

  getModeLabel() {
    return this.mode === 'esp' ? '🏃 MODE: BODY TRACKING' : '🖱️ MODE: MOUSE CONTROLS';
  }

  setMirrorX(mirror) {
    this.mirrorX = Boolean(mirror);
    localStorage.setItem('esp_tracker_mirror_x', this.mirrorX);
    this.emit('mirrorChange', { mirrorX: this.mirrorX });

    // Re-evaluate target coordinates with updated mirror setting
    if (this.lastScreenTargets && this.lastScreenTargets.length > 0) {
      this.sendTargets(this.lastScreenTargets);
    }
  }

  // ----------------------------------------------------
  // Coordinate Mapping: Play Area [0.0, 1.0] <-> Screen (1200x800)
  // ----------------------------------------------------
  normToScreen(normX, normY) {
    const clampedNormX = Math.max(0.0, Math.min(1.0, normX));
    const clampedNormY = Math.max(0.0, Math.min(1.0, normY));

    // Mirror X if requested (player facing screen)
    const effectiveNormX = this.mirrorX ? (1.0 - clampedNormX) : clampedNormX;

    // Map to active screen area (2% to 98% horizontally, 5% to 95% vertically)
    const screenX = (0.02 + effectiveNormX * 0.96) * this.screenWidth;
    const screenY = (0.05 + clampedNormY * 0.90) * this.screenHeight;

    return { x: screenX, y: screenY };
  }

  screenToNorm(screenX, screenY) {
    // Inverse horizontal mapping:
    let effectiveNormX = ((screenX / this.screenWidth) - 0.02) / 0.96;
    effectiveNormX = Math.max(0.0, Math.min(1.0, effectiveNormX));

    // Flip back if mirrored
    const normX = this.mirrorX ? (1.0 - effectiveNormX) : effectiveNormX;

    // Inverse vertical mapping:
    let normY = ((screenY / this.screenHeight) - 0.05) / 0.90;
    normY = Math.max(0.0, Math.min(1.0, normY));

    return {
      x: parseFloat(Math.max(0.0, Math.min(1.0, normX)).toFixed(4)),
      y: parseFloat(Math.max(0.0, Math.min(1.0, normY)).toFixed(4))
    };
  }

  // ----------------------------------------------------
  // Dynamic Aim Assist Target Synchronization
  // ----------------------------------------------------
  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
        this.ws.send(msg);
        return true;
      } catch (err) {
        console.warn('[ESPTracker] WebSocket send failed:', err);
      }
    }
    return false;
  }

  sendTargets(targets = []) {
    this.lastScreenTargets = Array.isArray(targets) ? [...targets] : [];

    // Max 16 targets supported by ESP32 firmware (TARGET_MAX_COUNT)
    const sliced = this.lastScreenTargets.slice(0, 16);

    this.currentTargets = sliced.map(tgt => {
      let nx = tgt.x;
      let ny = tgt.y;
      let nr = tgt.r !== undefined ? tgt.r : 0.08;

      // If screen coordinates, convert to normalized play area [0, 1]
      if (nx > 1.0 || ny > 1.0) {
        const norm = this.screenToNorm(nx, ny);
        nx = norm.x;
        ny = norm.y;
      }

      // If pixel radius, normalize relative to average screen dimension
      if (nr > 1.0) {
        nr = parseFloat((nr / 1000.0).toFixed(4));
      }

      const pt = {
        x: parseFloat(Math.max(0.0, Math.min(1.0, nx)).toFixed(4)),
        y: parseFloat(Math.max(0.0, Math.min(1.0, ny)).toFixed(4)),
        r: parseFloat(Math.max(0.02, Math.min(0.30, nr)).toFixed(4)),
        t: tgt.t !== undefined ? tgt.t : 0
      };

      if (tgt.s !== undefined && tgt.s >= 0) {
        pt.s = parseFloat(tgt.s.toFixed(2));
      }
      if (tgt.label) {
        pt.label = String(tgt.label);
      }

      return pt;
    });

    const payload = {
      cmd: 'targets',
      pts: this.currentTargets
    };

    this.send(payload);
    this.emit('targetsUpdated', { targets: this.currentTargets });
  }

  clearTargets() {
    this.lastScreenTargets = [];
    this.currentTargets = [];
    this.send({ cmd: 'clearTargets' });
    this.emit('targetsUpdated', { targets: [] });
  }

  // ----------------------------------------------------
  // Incoming Telemetry Parsing
  // ----------------------------------------------------
  handleMessage(dataStr) {
    try {
      const data = JSON.parse(dataStr);
      if (data.type === 'pos') {
        this.raw.xCm = data.x !== undefined ? data.x : this.raw.xCm;
        this.raw.yCm = data.y !== undefined ? data.y : this.raw.yCm;
        this.raw.confidence = data.c !== undefined ? data.c : 1.0;
        this.raw.isDetected = Boolean(data.det);

        if (data.dz_th !== undefined) {
          this.deadZoneOffsetY = data.dz_th;
        }

        // Offset proximity calculation:
        // Ultrasonics are mounted behind the red line. Any detected player with y < deadZone is across the line.
        const isOffsetDeadZone = this.raw.isDetected && (this.raw.yCm < this.deadZoneOffsetY);
        this.raw.inDeadZone = Boolean(data.dz) || isOffsetDeadZone;
        this.raw.secOnline = Boolean(data.so);
        this.raw.distLO = data.lo || 0;
        this.raw.distLI = data.li || 0;
        this.raw.distRI = data.ri || 0;
        this.raw.distRO = data.ro || 0;
        this.raw.timestamp = Date.now();

        // Prioritize normalized coordinates directly from ESP32 / Simulator Kalman filter
        if (data.nx !== undefined) {
          this.raw.normX = data.nx;
        } else if (data.x !== undefined) {
          this.raw.normX = Math.max(0.0, Math.min(1.0, data.x / 150.0));
        }

        if (data.ny !== undefined) {
          this.raw.normY = data.ny;
        } else if (data.y !== undefined) {
          const normYRange = this.maxYCm - this.minYCm;
          this.raw.normY = normYRange > 0 ? Math.max(0.0, Math.min(1.0, (this.raw.yCm - this.minYCm) / normYRange)) : 0.5;
        }

        this.lastTrackingTime = Date.now();

        if (this.raw.isDetected) {
          if (this.trackingLost) {
            this.trackingLost = false;
            this.emit('tracking', { detected: true });
          }

          // Map normalized coords (0.0 - 1.0) to Screen Pixels (1200x800) using unified mapping
          const screenPos = this.normToScreen(this.raw.normX, this.raw.normY);
          this.targetScreenPos.x = screenPos.x;
          this.targetScreenPos.y = screenPos.y;
        }

        // Dead-zone state transition check
        if (this.raw.inDeadZone !== this.inDeadZone) {
          this.inDeadZone = this.raw.inDeadZone;
          if (this.inDeadZone) {
            this.startDeadZoneBuzzer();
            this.emit('deadzone', { inDeadZone: true });
          } else {
            this.stopDeadZoneBuzzer();
            this.emit('deadzone', { inDeadZone: false });
          }
        }

        this.emit('position', {
          screenX: this.currentScreenPos.x,
          screenY: this.currentScreenPos.y,
          raw: this.raw
        });
      }
    } catch (err) {
      console.warn('[ESPTracker] Parse error on incoming packet:', err);
    }
  }

  // ----------------------------------------------------
  // 60 FPS Interpolation Update (Called in Scene update)
  // ----------------------------------------------------
  update(deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.1);

    if (this.mode === 'esp' && this.raw.isDetected) {
      // Exponential smoothing (smooth responsive lerp)
      const lerpFactor = 1.0 - Math.exp(-dt * 14.0);
      this.currentScreenPos.x += (this.targetScreenPos.x - this.currentScreenPos.x) * lerpFactor;
      this.currentScreenPos.y += (this.targetScreenPos.y - this.currentScreenPos.y) * lerpFactor;
    }

    // Check for loss of tracking timeout (1.5s with no detection)
    if (this.mode === 'esp' && this.isConnected && Date.now() - this.lastTrackingTime > 1500) {
      if (!this.trackingLost) {
        this.trackingLost = true;
        this.emit('tracking', { detected: false });
        if (this.inDeadZone) {
          this.inDeadZone = false;
          this.raw.inDeadZone = false;
          this.stopDeadZoneBuzzer();
          this.emit('deadzone', { inDeadZone: false });
        }
      }
    }
  }

  // ----------------------------------------------------
  // Web Audio API: Mid-Frequency Safety Buzzer
  // ----------------------------------------------------
  initAudio() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  startDeadZoneBuzzer() {
    this.initAudio();
    if (!this.audioCtx || this.isBuzzerPlaying) return;

    try {
      this.isBuzzerPlaying = true;
      const now = this.audioCtx.currentTime;

      this.buzzerOsc1 = this.audioCtx.createOscillator();
      this.buzzerOsc2 = this.audioCtx.createOscillator();
      this.buzzerGain = this.audioCtx.createGain();

      this.buzzerOsc1.type = 'sawtooth';
      this.buzzerOsc1.frequency.setValueAtTime(480, now);

      this.buzzerOsc2.type = 'sine';
      this.buzzerOsc2.frequency.setValueAtTime(540, now);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);

      this.buzzerGain.gain.setValueAtTime(0.18, now);

      this.buzzerOsc1.connect(filter);
      this.buzzerOsc2.connect(filter);
      filter.connect(this.buzzerGain);
      this.buzzerGain.connect(this.audioCtx.destination);

      this.buzzerOsc1.start();
      this.buzzerOsc2.start();

      let pulseState = true;
      this.buzzerPulseTimer = setInterval(() => {
        if (!this.audioCtx || !this.buzzerGain) return;
        pulseState = !pulseState;
        const t = this.audioCtx.currentTime;
        this.buzzerGain.gain.setTargetAtTime(pulseState ? 0.20 : 0.0, t, 0.03);
      }, 140);
    } catch (e) {
      console.warn('[ESPTracker] Audio buzzer error:', e);
    }
  }

  stopDeadZoneBuzzer() {
    if (this.buzzerPulseTimer) {
      clearInterval(this.buzzerPulseTimer);
      this.buzzerPulseTimer = null;
    }
    if (this.buzzerOsc1) {
      try {
        this.buzzerOsc1.stop();
        this.buzzerOsc1.disconnect();
      } catch (e) { }
      this.buzzerOsc1 = null;
    }
    if (this.buzzerOsc2) {
      try {
        this.buzzerOsc2.stop();
        this.buzzerOsc2.disconnect();
      } catch (e) { }
      this.buzzerOsc2 = null;
    }
    this.isBuzzerPlaying = false;
  }

  playWhackSound() {
    this.initAudio();
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const now = this.audioCtx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) { }
  }

  // ----------------------------------------------------
  // Event Emitter Helpers
  // ----------------------------------------------------
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`[ESPTracker] Error in listener for ${event}:`, e);
        }
      });
    }
  }
}

// Global Singleton Instance
window.espTracker = new ESPTrackerService();
