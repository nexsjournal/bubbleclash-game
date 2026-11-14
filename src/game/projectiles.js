import * as THREE from 'three';

/* ============================================================
   Water projectile system — travelling droplets with hit detection
   ============================================================ */
const POOL = 64;

const DROP_VERT = /* glsl */`
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 p = position;
    float w = sin(position.z * 9.0 + uTime * 22.0) * 0.09;
    w += sin(position.y * 7.0 - uTime * 17.0) * 0.06;
    p += normal * w;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vec4 mv = viewMatrix * wp;
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const DROP_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vN;
  varying vec3 vV;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 n = normalize(vN);
    vec3 v = normalize(vV);
    float fres = pow(1.0 - abs(dot(n, v)), 2.1);
    float band = fres * 3.6 + vUv.y * 2.0 + uTime * 1.4;
    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + band));
    vec3 L = normalize(vec3(0.4, 0.85, 0.4));
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 90.0);
    float rim = smoothstep(0.35, 1.0, fres);
    vec3 col = uColor * (0.55 + rim * 0.85) + irid * 0.24 * (0.4 + rim);
    col += vec3(1.0) * spec * 1.4;
    // tiny internal bead so the drop reads as a water sphere
    float bead = smoothstep(0.18, 0.0, length(vUv - vec2(0.36, 0.62)));
    col += uColor * bead * 0.55;
    float alpha = (0.35 + rim * 0.6 + spec * 0.9) * (1.0 - smoothstep(0.94, 1.0, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

export class ProjectileSystem {
  constructor(scene, map, effects, assets){
    this.scene = scene;
    this.map = map;
    this.effects = effects;
    this.assets = assets;
    this.onCharacterHit = null;
    this.onWorldHit = null;
    this.time = 0;
    this.camera = null;
    this.audio = null;
    this.lastWhizT = -1;

    // short, thin tracer streaks — a projectile, not a water droplet
    const geo = new THREE.SphereGeometry(0.05, 8, 6);
    const makeMat = (color) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const matBlue = makeMat(0xfff1bf);
    const matRed = makeMat(0xffb867);
    this.meshes = [];
    for (let i = 0; i < POOL; i++){
      const m = new THREE.Mesh(geo, matBlue);
      m.visible = false;
      m.renderOrder = 9;
      m.scale.set(0.26, 0.26, 16);
      this.scene.add(m);
      this.meshes.push(m);
    }
    this.list = this.meshes.map(m => ({ mesh: m, active: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), owner: null, team: 'blue', damage: 8, life: 0, trailT: 0 }));
    this.materials = { blue: matBlue, red: matRed };
    this.cursor = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._fwd = new THREE.Vector3(0, 0, 1);
  }

  clear(){
    for (const p of this.list){ p.active = false; p.mesh.visible = false; }
  }

  fire({ origin, dir, speed = 46, team = 'blue', owner = null, damage = 8, spread = 0, gravity = -2.6 }){
    let p = this.list.find(x => !x.active);
    if (!p) p = this.list[this.cursor];
    this.cursor = (this.cursor + 1) % this.list.length;

    const d = dir.clone().normalize();
    if (spread > 0){
      d.x += (Math.random() - 0.5) * spread * 2;
      d.y += (Math.random() - 0.5) * spread * 2;
      d.z += (Math.random() - 0.5) * spread * 2;
      d.normalize();
    }
    p.active = true;
    p.pos.copy(origin);
    p.prev.copy(origin);
    p.vel.copy(d).multiplyScalar(speed);
    p.velocityDir = d.clone();
    p.owner = owner;
    p.team = team;
    p.damage = damage;
    p.life = 0;
    p.maxLife = 2.4;
    p.gravity = gravity;
    p.trailT = 0;
    p.mesh.material = this.materials[team === 'red' ? 'red' : 'blue'];
    p.mesh.visible = true;
    p.mesh.position.copy(origin);
    this.orient(p.mesh, d);
  }

  orient(mesh, dir){
    mesh.quaternion.setFromUnitVectors(this._fwd, dir);
  }

  update(dt, actors){
    this.time += dt;
    for (const p of this.list){
      if (!p.active) continue;
      p.life += dt;
      if (p.life > p.maxLife){ this.kill(p); continue; }

      p.prev.copy(p.pos);
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      this.orient(p.mesh, this._a.copy(p.vel).normalize());
      p.mesh.scale.set(0.26, 0.26, 16);

      // near-miss crack for incoming rounds
      if (p.team === 'red' && this.camera && this.audio && !p.whizzed && this.time - this.lastWhizT > 0.16){
        if (p.pos.distanceTo(this.camera.position) < 2.8){
          p.whizzed = true;
          this.lastWhizT = this.time;
          this.audio.whiz((Math.random() * 2 - 1) * 0.7);
        }
      }

      // tracer trail: a short chain of hot sparks so the round's path is
      // readable from the shooter's point of view
      p.trailT += dt;
      if (p.trailT > 0.03){
        p.trailT = 0;
        this.effects.tracer(p.pos, p.team === 'red' ? 'red' : 'blue');
      }

      const segLen = p.prev.distanceTo(p.pos);
      if (segLen < 0.0001) continue;
      const dir = this._b.copy(p.pos).sub(p.prev).divideScalar(segLen);

      // world hit
      const world = this.map.rayHit(p.prev, dir, segLen);
      let bestT = world ? world.t : Infinity;
      let bestActor = null, bestPoint = null, bestNormal = world ? world.normal : null, headshot = false, bubble = false;

      // character hit
      for (const actor of actors){
        if (!actor.alive || actor === p.owner) continue;
        if (actor.invuln > 0) continue;
        const f = actor.fighter;
        if (actor.bubbled){
          const c = this._c.copy(f.group.position).add(new THREE.Vector3(0, 1.5 * f.scale, 0));
          const hit = segSphere(p.prev, p.pos, c, 1.3 * f.scale);
          if (hit && hit.t < bestT){
            bestT = hit.t; bestActor = actor; bestPoint = hit.point; bubble = true;
          }
          continue;
        }
        const spheres = f.getHitSpheres();
        for (const s of spheres){
          const hit = segSphere(p.prev, p.pos, s.center, s.r + 0.04);
          if (hit && hit.t < bestT){
            bestT = hit.t; bestActor = actor; bestPoint = hit.point;
            headshot = s.y > 1.3;
            bubble = false;
          }
        }
      }

      if (bestActor){
        this.onCharacterHit && this.onCharacterHit(bestActor, bestPoint, p, { headshot, bubble });
        this.kill(p);
      } else if (world){
        this.onWorldHit && this.onWorldHit(world.point, world.normal, p);
        this.kill(p);
      }
    }
  }

  kill(p){
    p.active = false;
    p.mesh.visible = false;
    p.owner = null;
  }
}

function segSphere(p0, p1, c, r){
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const fx = c.x - p0.x, fy = c.y - p0.y, fz = c.z - p0.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? (fx * dx + fy * dy + fz * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = p0.x + dx * t, cy = p0.y + dy * t, cz = p0.z + dz * t;
  const ddx = cx - c.x, ddy = cy - c.y, ddz = cz - c.z;
  if (ddx * ddx + ddy * ddy + ddz * ddz <= r * r){
    return { t, point: new THREE.Vector3(cx, cy, cz) };
  }
  return null;
}
