import * as THREE from 'three';

/* ============================================================
   AI controllers — village defenders + ally MINT
   ============================================================ */
const UP = new THREE.Vector3(0, 1, 0);

function dist(a, b){
  return Math.hypot(a.fighter.group.position.x - b.fighter.group.position.x, a.fighter.group.position.z - b.fighter.group.position.z);
}

function vecTo(a, b, out = new THREE.Vector3()){
  return out.copy(b.fighter.group.position).sub(a.fighter.group.position);
}

function initAI(actor, opts = {}){
  actor.ai = {
    state: opts.state || 'patrol',
    target: null,
    think: Math.random() * 0.5,
    shootCd: 0.8 + Math.random() * 1.8,
    burst: 0,
    burstT: 0,
    strafeDir: Math.random() > 0.5 ? 1 : -1,
    strafeT: 0,
    patrol: null,
    patrolT: 0,
    stuckFlip: false,
    avoidT: 0,
    avoidSign: 1,
    avoidDir: null,
    path: null,
    pathT: 0,
    pathGoal: new THREE.Vector3(),
    moveT: 0,
    lastPos: actor.fighter.group.position.clone(),
    sayCd: 6 + Math.random() * 8,
    rescueT: 0,
    kickT: 0,
    role: 'hunter',
  };
  return actor;
}

