import * as THREE from 'three';
import { Fighter } from '../entities/fighter.js';

/* ============================================================
   Live 3D operator preview for the character-select dossier.
   Renders with a dedicated small WebGLRenderer so the panel can
   sit above the menu scene without post-processing blur.
   ============================================================ */
export class OperatorPreview {
  constructor(canvas, assets){
    this.canvas = canvas;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.environment = assets.envMap;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
    this.camera.position.set(1.75, 1.36, 4.6);
    this.camera.lookAt(0, 1.0, 0);

    this.scene.add(new THREE.HemisphereLight(0xc8f3ff, 0x2c1b10, 2.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 3.4);
    key.position.set(2.6, 4.4, 3.2);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x6fe6ff, 24, 9, 2);
    rim.position.set(-2.2, 2.1, -2.0);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0xffa96e, 8, 7, 2);
    fill.position.set(-1.6, 1.1, 2.4);
    this.scene.add(fill);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.82, 64),
      new THREE.MeshBasicMaterial({ color: 0x05131c, transparent: true, opacity: 0.62, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.005;
    this.scene.add(disc);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.76, 72),
      new THREE.MeshBasicMaterial({
        color: 0x6fe6ff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.01;
    this.scene.add(this.ring);

    // suspended bubbles around the stage
    this.bubbles = [];
    const bg = new THREE.SphereGeometry(0.03, 8, 6);
    for (let i = 0; i < 18; i++){
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({
        color: 0x9feaff, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const a = Math.random() * Math.PI * 2;
      const r = 0.65 + Math.random() * 0.7;
      m.position.set(Math.cos(a) * r, 0.2 + Math.random() * 1.7, Math.sin(a) * r - 0.2);
      m.userData = { a, r, y: m.position.y, speed: 0.1 + Math.random() * 0.25, phase: Math.random() * 6.28 };
      m.scale.setScalar(0.5 + Math.random() * 1.8);
      this.scene.add(m);
      this.bubbles.push(m);
    }

    this.fighter = null;
    this.skin = null;
    this.time = 0;
    this.last = 0;
    this.raf = null;
    this.active = false;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  setSkin(kind){
    if (this.skin === kind && this.fighter) return;
    this.skin = kind;
    if (this.fighter){
      this.scene.remove(this.fighter.group);
      this.fighter.group.traverse((o) => {
        if (o.material){
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose && m.dispose();
        }
      });
      this.fighter = null;
    }
    const f = new Fighter(this.assets, { kind, team: 'blue', name: 'PREVIEW', isPlayer: true });
    f.group.position.set(0, 0, 0);
    f.group.rotation.y = -0.12;
    f.setMotion(0, 0);
    // Show the operator in a proper two-handed rifle stance instead of the
    // loose idle some imported rigs ship with.
    f.aimHold = true;
    f.cheer = false;
    f.update(0.016, 0);
    this.scene.add(f.group);
    this.fighter = f;
  }

  resize(){
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 420;
    if (w < 8 || h < 8) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(){
    if (this.active) return;
    this.active = true;
    this.resize();
    this.last = performance.now();
    const tick = (now) => {
      if (!this.active) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      if (this.fighter){
        this.fighter.update(dt, this.time);
        // 3/4 hero pose: the rifle reads in profile instead of pointing
        // straight down the lens.
        this.fighter.group.rotation.y = -0.12 + Math.sin(this.time * 0.45) * 0.12;
      }
      for (const b of this.bubbles){
        b.position.y = b.userData.y + Math.sin(this.time * b.userData.speed * 2 + b.userData.phase) * 0.12;
        b.position.x = Math.cos(b.userData.a + this.time * 0.05) * b.userData.r;
        b.position.z = Math.sin(b.userData.a + this.time * 0.05) * b.userData.r - 0.2;
      }
      if (this.ring) this.ring.material.opacity = 0.3 + Math.sin(this.time * 1.8) * 0.1;
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(){
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  dispose(){
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
