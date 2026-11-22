// Procedural sound: every effect is synthesised with WebAudio, no audio
// files. Engine hum, siren, gunshot, pickup blips and a lazy island bass
// line that plays under the game.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.3, lowpass = 1200, delay = 0) {
    const c = ensure();
    if (!c || muted) return;
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t0);
  }

  const bassLine = [55, 0, 55, 65.4, 0, 55, 49, 0, 55, 0, 82.4, 73.4, 0, 65.4, 0, 49];
  const hatSteps = [0, 0, 1, 0, 0, 1, 0, 1];

  function startMusic() {
    const c = ensure();
    if (!c || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const note = bassLine[musicStep % bassLine.length];
      if (note) tone(note, 0.34, 'triangle', 0.10);
      if (hatSteps[musicStep % hatSteps.length]) noise(0.03, 0.05, 6000);
      if (musicStep % 16 === 0) tone(220, 0.5, 'sine', 0.05, 330);
      musicStep++;
    }, 210);
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  function startEngine() {
    const c = ensure();
    if (!c || engineOsc) return;
    engineOsc = c.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = c.createGain();
    engineGain.gain.value = 0;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    engineOsc.connect(f).connect(engineGain).connect(c.destination);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!engineOsc || !engineGain || !ctx) return;
    const target = muted || !on ? 0 : 0.035 + speed01 * 0.05;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.1);
  }

  function startSiren() {
    const c = ensure();
    if (!c || sirenOsc) return;
    sirenOsc = c.createOscillator();
    sirenOsc.type = 'sine';
    sirenOsc.frequency.value = 700;
    sirenGain = c.createGain();
    sirenGain.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain).connect(c.destination);
    sirenOsc.start();
    lfo.start();
    sirenOsc._lfo = lfo;
  }

  function setSiren(on) {
    if (!sirenGain || !ctx) return;
    sirenGain.gain.setTargetAtTime(muted || !on ? 0 : 0.028, ctx.currentTime, 0.2);
  }

  return {
    unlock() { ensure(); startMusic(); startEngine(); startSiren(); },
    toggleMute() {
      muted = !muted;
      if (ctx) { setEngine(0, false); setSiren(false); }
      return muted;
    },
    isMuted() { return muted; },
    setEngine,
    setSiren,
    startMusic,
    stopMusic,
    shot() { noise(0.12, 0.5, 2600); tone(160, 0.09, 'square', 0.16, 60); },
    punch() { noise(0.08, 0.35, 900); },
    pickup() { tone(660, 0.1, 'sine', 0.2); tone(990, 0.14, 'sine', 0.2, null, 0.08); },
    coin() { tone(880, 0.08, 'square', 0.12); tone(1320, 0.16, 'square', 0.12, null, 0.07); },
    crash() { noise(0.25, 0.5, 500); tone(70, 0.2, 'sine', 0.3, 35); },
    sirenBlip() { tone(950, 0.12, 'sine', 0.14, 700); tone(700, 0.12, 'sine', 0.14, 950, 0.12); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, null, i * 0.11)); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, null, i * 0.16)); },
    busted() { tone(440, 0.5, 'sawtooth', 0.16, 220); tone(220, 0.6, 'sawtooth', 0.16, 110, 0.4); },
    phone() { tone(1180, 0.12, 'sine', 0.14); tone(1180, 0.12, 'sine', 0.14, null, 0.2); },
  };
}
