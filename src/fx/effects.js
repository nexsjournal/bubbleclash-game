import * as THREE from 'three';

/* ============================================================
   FX — water spray, splashes, bubble pops, decals
   ============================================================ */
const PARTICLE_VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uPerspective;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPerspective / max(0.5, -mv.z);
    vAlpha = aAlpha;
    vColor = aColor;
  }
`;
const PARTICLE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vAlpha;
  varying vec3 vColor;
  void main(){
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(vColor, tex.a * vAlpha);
    if (gl_FragColor.a < 0.003) discard;
  }
`;

class ParticlePool {
  constructor(scene, count, texture, blending){
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uPerspective: { value: 900 },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.data = new Array(count).fill(null).map(() => ({ life: 0, max: 1, vel: new THREE.Vector3(), gravity: 0, drag: 0, sizeStart: 0, sizeEnd: 0, alphaStart: 1, fadeIn: 0 }));
    this.cursor = 0;
    this.active = 0;
  }

  spawn(pos, vel, color, size, life, opts = {}){
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const d = this.data[i];
    d.life = 0;
    d.max = life;
    d.vel.copy(vel);
    d.gravity = opts.gravity ?? -9;
    d.drag = opts.drag ?? 0.6;
    d.sizeStart = size;
    d.sizeEnd = opts.sizeEnd ?? size * 0.15;
    d.alphaStart = opts.alpha ?? 1;
    d.fadeIn = opts.fadeIn ?? 0.04;
    this.positions[i * 3] = pos.x;
    this.positions[i * 3 + 1] = pos.y;
    this.positions[i * 3 + 2] = pos.z;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
    this.alphas[i] = 0;
    d.index = i;
  }

