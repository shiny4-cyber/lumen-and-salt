// Every sound in the game is synthesised here with WebAudio: no audio files, nothing
// downloaded. The context is created on the first key or click (browsers refuse earlier),
// and each cue is a short envelope on an oscillator or a burst of filtered noise.

const NOISE_SECONDS = 1.2;

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let thruster = null;
  let drone = null;

  function makeNoise() {
    const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = 0.96 * last + 0.04 * white;
      data[index] = last * 3.2;
    }
    return buffer;
  }

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuffer = makeNoise();

    // A low engine hum that follows the ballast pump, plus the abyss drone underneath.
    thruster = ctx.createOscillator();
    thruster.type = 'sawtooth';
    thruster.frequency.value = 46;
    const thrusterGain = ctx.createGain();
    thrusterGain.gain.value = 0;
    const thrusterFilter = ctx.createBiquadFilter();
    thrusterFilter.type = 'lowpass';
    thrusterFilter.frequency.value = 260;
    thruster.connect(thrusterFilter).connect(thrusterGain).connect(master);
    thruster.start();
    thruster.gain = thrusterGain;

    drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 61.5;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    drone.connect(droneGain).connect(master);
    drone.start();
  }

  function tone({ freq, endFreq, type = 'sine', gain = 0.3, attack = 0.005, decay = 0.25, delay = 0 }) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + decay);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    osc.connect(amp).connect(master);
    osc.start(start);
    osc.stop(start + attack + decay + 0.05);
  }

  function noise({ gain = 0.2, decay = 0.3, lowpass = 900, highpass = 120, delay = 0 }) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = lowpass;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = highpass;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    source.connect(high).connect(low).connect(amp).connect(master);
    source.start(start);
    source.stop(start + decay + 0.05);
  }

  const cues = {
    fire() {
      tone({ freq: 620, endFreq: 180, type: 'square', gain: 0.16, decay: 0.16 });
      noise({ gain: 0.1, decay: 0.12, lowpass: 2200 });
    },
    attach() {
      tone({ freq: 190, endFreq: 320, type: 'triangle', gain: 0.26, decay: 0.18 });
      noise({ gain: 0.18, decay: 0.1, lowpass: 1400 });
    },
    release() {
      tone({ freq: 320, endFreq: 150, type: 'triangle', gain: 0.12, decay: 0.14 });
    },
    snap() {
      tone({ freq: 900, endFreq: 90, type: 'sawtooth', gain: 0.3, decay: 0.3 });
      noise({ gain: 0.28, decay: 0.24, lowpass: 3200 });
    },
    cut() {
      noise({ gain: 0.09, decay: 0.09, lowpass: 2600, highpass: 900 });
      tone({ freq: 240, endFreq: 320, type: 'sawtooth', gain: 0.05, decay: 0.08 });
    },
    salvage() {
      tone({ freq: 660, type: 'triangle', gain: 0.2, decay: 0.18 });
      tone({ freq: 990, type: 'sine', gain: 0.16, decay: 0.3, delay: 0.07 });
    },
    damage() {
      tone({ freq: 130, endFreq: 44, type: 'sine', gain: 0.38, decay: 0.42 });
      noise({ gain: 0.3, decay: 0.32, lowpass: 700 });
    },
    collapse() {
      noise({ gain: 0.4, decay: 0.9, lowpass: 420, highpass: 40 });
      tone({ freq: 70, endFreq: 32, type: 'sawtooth', gain: 0.24, decay: 0.8 });
    },
    surface() {
      const notes = [392, 523.25, 659.25, 784];
      notes.forEach((freq, index) => tone({ freq, type: 'triangle', gain: 0.16, decay: 0.5, delay: index * 0.09 }));
    },
    win() {
      const notes = [523.25, 659.25, 784, 1046.5, 1318.5];
      notes.forEach((freq, index) => tone({ freq, type: 'triangle', gain: 0.18, decay: 0.7, delay: index * 0.12 }));
    },
    sonar() {
      tone({ freq: 1180, endFreq: 620, type: 'sine', gain: 0.16, decay: 0.9 });
      tone({ freq: 880, endFreq: 440, type: 'sine', gain: 0.1, decay: 1.4, delay: 0.08 });
    },
    deep() {
      tone({ freq: 92, endFreq: 58, type: 'sine', gain: 0.26, decay: 1.4 });
      tone({ freq: 138, type: 'triangle', gain: 0.08, decay: 1.8, delay: 0.15 });
      noise({ gain: 0.12, decay: 1.2, lowpass: 240 });
    },
    dead() {
      tone({ freq: 220, endFreq: 40, type: 'sawtooth', gain: 0.3, decay: 1.2 });
      noise({ gain: 0.24, decay: 1.1, lowpass: 320 });
    },
    ui() {
      tone({ freq: 520, type: 'sine', gain: 0.12, decay: 0.09 });
    },
    refit() {
      tone({ freq: 392, type: 'triangle', gain: 0.2, decay: 0.24 });
      tone({ freq: 587.33, type: 'triangle', gain: 0.18, decay: 0.4, delay: 0.1 });
    },
    bubble() {
      tone({ freq: 880, endFreq: 1320, type: 'sine', gain: 0.05, decay: 0.08 });
    },
  };

  return {
    unlock,
    play(name) {
      const cue = cues[name];
      if (cue) cue();
    },
    /** Called every frame with the current load, so the hum tracks the ballast pump. */
    setThruster(ballast, thrust, diving) {
      if (!ctx || !thruster) return;
      const target = muted || !diving ? 0 : 0.02 + Math.abs(ballast) * 0.05 + Math.abs(thrust) * 0.035;
      thruster.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      thruster.frequency.setTargetAtTime(42 + Math.abs(ballast) * 26 + Math.abs(thrust) * 14, ctx.currentTime, 0.2);
    },
    /** Deeper dives get a heavier drone, so the abyss is audible. */
    setDepth(depthFraction) {
      if (!ctx || !drone) return;
      drone.frequency.setTargetAtTime(61.5 - depthFraction * 22, ctx.currentTime, 0.5);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
  };
}