/* ================= VILLAGE DEFENDER ================= */
export function updateEnemyAI(game, e, dt){
  if (!e.alive || e.bubbled) return;
  const ai = e.ai;
  const pos = e.fighter.group.position;
  ai.think -= dt;
  ai.sayCd -= dt;
  ai.shootCd -= dt;
  ai.patrolT -= dt;

  // --- rescue a bubbled teammate ---
  let rescueTarget = null;
  for (const m of game.enemies){
    if (m === e || !m.alive || !m.bubbled) continue;
    if (dist(e, m) < 24 && game.canSee(e, m)){ rescueTarget = m; break; }
  }
  if (rescueTarget){
    ai.state = 'rescue';
    const d = dist(e, rescueTarget);
    const dir = vecTo(e, rescueTarget).setY(0);
    if (d > 7){
      followPath(game, e, rescueTarget.fighter.group.position, 3.7, dt, dir);
    } else {
      face(game, e, dir);
      if (ai.shootCd <= 0){
        game.enemyShootBubble(e, rescueTarget);
        ai.shootCd = 0.75 + Math.random() * 0.45;
      }
    }
    return;
  }

  // --- finish a bubbled blue target ---
  const blueBubble = game.actors.find(a => a.team === 'blue' && a.alive && a.bubbled && dist(e, a) < 20);
  if (blueBubble){
    ai.state = 'finish';
    const d = dist(e, blueBubble);
    const dir = vecTo(e, blueBubble).setY(0).normalize();
    if (d > 2.1){
      followPath(game, e, blueBubble.fighter.group.position, 4.1, dt, dir);
      ai.kickT = 0;
    } else {
      face(game, e, dir);
      ai.kickT += dt;
      if (ai.kickT > 1.2){
        game.enemyKick(e, blueBubble);
        ai.kickT = 0;
      }
    }
    if (ai.sayCd <= 0){ game.say('把泡泡打飞！', 'RED CELL', 2.0); ai.sayCd = 14; }
    return;
  }

  // --- siege role: camp the water source and soak anyone defending it ---
  if (ai.role === 'siege'){
    const goal = game.objective.pos;
    const dGoal = Math.hypot(pos.x - goal.x, pos.z - goal.z);
    const tgt = game.pickTargetFor(e, 22);
    if (tgt){
      const dir = vecTo(e, tgt).setY(0).normalize();
      face(game, e, dir, dt, 0.6);
      if (ai.shootCd <= 0 && game.canSee(e, tgt)){
        if (ai.burst > 0){
          ai.burstT -= dt;
          if (ai.burstT <= 0){ game.enemyShoot(e, tgt); ai.burst--; ai.burstT = 0.16; }
        } else {
          ai.burst = 3;
          ai.burstT = 0;
          ai.shootCd = 1.6 + Math.random() * 1.2;
        }
      }
    }
    if (dGoal > 3.8){
      const to = new THREE.Vector3(goal.x - pos.x, 0, goal.z - pos.z).normalize();
      followPath(game, e, goal, 3.1, dt, tgt ? to : to);
    }
    return;
  }

  // --- pick a target ---
  if (!ai.target || !ai.target.alive || ai.target.bubbled){
    // prefer someone in sight, but if the players are behind cover still pick
    // the nearest foe so the squad actively sweeps toward them instead of
    // milling around the bombsite
    ai.target = game.pickTargetFor(e, 70) || game.nearestFoe(e, 85);
  }
  const target = ai.target;

  if (!target){
    // no visible pal yet: push toward the water source in the plaza
    ai.state = 'advance';
    const goal = game.objective.pos;
    const to = new THREE.Vector3(goal.x - pos.x, 0, goal.z - pos.z);
    const dd = to.length();
    if (dd > 3.2){
      followPath(game, e, goal, 3.1, dt, to.normalize());
    } else face(game, e, to.normalize(), dt, 0.2);
    return;
  }

  const d = dist(e, target);
  const los = game.canSee(e, target);
  const dir = vecTo(e, target).setY(0).normalize();

  if (los && d < 34){
    ai.state = 'engage';
    // desired range & strafe
    ai.strafeT -= dt;
    if (ai.strafeT <= 0){ ai.strafeT = 1.2 + Math.random() * 2.2; ai.strafeDir *= -1; }
    const right = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(ai.strafeDir);
    let move = new THREE.Vector3();
    if (d > 17) move.add(dir).addScaledVector(right, 0.35);
    else if (d > 8) move.addScaledVector(right, 0.75).addScaledVector(dir, 0.4);
    else if (d > 5) move.addScaledVector(right, 0.7);
    else move.addScaledVector(dir, -0.85).addScaledVector(right, 0.4);
    // pull toward the site so firefights drift toward the objective
    const goal = game.objective.pos;
    const sd = Math.hypot(pos.x - goal.x, pos.z - goal.z);
    if (sd > 8){
      move.addScaledVector(new THREE.Vector3(goal.x - pos.x, 0, goal.z - pos.z).normalize(), 0.55);
    }
    if (ai.stuckCount > 0 && d > 6){
      // wall between us and the target — let A* route around it instead of
      // grinding against the corner
      followPath(game, e, target.fighter.group.position, 3.7, dt, dir);
    } else if (d > 7.5 || Math.abs(target.fighter.group.position.y - pos.y) > 0.2 || probeStep(game, e, dir, 1.8) > 0.2){
      // close the distance / climb the site plateau instead of strafing in
      // place at the foot of the stairs or behind a crate
      followPath(game, e, target.fighter.group.position, 3.7, dt, dir);
    } else {
      steer(game, e, move.normalize(), 3.4, dt);
      face(game, e, dir, dt, 0.5);
    }

    if (ai.burst > 0){
      ai.burstT -= dt;
      if (ai.burstT <= 0){
        game.enemyShoot(e, target);
        ai.burst--;
        ai.burstT = 0.14 + Math.random() * 0.05;
      }
    } else if (ai.shootCd <= 0 && d < 30){
      ai.burst = 3 + Math.floor(Math.random() * 3);
      ai.burstT = 0;
      ai.shootCd = 1.9 + Math.random() * 1.9;
    }
  } else {
    // no line of sight: keep pushing toward the bombsite instead of idling
    const goal = game.objective.pos;
    const sd = Math.hypot(pos.x - goal.x, pos.z - goal.z);
    if (sd > 5.4){
      ai.state = 'advance';
      const to = new THREE.Vector3(goal.x - pos.x, 0, goal.z - pos.z).normalize();
      followPath(game, e, goal, 3.5, dt, to);
    } else {
      ai.state = 'hunt';
      // no line of sight: actually walk to the target's last position instead
      // of loitering at the edge of the site
      if (d > 2.0){
        followPath(game, e, target.fighter.group.position, 3.9, dt, dir);
      } else {
        face(game, e, dir, dt, 0.7);
      }
    }
  }
}