  update(dt){
    let active = 0;
    for (let i = 0; i < this.count; i++){
      const d = this.data[i];
      if (d.life >= d.max) { if (this.alphas[i] !== 0) this.alphas[i] = 0; continue; }
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1){ this.alphas[i] = 0; continue; }
      active++;
      const dragF = Math.max(0, 1 - d.drag * dt);
      d.vel.multiplyScalar(dragF);
      d.vel.y += d.gravity * dt;
      this.positions[i * 3] += d.vel.x * dt;
      this.positions[i * 3 + 1] += d.vel.y * dt;
      this.positions[i * 3 + 2] += d.vel.z * dt;
      this.sizes[i] = THREE.MathUtils.lerp(d.sizeStart, d.sizeEnd, t);
      const fadeIn = d.fadeIn > 0 ? Math.min(1, d.life / d.fadeIn) : 1;
      this.alphas[i] = d.alphaStart * fadeIn * (1 - t * t);
    }
    this.active = active;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, assets, map){
    this.scene = scene;
    this.assets = assets;
    this.map = map;
    this.time = 0;

    this.water = new ParticlePool(scene, 1100, assets.sprites.water, THREE.AdditiveBlending);
    this.spark = new ParticlePool(scene, 400, assets.sprites.glow, THREE.AdditiveBlending);
    this.smoke = new ParticlePool(scene, 260, assets.sprites.smoke, THREE.NormalBlending);
    this.smoke.points.renderOrder = 7;

    this.colBlue = new THREE.Color(0x8fefff);
    this.colBlueHot = new THREE.Color(0xd9ffff);
    this.colRed = new THREE.Color(0xffb08a);
    this.colFoam = new THREE.Color(0xe8ffff);
    this.colDust = new THREE.Color(0xd8bd93);
    this.colMuzzle = new THREE.Color(0xffe2a6);
    this.colMuzzleRed = new THREE.Color(0xffc488);
    this.colSparkHot = new THREE.Color(0xfff3d0);
    this.colGunSmoke = new THREE.Color(0x9a9384);
    this.colBlood = new THREE.Color(0x6e211a);

    this.buildRings();
    this.buildDecals();
    this.buildBubblePops();
    this.buildBubbleShards();
    this.buildJets();
  }

  buildJets(){
    this.jets = [];
    this.jetCursor = 0;
    const geo = new THREE.CylinderGeometry(0.018, 0.052, 1, 7, 1, true);
    geo.translate(0, 0.5, 0);
    this.jetGeo = geo;
    for (let i = 0; i < 12; i++){
      const mat = new THREE.MeshBasicMaterial({
        color: 0xbfefff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.jets.push({ mesh, life: 0, max: 0.055, len: 0.62 });
    }
  }

  jet(pos, dir, color){
    const j = this.jets[this.jetCursor];
    this.jetCursor = (this.jetCursor + 1) % this.jets.length;
    j.life = 0;
    j.mesh.visible = true;
    j.mesh.position.copy(pos);
    j.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    j.mesh.scale.set(1, j.len, 1);
    j.mesh.material.color.copy(color);
    j.mesh.material.opacity = 0.7;
  }

  buildRings(){
    this.rings = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 18; i++){
      const mat = new THREE.MeshBasicMaterial({
        map: this.assets.sprites.splashRing, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        color: 0xbfefff,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 6;
      this.scene.add(m);
      this.rings.push({ mesh: m, life: 0, max: 1, grow: 2, base: 1, horizontal: true });
    }
    this.ringCursor = 0;
  }

  buildDecals(){
    this.decals = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 44; i++){
      const mat = new THREE.MeshBasicMaterial({
        map: this.assets.decals.splash, transparent: true, opacity: 0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        color: 0xd8f8ff,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 3;
      this.scene.add(m);
      this.decals.push({ mesh: m, life: 0, max: 1, fadeStart: 8 });
    }
    this.decalCursor = 0;
  }

  buildBubblePops(){
    this.pops = [];
    for (let i = 0; i < 8; i++){
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa8f4ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, wireframe: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), mat);
      m.visible = false;
      m.renderOrder = 7;
      this.scene.add(m);
      this.pops.push({ mesh: m, life: 0, max: 0.6, base: 1 });
    }
    this.popCursor = 0;
  }

  buildBubbleShards(){
    this.shards = [];
    const geo = new THREE.PlaneGeometry(0.42, 0.3);
    for (let i = 0; i < 30; i++){
      const mat = new THREE.MeshBasicMaterial({
        color: 0xd4f8ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 8;
      this.scene.add(m);
      this.shards.push({ mesh: m, life: 0, max: 0.5, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.shardCursor = 0;
  }

  setPerspective(perspective){
    this.water.mat.uniforms.uPerspective.value = perspective;
    this.spark.mat.uniforms.uPerspective.value = perspective;
    this.smoke.mat.uniforms.uPerspective.value = perspective;
  }

  /* ---------------- emitters ---------------- */
  muzzle(pos, dir, color){
    const hot = color === 'red' ? this.colMuzzleRed : this.colMuzzle;
    this.jet(pos, dir, hot);
    // burning powder sparks
    for (let i = 0; i < 14; i++){
      const v = dir.clone().multiplyScalar(4 + Math.random() * 9);
      v.x += (Math.random() - 0.5) * 2.2;
      v.y += (Math.random() - 0.5) * 2.2;
      v.z += (Math.random() - 0.5) * 2.2;
      this.spark.spawn(pos, v, i % 3 ? this.colSparkHot : hot, 0.11 + Math.random() * 0.09, 0.1 + Math.random() * 0.14,
        { gravity: -3, drag: 3.6, sizeEnd: 0.012, alpha: 0.85 });
    }
    // gunsmoke curling off the muzzle
    for (let i = 0; i < 4; i++){
      const v = dir.clone().multiplyScalar(1.1 + Math.random() * 1.6);
      v.x += (Math.random() - 0.5) * 0.5;
      v.y += (Math.random() - 0.5) * 0.4 + 0.15;
      v.z += (Math.random() - 0.5) * 0.5;
      this.smoke.spawn(pos.clone().addScaledVector(dir, 0.05 + Math.random() * 0.12), v,
        this.colGunSmoke, 0.09 + Math.random() * 0.07, 0.45 + Math.random() * 0.35,
        { gravity: 0.25, drag: 2.2, sizeEnd: 0.42, alpha: 0.2, fadeIn: 0.03 });
    }
  }

  /** bullet striking concrete / wood / metal */
  impact(pos, normal){
    const n = normal || new THREE.Vector3(0, 1, 0);
    const up = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const t1 = new THREE.Vector3().crossVectors(n, up).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
    for (let i = 0; i < 16; i++){
      const a = Math.random() * Math.PI * 2;
      const spread = 0.55 + Math.random() * 0.9;
      const v = n.clone().multiplyScalar(1.4 + Math.random() * 2.6)
        .addScaledVector(t1, Math.cos(a) * spread * 3)
        .addScaledVector(t2, Math.sin(a) * spread * 3);
      this.spark.spawn(pos, v, Math.random() > 0.4 ? this.colSparkHot : this.colMuzzle,
        0.08 + Math.random() * 0.07, 0.12 + Math.random() * 0.16,
        { gravity: -8, drag: 1.4, sizeEnd: 0.01, alpha: 0.9 });
    }
    for (let i = 0; i < 5; i++){
      const v = n.clone().multiplyScalar(0.6 + Math.random() * 1.2);
      v.x += (Math.random() - 0.5) * 1.2;
      v.y += (Math.random() - 0.5) * 1.2;
      v.z += (Math.random() - 0.5) * 1.2;
      this.smoke.spawn(pos, v, this.colDust, 0.12 + Math.random() * 0.1, 0.35 + Math.random() * 0.3,
        { gravity: 0.1, drag: 2.4, sizeEnd: 0.5, alpha: 0.26, fadeIn: 0.04 });
    }
  }

  /** small dark spray when a round connects with a body */
  fleshHit(pos, dir = null){
    const base = dir ? dir.clone().setY(0).normalize() : new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < 18; i++){
      const v = base.clone().multiplyScalar(0.8 + Math.random() * 3.2);
      v.x += (Math.random() - 0.5) * 1.8;
      v.y += 0.3 + Math.random() * 1.3;
      v.z += (Math.random() - 0.5) * 1.8;
      this.smoke.spawn(pos, v, this.colBlood, 0.06 + Math.random() * 0.08, 0.3 + Math.random() * 0.35,
        { gravity: -5, drag: 1.5, sizeEnd: 0.18, alpha: 0.6, fadeIn: 0.01 });
    }
    // fine mist hanging at the impact point
    for (let i = 0; i < 6; i++){
      this.smoke.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5),
        this.colBlood, 0.1 + Math.random() * 0.08, 0.45 + Math.random() * 0.3,
        { gravity: -0.4, drag: 2.4, sizeEnd: 0.3, alpha: 0.3, fadeIn: 0.03 });
    }
  }

  splash(pos, normal, color = 'blue', big = false){
    const c = color === 'red' ? this.colRed : this.colBlue;
    const count = big ? 40 : 18;
    for (let i = 0; i < count; i++){
      const v = new THREE.Vector3(
        (Math.random() - 0.5) * (big ? 7 : 4),
        Math.random() * (big ? 5.5 : 3.2) + 1.2,
        (Math.random() - 0.5) * (big ? 7 : 4)
      );
      if (normal) v.addScaledVector(normal, 2 + Math.random() * 3);
      this.water.spawn(pos, v, Math.random() > 0.3 ? c : this.colFoam, 0.07 + Math.random() * 0.16, 0.32 + Math.random() * 0.42,
        { gravity: -11, drag: 0.7, sizeEnd: 0.018, alpha: 1 });
    }
    // crown of upward droplets
    for (let i = 0; i < (big ? 14 : 6); i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random() * 1.6), 3.2 + Math.random() * 2.4, Math.sin(a) * (0.6 + Math.random() * 1.6));
      this.water.spawn(pos, v, this.colBlueHot, 0.05 + Math.random() * 0.06, 0.4 + Math.random() * 0.3,
        { gravity: -13, drag: 0.2, sizeEnd: 0.012, alpha: 1 });
    }
    for (let i = 0; i < (big ? 12 : 5); i++){
      this.spark.spawn(pos, new THREE.Vector3((Math.random() - .5) * 2.4, Math.random() * 2.2, (Math.random() - .5) * 2.4), this.colFoam, 0.13, 0.4,
        { gravity: -4, drag: 1.5, alpha: 0.7 });
    }
    if (big && normal){
      this.ringAt(pos.clone().addScaledVector(normal, 0.03), 1.6, 'surface', 2.6, 0.5, c, normal);
    } else if (big){
      this.ringAt(pos, 1.3, 'billboard', 2.4, 0.38, c);
    } else {
      this.ringAt(pos, 0.55, 'billboard', 1.2, 0.24, c);
    }
  }

  bubbleForm(pos, color = 'blue'){
    const c = color === 'red' ? this.colRed : this.colBlue;
    for (let i = 0; i < 30; i++){
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 1.2;
      const p = new THREE.Vector3(
        pos.x + Math.sin(b) * Math.cos(a) * r * 0.3,
        pos.y + Math.cos(b) * r * 0.3,
        pos.z + Math.sin(b) * Math.sin(a) * r * 0.3
      );
      const v = p.clone().sub(pos).normalize().multiplyScalar(1.5 + Math.random() * 3);
      v.y += 1.2;
      this.spark.spawn(p, v, this.colFoam, 0.11, 0.6, { gravity: -1, drag: 1.4, alpha: 0.85 });
    }
    this.ringAt(pos, 1.8, 'billboard', 3.4, 0.55, c);
  }

  bubblePop(pos, color = 'blue'){
    const c = color === 'red' ? this.colRed : this.colBlueHot;
    const p = this.pops[this.popCursor];
    this.popCursor = (this.popCursor + 1) % this.pops.length;
    p.mesh.position.copy(pos);
    p.mesh.visible = true;
    p.life = 0;
    p.max = 0.4;
    p.mesh.material.color.copy(c);
    p.mesh.material.opacity = 0.34;
    p.mesh.scale.setScalar(0.42);

    // layered shock rings
    this.ringAt(pos, 1.1, 'billboard', 8.0, 0.3, this.colFoam);
    this.ringAt(pos, 2.1, 'billboard', 4.6, 0.48, c);
    this.ringAt(pos, 3.1, 'billboard', 2.2, 0.68, c);

    // soap-film shards spinning outwards
    for (let i = 0; i < 14; i++){
      const s = this.shards[this.shardCursor];
      this.shardCursor = (this.shardCursor + 1) % this.shards.length;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b) * 0.75 + 0.35, Math.sin(b) * Math.sin(a));
      s.mesh.visible = true;
      s.mesh.position.copy(pos).addScaledVector(dir, 0.55);
      s.mesh.scale.setScalar(0.6 + Math.random() * 0.9);
      s.mesh.material.opacity = 0.75;
      s.mesh.material.color.copy(Math.random() > 0.5 ? this.colFoam : c);
      s.life = 0;
      s.max = 0.42 + Math.random() * 0.3;
      s.vel.copy(dir).multiplyScalar(2.6 + Math.random() * 5.5);
      s.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }

    // large + medium droplets
    for (let i = 0; i < 64; i++){
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const dir = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a));
      const big = Math.random() > 0.7;
      const v = dir.clone().multiplyScalar((big ? 2.0 : 3.5) + Math.random() * (big ? 3.6 : 7));
      v.y += 1.5 + Math.random() * 2.2;
      this.water.spawn(pos, v, Math.random() > 0.42 ? c : this.colFoam,
        (big ? 0.085 : 0.045) + Math.random() * (big ? 0.06 : 0.05),
        0.5 + Math.random() * 0.5,
        { gravity: -8.5, drag: 0.45, sizeEnd: 0.015, alpha: 0.85 });
    }
    for (let i = 0; i < 22; i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 5.5), Math.random() * 3.0, Math.sin(a) * (2 + Math.random() * 5.5));
      this.spark.spawn(pos, v, this.colFoam, 0.1 + Math.random() * 0.09, 0.45 + Math.random() * 0.25,
        { gravity: -2, drag: 1.2, alpha: 0.75 });
    }
    // splash crown where the burst meets the ground
    const groundY = this.map && this.map.getSupportHeight ? this.map.getSupportHeight(pos.x, pos.z, pos.y + 0.2, 0.3, 0.6) : 0;
    if (pos.y - groundY < 2.4){
      this.ringAt(new THREE.Vector3(pos.x, groundY + 0.03, pos.z), 1.8, 'surface', 4.6, 0.65, c);
      for (let i = 0; i < 12; i++){
        const a = Math.random() * Math.PI * 2;
        const r = 0.4 + Math.random() * 1.1;
        const v = new THREE.Vector3(Math.cos(a) * (1.4 + Math.random() * 2.2), 2.4 + Math.random() * 2.0, Math.sin(a) * (1.4 + Math.random() * 2.2));
        this.water.spawn(new THREE.Vector3(pos.x + Math.cos(a) * r, groundY + 0.06, pos.z + Math.sin(a) * r), v,
          this.colBlueHot, 0.05 + Math.random() * 0.06, 0.4 + Math.random() * 0.3,
          { gravity: -12, drag: 0.2, sizeEnd: 0.01, alpha: 0.85 });
      }
    }
  }

  rescue(pos, color = 'green'){
    const c = new THREE.Color(0x9cffd2);
    for (let i = 0; i < 40; i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 2 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2));
      this.spark.spawn(pos, v, c, 0.12, 0.7, { gravity: -2.5, drag: 0.8, alpha: 0.9 });
    }
    this.ringAt(pos, 1.6, 'billboard', 3.6, 0.55, c);
  }

  /* water-tower depot detonation */
  explosion(pos, color = 'blue'){
    const c = color === 'red' ? this.colRed : this.colBlueHot;
    const foam = this.colFoam;
    // shock rings
    this.ringAt(pos.clone().setY(0.05), 4.2, 'surface', 11, 0.95, c);
    this.ringAt(pos.clone().setY(0.9), 2.4, 'billboard', 9, 0.75, foam);
    this.ringAt(pos.clone().setY(2.2), 1.6, 'billboard', 6.5, 0.6, c);
    // vertical water column + radial spray
    for (let i = 0; i < 130; i++){
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      const v = new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 6.5), 4 + Math.random() * 9, Math.sin(a) * (1.5 + Math.random() * 6.5));
      this.water.spawn(
        new THREE.Vector3(pos.x + Math.cos(a) * r, pos.y + 0.3 + Math.random() * 2.4, pos.z + Math.sin(a) * r),
        v, Math.random() > 0.35 ? c : foam,
        0.12 + Math.random() * 0.22, 0.9 + Math.random() * 1.1,
        { gravity: -10, drag: 0.25, sizeEnd: 0.03, alpha: 0.9 }
      );
    }
    // foam / steam puffs
    for (let i = 0; i < 60; i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 5), 2.5 + Math.random() * 6, Math.sin(a) * (2 + Math.random() * 5));
      this.spark.spawn(pos.clone().add(new THREE.Vector3(0, 1.4, 0)), v, foam,
        0.2 + Math.random() * 0.25, 0.9 + Math.random() * 0.8, { gravity: -1.5, drag: 1.1, alpha: 0.8 });
    }
    // structural debris
    for (let i = 0; i < 36; i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (3 + Math.random() * 7), 4 + Math.random() * 7, Math.sin(a) * (3 + Math.random() * 7));
      this.spark.spawn(pos.clone().add(new THREE.Vector3(0, 2.2, 0)), v, 0xc9a06a,
        0.14 + Math.random() * 0.16, 1.2 + Math.random() * 1.0, { gravity: -13, drag: 0.3, alpha: 0.95 });
    }
    // white flash shells
    for (let i = 0; i < 3; i++){
      this.bubblePop(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.2 + i * 1.1, (Math.random() - 0.5) * 1.6)), color);
    }
  }

  drip(pos){
    this.water.spawn(pos, new THREE.Vector3((Math.random() - .5) * 0.4, -1.5, (Math.random() - .5) * 0.4),
      this.colBlue, 0.055, 0.6, { gravity: -9, drag: 0.1, sizeEnd: 0.03, alpha: 0.55 });
  }

  dust(pos, amount = 8){
    for (let i = 0; i < amount; i++){
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (0.6 + Math.random() * 1.6), 0.4 + Math.random() * 0.8, Math.sin(a) * (0.6 + Math.random() * 1.6));
      this.smoke.spawn(pos, v, this.colDust, 0.5 + Math.random() * 0.8, 0.7 + Math.random() * 0.5,
        { gravity: 0.15, drag: 1.6, sizeEnd: 1.6, alpha: 0.22, fadeIn: 0.12 });
    }
  }

  tracer(pos, color = 'blue'){
    const c = color === 'red' ? this.colMuzzleRed : this.colMuzzle;
    this.spark.spawn(pos, new THREE.Vector3((Math.random() - .5) * 0.2, (Math.random() - .5) * 0.2, (Math.random() - .5) * 0.2),
      c, 0.055 + Math.random() * 0.03, 0.1, { gravity: 0, drag: 0.4, sizeEnd: 0.012, alpha: 0.34 });
  }

  trail(pos, color = 'blue'){
    // faint heat haze / cordite wisp behind the round, never a water droplet
    this.smoke.spawn(pos, new THREE.Vector3((Math.random() - .5) * 0.15, (Math.random() - .5) * 0.15, (Math.random() - .5) * 0.15),
      this.colGunSmoke, 0.035, 0.16, { gravity: 0.1, drag: 3, sizeEnd: 0.07, alpha: 0.09, fadeIn: 0.01 });
  }

  ringAt(pos, scale, kind, grow, life, color, normal){
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    r.life = 0;
    r.max = life;
    r.base = scale;
    r.grow = grow;
    r.mesh.visible = true;
    r.mesh.position.copy(pos);
    r.mesh.material.color.copy(color);
    r.mesh.material.opacity = 0.85;
    if (kind === 'surface' && normal){
      r.mesh.lookAt(pos.clone().add(normal));
      r.horizontal = false;
    } else if (kind === 'billboard'){
      r.mesh.lookAt(pos.clone().add(this.cameraDir || new THREE.Vector3(0, 0, 1)));
      r.horizontal = false;
    } else {
      r.mesh.rotation.set(-Math.PI / 2, 0, 0);
      r.horizontal = true;
    }
  }

  spawnDecal(pos, normal, scale = 1.2, color = 0xd8f8ff){
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.life = 0;
    d.max = 14;
    d.mesh.visible = true;
    d.mesh.position.copy(pos).addScaledVector(normal, 0.012);
    d.mesh.lookAt(pos.clone().add(normal));
    d.mesh.rotateZ(Math.random() * Math.PI * 2);
    d.mesh.scale.setScalar(scale * (0.7 + Math.random() * 0.7));
    d.mesh.material.opacity = 0.72;
    d.mesh.material.color.setHex(color);
  }

  update(dt, camera){
    this.time += dt;
    this.cameraDir = camera ? camera.getWorldDirection(new THREE.Vector3()) : new THREE.Vector3(0, 0, 1);
    this.water.update(dt);
    this.spark.update(dt);
    this.smoke.update(dt);

    for (const r of this.rings){
      if (r.life >= r.max) continue;
      r.life += dt;
      const t = Math.min(1, r.life / r.max);
      r.mesh.scale.setScalar(r.base * (1 + t * r.grow));
      r.mesh.material.opacity = 0.8 * (1 - t) * (1 - t);
      if (t >= 1) r.mesh.visible = false;
    }
    for (const j of this.jets){
      if (j.life >= j.max) continue;
      j.life += dt;
      const t = Math.min(1, j.life / j.max);
      j.mesh.material.opacity = 0.55 * (1 - t) * (1 - t);
      j.mesh.scale.set(1 + t * 0.6, j.len * (1 + t * 0.45), 1 + t * 0.6);
      if (t >= 1) j.mesh.visible = false;
    }
    for (const d of this.decals){
      if (d.life >= d.max) continue;
      d.life += dt;
      const t = d.life / d.max;
      if (t > 0.55) d.mesh.material.opacity = 0.72 * (1 - (t - 0.55) / 0.45);
      if (t >= 1) d.mesh.visible = false;
    }
    for (const p of this.pops){
      if (p.life >= p.max) continue;
      p.life += dt;
      const t = p.life / p.max;
      p.mesh.scale.setScalar(0.42 + t * 1.1);
      p.mesh.material.opacity = 0.34 * (1 - t) * (1 - t);
      if (t >= 1) p.mesh.visible = false;
    }
    for (const s of this.shards){
      if (s.life >= s.max) continue;
      s.life += dt;
      const t = s.life / s.max;
      s.vel.y -= 5.5 * dt;
      s.vel.multiplyScalar(Math.max(0, 1 - 1.6 * dt));
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      s.mesh.rotation.z += s.spin.z * dt;
      s.mesh.scale.multiplyScalar(Math.max(0, 1 - 2.6 * dt));
      s.mesh.material.opacity = 0.75 * (1 - t) * (1 - t);
      if (t >= 1) s.mesh.visible = false;
    }
  }
}
