/* ============================================================
   Input — keyboard / mouse / pointer lock
   ============================================================ */
export class Input {
  constructor(domElement){
    this.dom = domElement;
    this.keys = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.lmb = false;
    this.rmb = false;
    this.lmbPressed = false;
    this.lmbReleased = false;
    this.rmbPressed = false;
    this.locked = false;
    this.enabled = true;
    this.onPause = null;
    this.onLockChange = null;
    this._bind();
  }

  _bind(){
    window.addEventListener('keydown', (e) => {
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Escape' && this.onPause) this.onPause();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.justReleased.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = this.rmb = false;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0){ this.lmb = true; this.lmbPressed = true; }
      if (e.button === 2){ this.rmb = true; this.rmbPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0){ if (this.lmb) this.lmbReleased = true; this.lmb = false; }
      if (e.button === 2) this.rmb = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock(){
    if (this.locked) return;
    const p = this.dom.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  releaseLock(){
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code){ return this.keys.has(code); }
  pressed(code){ return this.justPressed.has(code); }

  consumeMouse(){
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame(){
    this.justPressed.clear();
    this.justReleased.clear();
    this.lmbPressed = false;
    this.lmbReleased = false;
    this.rmbPressed = false;
  }
}
