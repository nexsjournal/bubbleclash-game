/* ============================================================
   Procedural audio — wind, water gun, splashes, UI, stingers
   ============================================================ */
export class AudioEngine {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.volume = 0.65;
    this.musicVolume = 0.6;
    this.sfxVolume = 0.85;
    this.muted = false;
    this.started = false;
    this.ambient = null;
    this.music = null;
    this.matchMusic = null;
    this.musicTimer = null;
    this.menuMusic = null;
    this.menuTimer = null;
    this.musicIntensity = 0.25;
    this.battleAmbient = null;
    this.battleTimer = null;
    this.lowHealth = false;
    this.heartTimer = null;
    this.lastStep = 0;
  }

  ensure(){
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    // shared noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v){
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  toggleMute(){
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  }

  setMusicVolume(v){
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicBus) this.musicBus.gain.value = this.musicVolume;
  }

  setSfxVolume(v){
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxVolume;
  }

  noiseSource(duration = 0.2){
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    return src;
  }

  panner(pan = 0){
    if (!pan) return null;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p){ p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.sfxBus || this.master); }
    return p;
  }

  output(pan){
    const p = this.panner(pan);
    return p || this.sfxBus || this.master;
  }

  startAmbient(){
    if (!this.ctx || this.started) return;
    this.started = true;

    // wind bed
    const wind = this.noiseSource(4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    const g = this.ctx.createGain(); g.gain.value = 0.055;
    wind.connect(lp); lp.connect(g); g.connect(this.musicBus || this.master);
    wind.start();
    // slow swell
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    lfo.start();
    this.ambient = { wind, g, lfo };

    // distant tonal pad
    const padGain = this.ctx.createGain(); padGain.gain.value = 0.0;
    padGain.connect(this.musicBus || this.master);
    padGain.gain.linearRampToValueAtTime(0.026, this.ctx.currentTime + 4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 520; filter.Q.value = 0.7;
    filter.connect(padGain);
    const freqs = [55, 82.41, 110, 164.81];
    const oscs = [];
    for (const f of freqs){
      const o = this.ctx.createOscillator();
      o.type = f === 55 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const og = this.ctx.createGain(); og.gain.value = 0.34;
      o.connect(og); og.connect(filter); o.start();
      oscs.push(o);
    }
    // breathing filter LFO
    const mlfo = this.ctx.createOscillator(); mlfo.frequency.value = 0.05;
    const mlfoG = this.ctx.createGain(); mlfoG.gain.value = 180;
    mlfo.connect(mlfoG); mlfoG.connect(filter.frequency); mlfo.start();
    this.music = { padGain, oscs, filter, mlfo };
  }

  stopAmbient(){
    if (!this.ambient) return;
    try {
      this.ambient.wind.stop(); this.ambient.lfo.stop();
      if (this.music){ this.music.oscs.forEach(o => o.stop()); this.music.mlfo.stop(); }
    } catch(e){}
    this.ambient = null; this.music = null; this.started = false;
  }

  envGain(node, t0, a, d, peak = 1){
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    node.connect(g);
    return g;
  }

  shot(team = 'blue', pan = 0){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.output(pan);
    const near = team === 'blue';
    const lvl = near ? 1 : 0.72;

    // 1) supersonic crack
    const crack = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1500; hp.Q.value = 0.8;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.7;
    const cg = this.ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.linearRampToValueAtTime(0.62 * lvl, t + 0.0015);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    crack.connect(hp); hp.connect(bp); bp.connect(cg); cg.connect(out);
    crack.start(t); crack.stop(t + 0.07);

    // 2) powder body
    const body = this.noiseSource();
    const bodyLp = this.ctx.createBiquadFilter();
    bodyLp.type = 'bandpass'; bodyLp.frequency.setValueAtTime(900, t);
    bodyLp.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    bodyLp.Q.value = 0.7;
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.42 * lvl, t + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    body.connect(bodyLp); bodyLp.connect(bg); bg.connect(out);
    body.start(t); body.stop(t + 0.16);

    // 3) low pressure thump from the chest
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(near ? 118 : 96, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.34 * lvl, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.2);

    // 4) short room/desert tail
    const tail = this.noiseSource();
    const tlp = this.ctx.createBiquadFilter();
    tlp.type = 'lowpass'; tlp.frequency.value = 620; tlp.Q.value = 0.4;
    const tg = this.ctx.createGain();
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.07 * lvl, t + 0.02);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    tail.connect(tlp); tlp.connect(tg); tg.connect(out);
    tail.start(t); tail.stop(t + 0.4);

    // 5) spent brass hitting the ground
    if (near && Math.random() < 0.45){
      const bt = t + 0.09 + Math.random() * 0.06;
      const brass = this.noiseSource();
      const bhp = this.ctx.createBiquadFilter();
      bhp.type = 'highpass'; bhp.frequency.value = 5200;
      const bgn = this.ctx.createGain();
      bgn.gain.setValueAtTime(0.03, bt);
      bgn.gain.exponentialRampToValueAtTime(0.0001, bt + 0.045);
      brass.connect(bhp); bhp.connect(bgn); bgn.connect(this.sfxBus || this.master);
      brass.start(bt); brass.stop(bt + 0.05);
    }
  }

  impact(pan = 0, hard = false){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.output(pan);
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = hard ? 2600 : 1400; bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(hard ? 0.16 : 0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    src.connect(bp); bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.1);
    if (hard){
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1800, t);
      o.frequency.exponentialRampToValueAtTime(900, t + 0.06);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.035, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.09);
    }
  }

  dryFire(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    src.connect(hp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    hp.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 0.06);
  }

  pump(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++){
      const tt = t + i * 0.12;
      const src = this.noiseSource();
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 2;
      src.connect(bp);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.18, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
      bp.connect(g); g.connect(this.sfxBus);
      src.start(tt); src.stop(tt + 0.1);
    }
  }

  splash(pan = 0, big = false){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.output(pan);
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = big ? 900 : 1700;
    bp.Q.value = 0.8;
    src.connect(bp);
    const g = this.ctx.createGain();
    const vol = big ? 0.36 : 0.16;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.38 : 0.16));
    bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.4);
  }

  hit(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine'; o.frequency.setValueAtTime(1250, t); o.frequency.exponentialRampToValueAtTime(780, t + 0.06);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.09);
  }

  bubble(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.5);
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 11;
    const lg = this.ctx.createGain(); lg.gain.value = 24;
    lfo.connect(lg); lg.connect(o.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + 0.8); lfo.stop(t + 0.8);
  }

  pop(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.sfxBus || this.master;
    // burst
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.7;
    src.connect(bp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    bp.connect(g); g.connect(out); src.start(t); src.stop(t + 0.36);
    // low
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.38, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.42);
    // ping
    const p = this.ctx.createOscillator(); p.type = 'sine';
    p.frequency.setValueAtTime(1800, t + 0.02); p.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    const pg = this.ctx.createGain();
    pg.gain.setValueAtTime(0.09, t + 0.02); pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    p.connect(pg); pg.connect(out); p.start(t + 0.02); p.stop(t + 0.27);
  }

  kick(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.24);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.31);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    src.connect(lp);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.2, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    lp.connect(sg); sg.connect(this.sfxBus); src.start(t); src.stop(t + 0.13);
  }

  rescue(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      const tt = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.11, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.45);
      o.connect(g); g.connect(this.sfxBus); o.start(tt); o.stop(tt + 0.46);
    });
  }

  ui(soft = false){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(soft ? 480 : 720, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 560 : 1040, t + 0.06);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(soft ? 0.04 : 0.08, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.11);
  }

  countdown(go = false){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = go ? 880 : 440;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(go ? 0.16 : 0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (go ? 0.55 : 0.25));
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.6);
    if (go){
      const o2 = this.ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 1320;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t + 0.04);
      g2.gain.linearRampToValueAtTime(0.06, t + 0.06);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o2.connect(g2); g2.connect(this.sfxBus); o2.start(t + 0.04); o2.stop(t + 0.62);
    }
  }

  step(){
    this.footstep(0, 0.8, false);
  }

  /* ================= footsteps / gear ================= */
  footstep(pan = 0, vol = 0.7, sprint = false){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.output(pan);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(760 + Math.random() * 420, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.1);
    src.connect(lp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07 * vol * (sprint ? 1.25 : 1), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.13);
    // heel thump
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(58, t + 0.07);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.04 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.09);
  }

  reload(){
    if (!this.ctx) return;
    const seq = [[0.0, 950, 0.14], [0.16, 620, 0.17], [0.46, 1500, 0.12]];
    for (const [dt, freq, vol] of seq){
      const t = this.ctx.currentTime + dt;
      const src = this.noiseSource();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 2.6;
      src.connect(bp);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      bp.connect(g); g.connect(this.sfxBus);
      src.start(t); src.stop(t + 0.08);
    }
  }

  meleeWhoosh(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(1600, t + 0.16);
    src.connect(bp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    bp.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + 0.24);
  }

  meleeImpact(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.32);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    src.connect(lp);
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.3, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    lp.connect(sg); sg.connect(this.sfxBus); src.start(t); src.stop(t + 0.13);
  }

  headshot(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2400, t);
    o.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.17);
    const sub = this.ctx.createOscillator(); sub.type = 'triangle';
    sub.frequency.value = 660;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.06, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    sub.connect(sg); sg.connect(this.sfxBus); sub.start(t); sub.stop(t + 0.13);
  }

  killConfirm(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [[880, 0], [1320, 0.09]].forEach(([f, dt]) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.09, t + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35);
      o.connect(g); g.connect(this.sfxBus); o.start(t + dt); o.stop(t + dt + 0.36);
    });
  }

  whiz(pan = 0){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.output(pan);
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass'; hp.Q.value = 2.2;
    hp.frequency.setValueAtTime(2600, t);
    hp.frequency.exponentialRampToValueAtTime(5200, t + 0.1);
    src.connect(hp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    hp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.15);
  }

  explosion(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(92, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 1.25);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.7);
    src.connect(lp);
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.42, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    lp.connect(ng); ng.connect(this.sfxBus);
    src.start(t); src.stop(t + 0.95);
    // debris patter
    for (let i = 0; i < 5; i++){
      const tt = t + 0.15 + Math.random() * 0.5;
      const d = this.noiseSource();
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1200; bp.Q.value = 1.4;
      d.connect(bp);
      const dg = this.ctx.createGain();
      dg.gain.setValueAtTime(0.08, tt);
      dg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.12);
      bp.connect(dg); dg.connect(this.sfxBus);
      d.start(tt); d.stop(tt + 0.13);
    }
  }

  /* ================= match music ================= */
  startMatchMusic(){
    if (!this.ctx || this.matchMusic) return;
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.3, t + 2.4);
    bus.connect(this.musicBus || this.master);

    const droneBus = this.ctx.createGain(); droneBus.gain.value = 0.5;
    const droneLP = this.ctx.createBiquadFilter();
    droneLP.type = 'lowpass'; droneLP.frequency.value = 240; droneLP.Q.value = 1.1;
    droneBus.connect(droneLP); droneLP.connect(bus);
    const drones = [];
    for (const [f, type, gv] of [[73.42, 'sawtooth', 0.1], [110, 'sine', 0.14], [146.83, 'triangle', 0.07]]){
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 6;
      const g = this.ctx.createGain(); g.gain.value = gv;
      o.connect(g); g.connect(droneBus); o.start(t);
      drones.push(o);
    }
    const padGain = this.ctx.createGain(); padGain.gain.value = 0.004;
    const padLP = this.ctx.createBiquadFilter();
    padLP.type = 'lowpass'; padLP.frequency.value = 620; padLP.Q.value = 0.8;
    padLP.connect(padGain); padGain.connect(bus);
    const pads = [];
    for (const f of [220, 293.66, 349.23]){
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 10;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      o.connect(g); g.connect(padLP); o.start(t);
      pads.push(o);
    }
    const arpGain = this.ctx.createGain(); arpGain.gain.value = 0.0001; arpGain.connect(bus);
    const percGain = this.ctx.createGain(); percGain.gain.value = 0.0001; percGain.connect(bus);
    const bassGain = this.ctx.createGain(); bassGain.gain.value = 0.0001; bassGain.connect(bus);

    this.matchMusic = {
      bus, drones, pads, padGain, padLP, arpGain, percGain, bassGain,
      beat: 0, nextBeat: t + 0.45, nextArp: t + 0.2, paused: false,
    };
    this.musicIntensity = 0.25;
    this.musicTimer = setInterval(() => this.musicTick(), 90);
    if (this.music && this.music.padGain){
      this.music.padGain.gain.setTargetAtTime(0.006, t, 1.4);
    }
  }

  musicTick(){
    const m = this.matchMusic;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    const inten = this.musicIntensity;
    const look = t + 0.28;
    if (m.nextBeat < look){
      const bt = Math.max(t + 0.01, m.nextBeat);
      this.kickAt(bt, 0.07 + inten * 0.13, m.percGain);
      if (m.beat % 2 === 0) this.tickAt(bt, 0.035 + inten * 0.05, m.percGain);
      if (m.beat % 4 === 2) this.snareAt(bt, 0.04 + inten * 0.035, m.percGain);
      if (m.beat % 8 === 0) this.stabAt(bt, [207.65, 246.94, 311.13], 0.028 + inten * 0.02, m.percGain, 0.5);
      if (m.beat % 2 === 0){
        const bassNotes = [73.42, 73.42, 87.31, 98.0];
        this.bassAt(bt, bassNotes[(m.beat >> 1) % bassNotes.length], 0.075 + inten * 0.06, m.bassGain);
      }
      m.beat++;
      m.nextBeat += 0.5;
    }
    if (m.nextArp < look){
      const at = Math.max(t + 0.01, m.nextArp);
      const scale = [293.66, 349.23, 440, 523.25, 587.33];
      const f = scale[(m.beat * 2 + (m.beat % 3)) % scale.length] * (Math.random() < 0.1 ? 2 : 1);
      this.arpAt(at, f, 0.02 + inten * 0.03, m.arpGain);
      m.nextArp += 0.25;
    }
    m.bus.gain.setTargetAtTime(m.paused ? 0.07 : 0.26 + inten * 0.12, t, 0.4);
    m.padGain.gain.setTargetAtTime(0.006 + inten * 0.032, t, 0.5);
    m.arpGain.gain.setTargetAtTime(0.3 + inten * 0.7, t, 0.5);
    m.percGain.gain.setTargetAtTime(0.35 + inten * 0.75, t, 0.5);
    m.bassGain.gain.setTargetAtTime(0.45 + inten * 0.45, t, 0.5);
    m.padLP.frequency.setTargetAtTime(520 + inten * 900, t, 0.6);
  }

  bassAt(t, f, vol, out){
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(340, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.3);
    lp.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t); o.stop(t + 0.44);
  }

  kickAt(t, vol, out){
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.28);
  }

  tickAt(t, vol, out){
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3200;
    src.connect(hp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    hp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.06);
  }

  snareAt(t, vol, out){
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    src.connect(bp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    bp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.18);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(vol * 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.13);
  }

  arpAt(t, f, vol, out){
    const o = this.ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.26);
  }

  setMusicIntensity(x){
    this.musicIntensity = Math.max(0, Math.min(1, x));
  }

  setMusicPaused(on){
    if (this.matchMusic) this.matchMusic.paused = !!on;
  }

  stopMatchMusic(){
    if (this.musicTimer){ clearInterval(this.musicTimer); this.musicTimer = null; }
    const m = this.matchMusic;
    if (!m) return;
    this.matchMusic = null;
    const t = this.ctx.currentTime;
    try {
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setTargetAtTime(0.0001, t, 0.35);
      setTimeout(() => {
        try { m.drones.forEach(o => o.stop()); m.pads.forEach(o => o.stop()); } catch (e) {}
      }, 1500);
    } catch (e) {}
    if (this.music && this.music.padGain){
      this.music.padGain.gain.setTargetAtTime(0.026, t + 0.4, 1.0);
    }
  }

  /* ================= menu score ================= */
  startMenuMusic(){
    if (!this.ctx || this.menuMusic) return;
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.34, t + 2.6);
    bus.connect(this.musicBus || this.master);

    // low desert drone (D + A)
    const droneG = this.ctx.createGain(); droneG.gain.value = 0.5;
    const droneLP = this.ctx.createBiquadFilter();
    droneLP.type = 'lowpass'; droneLP.frequency.value = 210; droneLP.Q.value = 1.2;
    droneG.connect(droneLP); droneLP.connect(bus);
    const oscs = [];
    for (const [f, type, gv] of [[73.42, 'sawtooth', 0.09], [110, 'sine', 0.12], [146.83, 'triangle', 0.045]]){
      const o = this.ctx.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 7;
      const g = this.ctx.createGain(); g.gain.value = gv;
      o.connect(g); g.connect(droneG); o.start(t);
      oscs.push(o);
    }
    // D-minor pad with a slow breath
    const padG = this.ctx.createGain(); padG.gain.value = 0.0001;
    const padLP = this.ctx.createBiquadFilter();
    padLP.type = 'lowpass'; padLP.frequency.value = 520; padLP.Q.value = 0.8;
    padLP.connect(padG); padG.connect(bus);
    padG.gain.linearRampToValueAtTime(0.075, t + 3.2);
    for (const f of [146.83, 174.61, 220, 293.66]){
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 9;
      const g = this.ctx.createGain(); g.gain.value = 0.22;
      o.connect(g); g.connect(padLP); o.start(t);
      oscs.push(o);
    }
    const breathe = this.ctx.createOscillator(); breathe.frequency.value = 0.055;
    const bG = this.ctx.createGain(); bG.gain.value = 160;
    breathe.connect(bG); bG.connect(padLP.frequency); breathe.start(t);
    oscs.push(breathe);

    const percGain = this.ctx.createGain(); percGain.gain.value = 0.0001; percGain.connect(bus);
    const bassGain = this.ctx.createGain(); bassGain.gain.value = 0.0001; bassGain.connect(bus);
    const arpGain = this.ctx.createGain(); arpGain.gain.value = 0.0001; arpGain.connect(bus);

    this.menuMusic = {
      bus, oscs, padG, padLP, percGain, bassGain, arpGain,
      beat: 0,
      nextBeat: t + 1.0,
    };
    if (this.music && this.music.padGain){
      this.music.padGain.gain.setTargetAtTime(0.012, t, 1.6);
    }
    this.menuTimer = setInterval(() => this.menuTick(), 180);
  }

  menuTick(){
    const m = this.menuMusic;
    if (!m || !this.ctx) return;
    const t = this.ctx.currentTime;
    const look = t + 0.3;
    // 88 BPM dark-electronic bed: four-on-the-floor, sub ostinato, arid hats
    while (m.nextBeat < look){
      const bt = Math.max(t + 0.01, m.nextBeat);
      const b = m.beat;
      this.kickAt(bt, 0.085, m.percGain);
      if (b % 2 === 1) this.hatAt(bt, 0.05, m.percGain);
      const bassNotes = [73.42, 73.42, 87.31, 73.42, 98.0, 73.42, 87.31, 65.41];
      this.bassAt(bt, bassNotes[b % 8], 0.058, m.bassGain);
      const scale = [293.66, 349.23, 392, 440, 523.25, 587.33];
      this.arpAt(bt, scale[(b * 2) % scale.length], 0.018, m.arpGain);
      this.arpAt(bt + 0.341, scale[(b * 2 + 3) % scale.length], 0.012, m.arpGain);
      if (b % 8 === 0) this.stabAt(bt, [146.83, 174.61, 220], 0.05, m.percGain, 0.9);
      m.beat++;
      m.nextBeat += 0.682;
    }
    m.percGain.gain.setTargetAtTime(0.62, t, 0.6);
    m.bassGain.gain.setTargetAtTime(0.55, t, 0.6);
    m.arpGain.gain.setTargetAtTime(0.6, t, 0.6);
    m.padLP.frequency.setTargetAtTime(500 + Math.sin(t * 0.16) * 130, t, 0.9);
  }

  hatAt(t, vol, out){
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7600; hp.Q.value = 0.6;
    src.connect(hp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    hp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.04);
  }

  stabAt(t, freqs, vol, out, dur = 0.6){
    if (!this.ctx) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + 0.18);
    lp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(out);
    for (const f of freqs){
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  stopMenuMusic(){
    if (this.menuTimer){ clearInterval(this.menuTimer); this.menuTimer = null; }
    const m = this.menuMusic;
    if (!m || !this.ctx) { this.menuMusic = null; return; }
    this.menuMusic = null;
    const t = this.ctx.currentTime;
    try {
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setTargetAtTime(0.0001, t, 0.4);
      setTimeout(() => { try { m.oscs.forEach(o => o.stop()); } catch (e) {} }, 1700);
    } catch (e) {}
    if (this.music && this.music.padGain){
      this.music.padGain.gain.setTargetAtTime(0.026, t + 0.5, 1.2);
    }
  }

  /* ================= battle ambience ================= */
  startBattleAmbient(){
    if (!this.ctx || this.battleAmbient) return;
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.9, t + 2.2);
    bus.connect(this.musicBus || this.master);

    const rum = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.7;
    const rg = this.ctx.createGain(); rg.gain.value = 0.05;
    rum.connect(lp); lp.connect(rg); rg.connect(bus); rum.start(t);

    const humG = this.ctx.createGain(); humG.gain.value = 0.02; humG.connect(bus);
    const hum = [];
    for (const f of [48, 72.5]){
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain(); g.gain.value = 0.5;
      o.connect(g); g.connect(humG); o.start(t); hum.push(o);
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = this.ctx.createGain(); lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(humG.gain); lfo.start(t);

    this.battleAmbient = { bus, rum, hum, lfo, nextShot: t + 4, nextBird: t + 7 };
    this.battleTimer = setInterval(() => this.battleTick(), 500);
  }

  battleTick(){
    const b = this.battleAmbient;
    if (!b || !this.ctx) return;
    const t = this.ctx.currentTime;
    if (t >= b.nextShot){
      b.nextShot = t + 4 + Math.random() * 8;
      this.distantShot();
    }
    if (t >= b.nextBird){
      b.nextBird = t + 9 + Math.random() * 11;
      this.bird();
    }
  }

  distantShot(){
    const t = this.ctx.currentTime;
    const out = this.output((Math.random() * 2 - 1) * 0.8);
    const src = this.noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
    src.connect(lp);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    lp.connect(g); g.connect(out);
    src.start(t); src.stop(t + 0.58);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.05, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.52);
  }

  bird(){
    const t = this.ctx.currentTime;
    const pan = (Math.random() * 2 - 1) * 0.6;
    for (let i = 0; i < 3; i++){
      const tt = t + i * 0.11;
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1800 + Math.random() * 500, tt);
      o.frequency.exponentialRampToValueAtTime(2500 + Math.random() * 500, tt + 0.07);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.016, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.09);
      o.connect(g); g.connect(this.output(pan));
      o.start(tt); o.stop(tt + 0.1);
    }
  }

  stopBattleAmbient(){
    if (this.battleTimer){ clearInterval(this.battleTimer); this.battleTimer = null; }
    const b = this.battleAmbient;
    if (!b) return;
    this.battleAmbient = null;
    try {
      const t = this.ctx.currentTime;
      b.bus.gain.setTargetAtTime(0.0001, t, 0.4);
      setTimeout(() => {
        try { b.rum.stop(); b.hum.forEach(o => o.stop()); b.lfo.stop(); } catch (e) {}
      }, 1400);
    } catch (e) {}
  }

  setLowHealth(on){
    if (on === this.lowHealth) return;
    this.lowHealth = !!on;
    if (this.heartTimer){ clearInterval(this.heartTimer); this.heartTimer = null; }
    if (!on || !this.ctx) return;
    const beat = () => {
      if (!this.ctx || !this.lowHealth) return;
      const t = this.ctx.currentTime;
      for (const [dt, v] of [[0, 0.2], [0.27, 0.13]]){
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(64, t + dt);
        o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.16);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.linearRampToValueAtTime(v, t + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
        o.connect(g); g.connect(this.sfxBus);
        o.start(t + dt); o.stop(t + dt + 0.24);
      }
    };
    beat();
    this.heartTimer = setInterval(beat, 1050);
  }

  sting(victory = true){
    if (!this.ctx) return;
    if (victory) this.victoryTheme();
    else this.defeatTheme();
  }

  /* ---------------- victory fanfare ---------------- */
  victoryTheme(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const out = this.sfxBus || this.master;

    // opening low boom
    const boom = this.ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(90, t);
    boom.frequency.exponentialRampToValueAtTime(38, t + 0.8);
    const bg = this.ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.linearRampToValueAtTime(0.36, t + 0.03);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    boom.connect(bg); bg.connect(out); boom.start(t); boom.stop(t + 1.15);

    // triumphant D major stack, brass-like saws with an opening filter
    const chord = [146.83, 185.0, 220.0, 293.66, 369.99];
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(480, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + 1.6);
    lp.Q.value = 0.8;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.linearRampToValueAtTime(0.16, t + 0.35);
    bus.gain.setValueAtTime(0.16, t + 2.4);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    lp.connect(bus); bus.connect(out);
    chord.forEach((f, i) => {
      for (const det of [-7, 7]){
        const o = this.ctx.createOscillator();
        o.type = i < 2 ? 'sawtooth' : 'triangle';
        o.frequency.value = f; o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.07);
        g.gain.linearRampToValueAtTime(0.5, t + i * 0.07 + 0.12);
        o.connect(g); g.connect(lp);
        o.start(t + i * 0.07); o.stop(t + 4.3);
      }
    });

    // snare roll build
    for (let i = 0; i < 16; i++){
      const at = t + i * 0.055;
      const src = this.noiseSource();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.02 + i * 0.003, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      src.connect(hp); hp.connect(g); g.connect(out);
      src.start(at); src.stop(at + 0.07);
    }

    // bright victory shimmer
    [587.33, 739.99, 880, 1174.66].forEach((f, i) => {
      const at = t + 0.9 + i * 0.12;
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.05, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.72);
    });
  }

  /* ---------------- defeat / mission failed ---------------- */
  defeatTheme(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const out = this.sfxBus || this.master;

    // sub drone swell
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.setValueAtTime(73.42, t);
    drone.frequency.linearRampToValueAtTime(55, t + 3.6);
    const dlp = this.ctx.createBiquadFilter();
    dlp.type = 'lowpass'; dlp.frequency.value = 260; dlp.Q.value = 1.4;
    const dg = this.ctx.createGain();
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.linearRampToValueAtTime(0.22, t + 1.2);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
    drone.connect(dlp); dlp.connect(dg); dg.connect(out);
    drone.start(t); drone.stop(t + 4.5);

    // descending minor line, each note sags a little
    const notes = [220.0, 196.0, 174.61, 146.83];
    notes.forEach((f, i) => {
      const at = t + i * 0.62;
      const o = this.ctx.createOscillator();
      o.type = 'triangle'; o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 0.985, at + 0.9);
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine'; o2.frequency.value = f * 0.5;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.13, at + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.25);
      o.connect(g); o2.connect(g); g.connect(out);
      o.start(at); o.stop(at + 1.3); o2.start(at); o2.stop(at + 1.3);
    });

    // dissonant minor second stab for a gut-punch
    const at = t + 1.55;
    for (const f of [146.83, 155.56]){
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.07, at + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 2.5);
    }

    // distant toll
    [at + 1.9, at + 2.6].forEach((tt, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = i ? 164.81 : 110;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.09, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.2);
      o.connect(g); g.connect(out); o.start(tt); o.stop(tt + 2.3);
    });
  }

  alarm(){
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(420, t + 0.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.42);
  }
}