/* ================= ALLY ================= */
export function updateAllyAI(game, a, dt){
  if (!a.alive) return;
  const ai = a.ai;
  const player = game.player;

  // while trapped in a bubble the ally drifts slowly toward the player
  if (a.bubbled){
    const d = dist(a, player);
    if (player.alive && !player.bubbled && d > 1.4){
      const dir = vecTo(a, player).setY(0).normalize();
      steer(game, a, dir, 0.95, dt);
    }
    return;
  }

  ai.think -= dt;
  ai.sayCd -= dt;
  ai.shootCd -= dt;
  ai.patrolT -= dt;

  // rescue the player: walk right into the bubble to pop it open
  if (player.bubbled && player.alive){
    ai.state = 'rescue';
    const d = dist(a, player);
    const dir = vecTo(a, player).setY(0).normalize();
    if (d > 1.05){
      // direct move so separation steering cannot keep her from touching the bubble
      game.moveActor(a, dir, 4.9, dt, dir);
    } else {
      face(game, a, dir, dt, 1);
    }
    if (ai.sayCd <= 0){ game.say('坚持住，ECHO！我来救你。', 'NOVA', 3); ai.sayCd = 10; }
    return;
  }

  // if badly soaked, regroup
  if (a.wet > 78){
    ai.state = 'retreat';
    const d = dist(a, player);
    const dir = vecTo(a, player).setY(0).normalize();
    if (d > 4) steer(game, a, dir, 4.6, dt);
    else steer(game, a, new THREE.Vector3(-dir.z, 0, dir.x), 3.0, dt);
    if (a.wet > 90 && ai.sayCd <= 0){ game.say('水压太猛了，掩护我！', 'NOVA', 2.5); ai.sayCd = 12; }
    return;
  }

  const target = game.pickTargetFor(a, 30);
  if (target){
    ai.state = 'engage';
    const d = dist(a, target);
    const los = game.canSee(a, target);
    const dir = vecTo(a, target).setY(0).normalize();
    ai.strafeT -= dt;
    if (ai.strafeT <= 0){ ai.strafeT = 1.5 + Math.random() * 2; ai.strafeDir *= -1; }
    const right = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(ai.strafeDir);
    if (los){
      let move = new THREE.Vector3();
      if (d > 13) move.add(dir).addScaledVector(right, 0.3);
      else if (d < 6) move.addScaledVector(dir, -0.8).addScaledVector(right, 0.5);
      else move.addScaledVector(right, 0.75);
      steer(game, a, move.normalize(), 4.0, dt);
      face(game, a, dir, dt, 0.7);
      if (ai.burst > 0){
        ai.burstT -= dt;
        if (ai.burstT <= 0){
          game.allyShoot(a, target);
          ai.burst--;
          ai.burstT = 0.12;
        }
      } else if (ai.shootCd <= 0){
        ai.burst = 4 + Math.floor(Math.random() * 3);
        ai.burstT = 0;
        ai.shootCd = 1.4 + Math.random() * 1.2;
      }
    } else {
      steer(game, a, dir, 4.2, dt);
    }
    return;
  }

  // follow the player
  ai.state = 'follow';
  const forward = new THREE.Vector3(-Math.sin(game.rig.yaw), 0, -Math.cos(game.rig.yaw));
  const right = new THREE.Vector3(Math.cos(game.rig.yaw), 0, -Math.sin(game.rig.yaw));
  const desired = player.fighter.group.position.clone()
    .addScaledVector(forward, -3.0)
    .addScaledVector(right, -2.2);
  const to = desired.sub(a.fighter.group.position).setY(0);
  const dd = to.length();
  if (dd > 1.5){
    const dir = to.normalize();
    steer(game, a, dir, Math.min(5.4, 2.6 + dd * 0.5), dt);
    face(game, a, dir, dt, 0.8);
  } else {
    face(game, a, forward, dt, 0.2);
  }
  if (ai.sayCd <= 0 && Math.random() < 0.3){
    const lines = ['这边交给我，你去中间看看。', '弹匣还有吗？没子弹就去捡补给。', '红队在村落北侧集结。', '别跑太远，我跟着你。'];
    game.say(lines[Math.floor(Math.random() * lines.length)], 'NOVA', 3);
    ai.sayCd = 18 + Math.random() * 14;
  }
}

