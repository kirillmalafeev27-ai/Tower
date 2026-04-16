class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.threatGain = null;
    this.nodes = [];
    this.intervals = [];
    this.initialized = false;
  }

  init() {
    this.dispose();

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API is unavailable:', error);
      return;
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.24;
    this.masterGain.connect(this.ctx.destination);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.18;
    this.ambienceGain.connect(this.masterGain);

    this.threatGain = this.ctx.createGain();
    this.threatGain.gain.value = 0;
    this.threatGain.connect(this.masterGain);

    this.initialized = true;
    this._startAmbience();
    this._startThreatLoop();
    this._startRattles();
  }

  setThreatLevel(level) {
    if (!this.initialized || !this.threatGain) {
      return;
    }

    const value = Math.max(0, Math.min(1, level));
    this.threatGain.gain.setTargetAtTime(value * 0.32, this.ctx.currentTime, 0.16);
  }

  setCrusherDanger(level) {
    this.setThreatLevel(level);
  }

  playCorrectAnswer() {
    this._triad([440, 554, 659], 'triangle', 0.11, 0.22, 0.04);
  }

  playWrongAnswer() {
    if (!this.initialized) {
      return;
    }

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(116, time + 0.26);
    gain.gain.setValueAtTime(0.07, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  playStep() {
    this._noiseBurst(0.05, 380, 0.09);
  }

  playHatchOpen() {
    this._triad([329, 392, 493], 'sine', 0.08, 0.32, 0.05);
  }

  playHatchFail() {
    this._tone(178, 'triangle', 0.12, 0.16, 0.18);
  }

  playReveal() {
    this._tone(740, 'sine', 0.06, 0.18, 0.2);
    this._tone(990, 'sine', 0.04, 0.15, 0.28);
  }

  playBoxWarning() {
    this._tone(168, 'triangle', 0.04, 0.32, 0);
    this._tone(142, 'triangle', 0.035, 0.34, 0.18);
    this._noiseBurst(0.08, 240, 0.025, 0.05);
  }

  playFortify() {
    this._triad([220, 277, 330], 'triangle', 0.09, 0.34, 0.04);
  }

  playStealth() {
    this._tone(520, 'sine', 0.05, 0.18, 0.04);
    this._tone(388, 'sine', 0.05, 0.24, 0.12);
  }

  playCleanup() {
    this._noiseBurst(0.09, 520, 0.1);
  }

  playBoxFall() {
    if (!this.initialized) {
      return;
    }

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.42);
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    gain.gain.setValueAtTime(0.14, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.48);

    this._noiseBurst(0.08, 280, 0.08, 0.03);
  }

  playMonsterDrop() {
    this._tone(86, 'sawtooth', 0.18, 0.48, 0.02);
  }

  playMonsterGrab() {
    this._tone(70, 'square', 0.22, 0.42, 0);
    this._noiseBurst(0.12, 180, 0.12, 0.02);
  }

  playQuakeWarning() {
    this._tone(132, 'triangle', 0.06, 0.3, 0.06);
    this._tone(118, 'triangle', 0.06, 0.3, 0.22);
  }

  playQuakeImpact() {
    this._tone(48, 'sawtooth', 0.2, 0.6, 0);
    this._noiseBurst(0.18, 140, 0.14, 0.02);
  }

  playCollapse() {
    this._tone(64, 'triangle', 0.18, 0.72, 0.02);
  }

  dispose() {
    this.intervals.forEach((intervalId) => clearInterval(intervalId));
    this.intervals = [];

    this.nodes.forEach((node) => {
      try {
        node.stop();
      } catch (error) {
        void error;
      }
    });
    this.nodes = [];

    if (this.ctx) {
      this.ctx.close().catch(() => {});
    }

    this.ctx = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.threatGain = null;
    this.initialized = false;
  }

  _startAmbience() {
    const drone = this.ctx.createOscillator();
    const droneGain = this.ctx.createGain();
    drone.type = 'triangle';
    drone.frequency.value = 43;
    droneGain.gain.value = 0.06;
    drone.connect(droneGain);
    droneGain.connect(this.ambienceGain);
    drone.start();
    this.nodes.push(drone);

    const high = this.ctx.createOscillator();
    const highGain = this.ctx.createGain();
    high.type = 'sine';
    high.frequency.value = 178;
    highGain.gain.value = 0.012;
    high.connect(highGain);
    highGain.connect(this.ambienceGain);
    high.start();
    this.nodes.push(high);
  }

  _startThreatLoop() {
    const rumble = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    rumble.type = 'triangle';
    rumble.frequency.value = 31;
    filter.type = 'lowpass';
    filter.frequency.value = 88;
    rumble.connect(filter);
    filter.connect(this.threatGain);
    rumble.start();
    this.nodes.push(rumble);
  }

  _startRattles() {
    const interval = setInterval(() => {
      if (!this.initialized) {
        return;
      }

      const time = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 300 + Math.random() * 260;
      gain.gain.setValueAtTime(0.012, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      osc.connect(gain);
      gain.connect(this.ambienceGain);
      osc.start(time);
      osc.stop(time + 0.2);
    }, 5200);

    this.intervals.push(interval);
  }

  _triad(frequencies, type, gainAmount, duration, stepDelay) {
    if (!this.initialized) {
      return;
    }

    frequencies.forEach((frequency, index) => {
      this._tone(frequency, type, gainAmount, duration, index * stepDelay);
    });
  }

  _tone(frequency, type, gainAmount, duration, delay) {
    if (!this.initialized) {
      return;
    }

    const time = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(gainAmount, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  _noiseBurst(duration, lowpass, gainAmount, delay = 0) {
    if (!this.initialized) {
      return;
    }

    const start = this.ctx.currentTime + delay;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }

    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    gain.gain.setValueAtTime(gainAmount, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(start);
  }
}
