// Tiny WebAudio synth – no asset downloads, instant start.
export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  volume = 0.7;
  musicOn = true;
  private musicTimer: number | null = null;
  private step = 0;

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.12;
      this.musicGain.connect(this.master);
      this.startMusic();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusic(on: boolean) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? 0.12 : 0; }

  private tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.2, slide = 0, delay = 0, dest?: AudioNode) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.2, freq = 1200, delay = 0) {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    s.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t);
  }

  jump() { this.tone(320, 0.12, "square", 0.08, 380); }
  doubleJump() { this.tone(500, 0.12, "square", 0.08, 500); }
  land(i = 1) { this.noise(0.08, 0.1 * i, 600); }
  bounce() { this.tone(200, 0.3, "sine", 0.25, 700); this.tone(400, 0.2, "triangle", 0.08, 600, 0.03); }
  perfect() { [880, 1108, 1318].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.12, 0, i * 0.05)); }
  nearMiss() { this.tone(700, 0.18, "sawtooth", 0.05, -300); }
  coin() { this.tone(988, 0.08, "square", 0.08); this.tone(1319, 0.2, "square", 0.08, 0, 0.07); }
  push() { this.noise(0.18, 0.3, 900); this.tone(160, 0.2, "sawtooth", 0.15, -100); }
  pushed() { this.noise(0.25, 0.35, 500); this.tone(300, 0.4, "triangle", 0.15, -250); }
  death() { this.tone(500, 0.5, "sawtooth", 0.12, -440); this.noise(0.3, 0.2, 400, 0.05); }
  checkpoint() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, "triangle", 0.1, 0, i * 0.06)); }
  beep(high = false) { this.tone(high ? 880 : 440, high ? 0.4 : 0.18, "square", 0.12); }
  portal() { this.tone(300, 0.4, "sine", 0.2, 900); this.tone(600, 0.3, "sine", 0.1, 1200, 0.1); }
  hit() { this.noise(0.12, 0.35, 1500); this.tone(120, 0.15, "square", 0.15, -60); }
  emoji() { this.tone(660, 0.08, "sine", 0.12, 200); }
  click() { this.tone(900, 0.04, "square", 0.05); }
  buy() { [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.15, "square", 0.08, 0, i * 0.07)); }
  win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.22, "square", 0.1, 0, i * 0.11)); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.12, 0, i * 0.15)); }
  wallJump() { this.tone(420, 0.1, "square", 0.08, 300); this.noise(0.05, 0.1, 2000); }
  achievement() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, "triangle", 0.12, 0, i * 0.09)); }

  private startMusic() {
    if (this.musicTimer !== null || !this.ctx) return;
    const bass = [110, 110, 146.8, 130.8, 98, 98, 130.8, 123.5];
    const mel = [440, 523, 587, 659, 587, 523, 440, 392, 440, 523, 659, 784, 659, 587, 523, 587];
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.musicOn || this.ctx.state !== "running") { this.step++; return; }
      const s = this.step++;
      if (s % 2 === 0) this.tone(bass[(s >> 2) % bass.length], 0.22, "triangle", 0.5, 0, 0, this.musicGain);
      if (s % 4 === 0) this.noiseTo(0.05, 0.25);
      if (s % 4 === 2) this.noiseTo(0.03, 0.12);
      if (s % 2 === 1 && (s >> 3) % 2 === 0) this.tone(mel[(s >> 1) % mel.length], 0.15, "square", 0.18, 0, 0, this.musicGain);
    }, 150);
  }
  private noiseTo(dur: number, vol: number) {
    const c = this.ctx;
    if (!c || !this.musicGain) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource();
    s.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    s.connect(g); g.connect(this.musicGain);
    s.start();
  }
}

export const sfx = new Sfx();