/* ================= helpers ================= */
/* Test an intended step against the world without committing it. Returns how
   far the collision solver had to shove the point away from where it wanted
   to go — high drift means the route is blocked by a crate / wall. */
function probeStep(game, actor, dir, dist){
  const from = actor.fighter.group.position;
  const p = from.clone();
  p.x += dir.x * dist;
  p.z += dir.z * dist;
  const intendedX = p.x, intendedZ = p.z;
  game.map.resolveCircle(p, 0.38, from.y, 1.62);
  return Math.hypot(p.x - intendedX, p.z - intendedZ);
}

/* ============================================================
   Coarse navigation grid + A* — used whenever the direct route to
   a target is interrupted by crates, market stalls or walls.
   ============================================================ */
class MinHeap {
  constructor(){ this.a = []; }
  get size(){ return this.a.length; }
  push(item){
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0){
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(){
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length && last){
      a[0] = last;
      let i = 0;
      for (;;){
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

class NavGrid {
  constructor(game){
    this.game = game;
    this.cell = 1.0;
    this.minX = -43;
    this.maxX = 43;
    this.minZ = -39;
    this.maxZ = 39;
    this.w = Math.floor((this.maxX - this.minX) / this.cell) + 1;
    this.h = Math.floor((this.maxZ - this.minZ) / this.cell) + 1;
    this.blocked = new Uint8Array(this.w * this.h);
    this.heights = new Float32Array(this.w * this.h);
    this.built = false;
  }
  toCell(x, z){
    return {
      i: Math.max(0, Math.min(this.w - 1, Math.round((x - this.minX) / this.cell))),
      j: Math.max(0, Math.min(this.h - 1, Math.round((z - this.minZ) / this.cell))),
    };
  }
  toWorld(i, j){
    return new THREE.Vector3(this.minX + i * this.cell, 0, this.minZ + j * this.cell);
  }
  idx(i, j){ return j * this.w + i; }
  free(i, j){
    if (i < 1 || j < 1 || i >= this.w - 1 || j >= this.h - 1) return false;
    return !this.blocked[this.idx(i, j)];
  }
  build(){
    const p = new THREE.Vector3();
    for (let j = 0; j < this.h; j++){
      for (let i = 0; i < this.w; i++){
        const x = this.minX + i * this.cell;
        const z = this.minZ + j * this.cell;
        // Sample the walkable surface height so stairs, the A-site plateau and
        // low ledges form connected routes instead of being flattened to y=0.
        const h = this.game.map.getSupportHeight(x, z, 2.0, 0.15, 2.2);
        this.heights[this.idx(i, j)] = h;
        p.set(x, h + 0.02, z);
        const ix = p.x, iz = p.z;
        this.game.map.resolveCircle(p, 0.55, h + 0.02, 1.55);
        const drift = Math.hypot(p.x - ix, p.z - iz);
        this.blocked[this.idx(i, j)] = (h > 1.85 || drift > 0.12) ? 1 : 0;
      }
    }
    this.built = true;
  }
  nearestFree(c){
    if (this.free(c.i, c.j)) return c;
    for (let r = 1; r <= 4; r++){
      for (let dj = -r; dj <= r; dj++){
        for (let di = -r; di <= r; di++){
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = c.i + di, j = c.j + dj;
          if (this.free(i, j)) return { i, j };
        }
      }
    }
    return null;
  }
  findPath(from, to){
    if (!this.built) this.build();
    const s = this.nearestFree(this.toCell(from.x, from.z));
    const g = this.nearestFree(this.toCell(to.x, to.z));
    if (!s || !g) return null;
    const W = this.w;
    const start = this.idx(s.i, s.j);
    const goal = this.idx(g.i, g.j);
    if (start === goal) return [this.toWorld(g.i, g.j)];

    const gScore = new Map([[start, 0]]);
    const came = new Map();
    const open = new MinHeap();
    const heuristic = (i, j) => {
      const dx = Math.abs(i - g.i), dz = Math.abs(j - g.j);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    open.push({ i: s.i, j: s.j, f: heuristic(s.i, s.j) });
    const dirs = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
    let guard = 0;
    while (open.size && guard++ < 9000){
      const cur = open.pop();
      const ci = cur.i, cj = cur.j;
      const cid = cj * W + ci;
      if (cid === goal){
        const out = [];
        let k = goal;
        while (k !== start && came.has(k)){
          const i = k % W, j = (k - i) / W;
          out.push(this.toWorld(i, j));
          k = came.get(k);
        }
        out.reverse();
        return out.length ? out : [this.toWorld(g.i, g.j)];
      }
      for (const [di, dj, cost] of dirs){
        const ni = ci + di, nj = cj + dj;
        if (!this.free(ni, nj)) continue;
        if (di !== 0 && dj !== 0 && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
        const nid = nj * W + ni;
        // don't path up sheer walls: only accept steps the AI can actually
        // climb. The plateau (1.2 m) is reached via its 0.3 m stair treads.
        if (Math.abs(this.heights[nid] - this.heights[cid]) > 0.68) continue;
        const ng = (gScore.get(cid) || 0) + cost;
        if (ng >= (gScore.get(nid) ?? Infinity)) continue;
        gScore.set(nid, ng);
        came.set(nid, cid);
        open.push({ i: ni, j: nj, f: ng + heuristic(ni, nj) });
      }
    }
    return null;
  }
  lineFree(a, b){
    const d = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(d / 0.45));
    const p = new THREE.Vector3();
    for (let i = 1; i < n; i++){
      const t = i / n;
      p.lerpVectors(a, b, t);
      const ix = p.x, iz = p.z;
      const q = new THREE.Vector3(p.x, 0.25, p.z);
      this.game.map.resolveCircle(q, 0.42, 0.25, 1.55);
      if (Math.hypot(q.x - ix, q.z - iz) > 0.06) return false;
    }
    return true;
  }
}

function followPath(game, actor, targetPos, speed, dt, faceDir = null){
  const ai = actor.ai;
  const nav = game.navGrid || (game.navGrid = new NavGrid(game));
  const pos = actor.fighter.group.position;
  if (!ai.path || ai.pathT <= 0 || !ai.pathGoal || ai.pathGoal.distanceToSquared(targetPos) > 16){
    ai.path = nav.findPath(pos, targetPos);
    ai.pathT = 1.5;
    if (!ai.pathGoal) ai.pathGoal = new THREE.Vector3();
    ai.pathGoal.copy(targetPos);
  }
  ai.pathT -= dt;
  if (ai.path && ai.path.length){
    while (ai.path.length && Math.hypot(ai.path[0].x - pos.x, ai.path[0].z - pos.z) < 0.62) ai.path.shift();
    if (ai.path.length){
      const wp = ai.path[0];
      const dir = new THREE.Vector3(wp.x - pos.x, 0, wp.z - pos.z).normalize();
      // A* already guarantees the route, so suppress the local look-ahead
      // detour here — otherwise the probe sees the next stair tread as a wall
      // and steers the trooper off the staircase.
      steer(game, actor, dir, speed, dt, true);
      face(game, actor, faceDir || dir, dt, 0.8);
      return;
    }
  }
  const dir = new THREE.Vector3(targetPos.x - pos.x, 0, targetPos.z - pos.z);
  if (dir.lengthSq() < 0.04){
    if (faceDir) face(game, actor, faceDir, dt, 0.5);
    return;
  }
  dir.normalize();
  steer(game, actor, dir, speed, dt);
  face(game, actor, faceDir || dir, dt, 0.8);
}

function steer(game, actor, dir, speed, dt, followNav = false){
  if (!dir || dir.lengthSq() < 0.0001) return;
  const d = dir.clone().setY(0).normalize();
  // separation
  const pos = actor.fighter.group.position;
  const sep = new THREE.Vector3();
  for (const other of game.actors){
    if (other === actor || !other.alive) continue;
    const op = other.fighter.group.position;
    const dx = pos.x - op.x, dz = pos.z - op.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < 2.25 && d2 > 0.0001){
      const inv = 1 / Math.sqrt(d2);
      sep.x += dx * inv * (1.5 - Math.sqrt(d2)) * 0.9;
      sep.z += dz * inv * (1.5 - Math.sqrt(d2)) * 0.9;
    }
  }
  d.add(sep).normalize();
  const ai = actor.ai;
  const step = Math.max(0.3, speed * dt);

  // Stall detection: if the actor is trying to move but the wall solver keeps
  // pushing it back, drop the current path and commit to a lateral detour.
  // Without this a trooper could grind into a crate forever.
  if (ai){
    ai.stuckAcc = (ai.stuckAcc || 0) + dt;
    if (!ai.stuckPos) ai.stuckPos = pos.clone();
    if (ai.stuckAcc > 0.65){
      const moved = Math.hypot(pos.x - ai.stuckPos.x, pos.z - ai.stuckPos.z);
      const wantsToMove = speed > 1.0 && actor.moveSpeed > 1.0;
      if (wantsToMove && moved < 0.22){
        ai.stuckCount = (ai.stuckCount || 0) + 1;
        ai.path = null;
        ai.pathT = 0;
        const side = Math.random() < 0.5 ? 1 : -1;
        ai.avoidDir = d.clone().applyAxisAngle(UP, side * (1.25 + Math.random() * 0.9));
        ai.avoidT = 0.9 + Math.random() * 0.4;
      } else {
        ai.stuckCount = 0;
      }
      ai.stuckPos.copy(pos);
      ai.stuckAcc = 0;
    }
  }

  if (!followNav && ai && ai.avoidT > 0 && ai.avoidDir){
    ai.avoidT -= dt;
    // stay on the detour while it is still traversable
    if (probeStep(game, actor, ai.avoidDir, Math.max(0.8, step * 6)) < 0.22){
      game.moveActor(actor, ai.avoidDir, speed, dt, ai.avoidDir);
      return;
    }
    ai.avoidT = 0;
    ai.avoidDir = null;
  }

  // look ahead roughly one body-length; if the direct route is blocked pick
  // the clearest detour and commit to it for a while (no per-frame jitter).
  // Skipped while on an A* route: stairs read as blockers to this short probe.
  if (!followNav && ai && probeStep(game, actor, d, Math.max(0.9, step * 6)) > 0.16){
    const angles = [0.5, -0.5, 0.95, -0.95, 1.45, -1.45, 2.05, -2.05, 2.6, -2.6];
    let best = null, bestScore = -Infinity;
    for (const a of angles){
      const cand = d.clone().applyAxisAngle(UP, a);
      const drift = probeStep(game, actor, cand, Math.max(1.15, step * 7));
      const score = (1 - Math.min(1, drift / 0.9)) * 2.2 + cand.dot(d) * 0.8;
      if (score > bestScore){ bestScore = score; best = cand; }
    }
    if (best && bestScore > 1.2){
      ai.avoidDir = best;
      ai.avoidT = 0.55 + Math.random() * 0.55;
      game.moveActor(actor, best, speed * 0.94, dt, best);
      return;
    }
  }

  game.moveActor(actor, d, speed, dt, d);
  if (actor.ai){
    actor.ai.lastPos.copy(pos);
  }
}

function face(game, actor, dir, dt = 0.1, rate = 0.5){
  const targetHeading = Math.atan2(dir.x, dir.z);
  let h = actor.heading;
  let diff = targetHeading - h;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  actor.heading += diff * Math.min(1, dt * 10 * rate + 0.1);
  actor.fighter.group.rotation.y = actor.heading;
}

export { initAI };
