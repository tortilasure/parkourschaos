export class Input {
  keys = new Set<string>();
  joyX = 0;
  joyY = 0;
  touchJump = false;
  private jumpQueued = false;
  private pushQueued = false;
  camDX = 0;
  camDY = 0;
  lastCamInput = 0;
  locked = false;
  enabled = true;
  deadzone = 0.12;
  onKey: (code: string) => void = () => {};
  onSwipe: (dir: -1 | 1) => void = () => {};
  private swipeStartX = 0;
  private swipeStartT = 0;
  private canvas: HTMLCanvasElement;
  private dragId: number | null = null;
  private dragX = 0;
  private dragY = 0;
  private mouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener("keydown", this.kd);
    window.addEventListener("keyup", this.ku);
    window.addEventListener("blur", this.blur);
    document.addEventListener("pointerlockchange", this.plc);
    canvas.addEventListener("mousedown", this.md);
    window.addEventListener("mouseup", this.mu);
    window.addEventListener("mousemove", this.mm);
    canvas.addEventListener("touchstart", this.ts, { passive: false });
    canvas.addEventListener("touchmove", this.tm, { passive: false });
    canvas.addEventListener("touchend", this.te);
    canvas.addEventListener("touchcancel", this.te);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  dispose() {
    window.removeEventListener("keydown", this.kd);
    window.removeEventListener("keyup", this.ku);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("pointerlockchange", this.plc);
    window.removeEventListener("mouseup", this.mu);
    window.removeEventListener("mousemove", this.mm);
  }

  private isTyping(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  }
  private kd = (e: KeyboardEvent) => {
    if (this.isTyping(e)) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) {
      if (e.code === "Space") this.jumpQueued = true;
      if (e.code === "KeyF") this.pushQueued = true;
      this.onKey(e.code);
    }
    this.keys.add(e.code);
  };
  private ku = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); this.joyX = this.joyY = 0; this.touchJump = false; };
  private plc = () => { this.locked = document.pointerLockElement === this.canvas; };
  private md = (e: MouseEvent) => {
    this.mouseDown = true;
    if (e.button === 0 && !this.locked && this.enabled) {
      try { const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined; if (p && typeof p.catch === "function") p.catch(() => {}); } catch { /* ignore */ }
    }
  };
  private mu = () => { this.mouseDown = false; };
  private mm = (e: MouseEvent) => {
    if (this.locked || (this.mouseDown && e.buttons === 2)) {
      this.camDX += e.movementX;
      this.camDY += e.movementY;
      this.lastCamInput = performance.now();
    }
  };
  private ts = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.dragId === null) {
        this.dragId = t.identifier; this.dragX = t.clientX; this.dragY = t.clientY;
        this.swipeStartX = t.clientX; this.swipeStartT = performance.now();
      }
    }
  };
  private tm = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.dragId) {
        this.camDX += (t.clientX - this.dragX) * 1.6;
        this.camDY += (t.clientY - this.dragY) * 1.6;
        this.dragX = t.clientX; this.dragY = t.clientY;
        this.lastCamInput = performance.now();
      }
    }
  };
  private te = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.dragId) continue;
      const dx = t.clientX - this.swipeStartX;
      const ms = performance.now() - this.swipeStartT;
      if (Math.abs(dx) > 90 && ms < 500) this.onSwipe(dx > 0 ? 1 : -1);
      this.dragId = null;
    }
  };

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  pressJump() { this.jumpQueued = true; this.touchJump = true; }
  releaseJump() { this.touchJump = false; }
  pressPush() { this.pushQueued = true; }

  private dz(v: number) {
    const d = this.deadzone;
    if (Math.abs(v) <= d) return 0;
    return Math.sign(v) * Math.min(1, (Math.abs(v) - d) / (1 - d));
  }
  get moveX() {
    let x = this.dz(this.joyX);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    return Math.max(-1, Math.min(1, x));
  }
  get moveY() {
    let y = this.dz(this.joyY);
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    return Math.max(-1, Math.min(1, y));
  }
  get jumpHeld() { return this.keys.has("Space") || this.touchJump; }
  consumeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  consumePush() { const p = this.pushQueued; this.pushQueued = false; return p; }
  consumeCam() { const r = [this.camDX, this.camDY]; this.camDX = 0; this.camDY = 0; return r; }
}
