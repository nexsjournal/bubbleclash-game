import * as THREE from 'three';
import { Fighter } from '../entities/fighter.js';
import { initAI } from './ai.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

/* ============================================================
   Actor factory + combat rules
   ============================================================ */
export function createActor(game, kind, team, opts = {}){
  const fighter = new Fighter(game.assets, {
    kind,
    name: opts.name,
    team,
    variant: opts.variant ?? 0,
    scale: opts.scale || 1,
  });
  game.scene.add(fighter.group);
  const spawn = opts.spawn.clone();
  fighter.group.position.copy(spawn);
  fighter.group.rotation.y = opts.heading || 0;

  const actor = {
    fighter, kind, name: opts.name || kind, team,
    isPlayer: kind === 'player',
    isAlly: kind === 'ally',
    alive: true, bubbled: false, wet: 0, hp: 100,
    invuln: 1.2, heading: opts.heading || 0,
    vy: 0, grounded: true, moveSpeed: 0,
    water: 100, pumpCd: 0, fireCooldown: 0, meleeCd: 0,
    respawnTimer: 0, bubbleTimer: 0, bubbleInflate: 0, rescueProgress: 0, struggle: 0,
    wetDecayDelay: 0, hpRegenDelay: 0,
    spawn: spawn.clone(),
    state: 'idle',
    stats: { score: 0, bubbles: 0, pops: 0, rescues: 0, melee: 0, shots: 0, hits: 0 },
    aimBlend: 0, lastStep: 0, lastShot: -10, dryT: 0,
  };
  initAI(actor);
  return actor;
}

/* ================= PLAYER ================= */
export function updatePlayerCombat(game, dt, realDt){
  const p = game.player;
  const input = game.input;
  const f = p.fighter;
  if (!p.alive){
    f.setMotion(0, 0);
    return;
  }
  if (p.bubbled){
    // trapped: drift slowly, ease toward a teammate to get popped free
    const yaw = game.rig.yaw;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let fwd = 0, sid = 0;
    if (input.down('KeyW')) fwd += 1;
    if (input.down('KeyS')) fwd -= 1;
    if (input.down('KeyD')) sid += 1;
    if (input.down('KeyA')) sid -= 1;
    const wish = new THREE.Vector3().addScaledVector(forward, fwd).addScaledVector(right, sid);
    if (wish.lengthSq() > 0.0001){
      const speed = 1.05 + (input.down('Space') ? 0.55 : 0);
      game.moveActor(p, wish.normalize(), speed, dt);
      f.setMotion(speed, 0);
    } else {
      f.setMotion(0, 0);
    }
    f.update(dt, game.time);
    return;
  }

  const yaw = game.rig.yaw;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let fwd = 0, sid = 0;
  if (input.down('KeyW')) fwd += 1;
  if (input.down('KeyS')) fwd -= 1;
  if (input.down('KeyD')) sid += 1;
  if (input.down('KeyA')) sid -= 1;
  const wish = new THREE.Vector3().addScaledVector(forward, fwd).addScaledVector(right, sid);
  const hasInput = wish.lengthSq() > 0.0001;
  if (hasInput) wish.normalize();

  const aiming = game.aimBlend > 0.5;
  f.aimPoint = computeAimPoint(game, f.aimPoint || new THREE.Vector3());
  f.aimHold = aiming;
  // the barrel should follow the reticle whenever the player is aiming OR
  // shooting, so the muzzle never reads as pointing beside the crosshair
  f.aimTrack = aiming || input.lmb;
  const sprint = input.down('ShiftLeft') && fwd > 0 && !aiming;
  const maxSpeed = aiming ? 2.9 : sprint ? 6.7 : 4.8;
  const targetV = wish.clone().multiplyScalar(maxSpeed);
  const accel = p.grounded ? 14 : 4.5;
  p.vel = p.vel || new THREE.Vector3();
  p.vel.x += (targetV.x - p.vel.x) * Math.min(1, accel * dt);
  p.vel.z += (targetV.z - p.vel.z) * Math.min(1, accel * dt);
  if (!hasInput && p.grounded){
    const fr = Math.max(0, 1 - 12 * dt);
    p.vel.x *= fr; p.vel.z *= fr;
  }

  // jump
  if (input.pressed('Space') && p.grounded){
    p.vy = 7.7;
    p.grounded = false;
    game.effects.dust(f.group.position.clone(), 5);
  }

  // horizontal move + collision
  const pos = f.group.position;
  pos.x += p.vel.x * dt;
  pos.z += p.vel.z * dt;
  pos.x = THREE.MathUtils.clamp(pos.x, -43, 43);
  pos.z = THREE.MathUtils.clamp(pos.z, -39, 39);
  const stepped = game.map.resolveCircle(pos, 0.38, pos.y, 1.68);
  if (stepped > 0 && pos.y < stepped - 0.01 && (p.grounded || p.vy < 0.25)){
    // climb ledges/stairs even on the frame right after a jump or a down-step
    pos.y = stepped;
    if (p.vy < 0){ p.vy = 0; p.grounded = true; }
  }

  // vertical
  p.vy -= 18 * dt;
  pos.y += p.vy * dt;
  const support = game.map.getSupportHeight(pos.x, pos.z, pos.y, 0.38, p.grounded ? 0.5 : 0.14);
  if (pos.y <= support){
    if (!p.grounded && p.vy < -3) game.effects.dust(new THREE.Vector3(pos.x, support, pos.z), 4);
    pos.y = support;
    p.vy = 0;
    p.grounded = true;
  } else {
    p.grounded = false;
  }

  const speed = Math.hypot(p.vel.x, p.vel.z);
  p.moveSpeed = speed;
  f.setMotion(speed, game.aimBlend, p.grounded);

  // facing: while shooting or aiming the whole body turns to the camera aim
  let targetHeading = p.heading;
  const wantsAim = game.aimBlend > 0.25 || input.lmb;
  if (wantsAim){
    targetHeading = Math.atan2(forward.x, forward.z);
    p.heading = lerpAngle(p.heading, targetHeading, 1 - Math.pow(0.000001, dt));
  } else if (speed > 0.6){
    targetHeading = Math.atan2(p.vel.x, p.vel.z);
    p.heading = lerpAngle(p.heading, targetHeading, 1 - Math.pow(0.0004, dt));
  }
  f.group.rotation.y = p.heading;

  // footsteps
  if (p.grounded && speed > 1.2){
    p.lastStep -= dt;
    if (p.lastStep <= 0){
      game.audio.footstep(0, sprint ? 1.1 : 0.8, sprint);
      p.lastStep = sprint ? 0.27 : 0.38;
    }
  }

  // shooting
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.meleeCd = Math.max(0, (p.meleeCd || 0) - dt);
  if (p.weapon && p.weapon !== 'rifle'){
    p.weaponTimer -= dt;
    if (p.weaponTimer <= 0){
      p.weapon = 'rifle';
      p.fighter.setWeapon('rifle');
      game.ui.showToast('特殊武器用完了 · 换回 M4A1', 1.8);
    }
  }
  if (input.lmb) playerFire(game);
  p.pumpCd = Math.max(0, p.pumpCd - dt);
  p.dryT = Math.max(0, p.dryT - dt);

  f.update(dt, game.time);
}

function playerFire(game){
  const p = game.player;
  if (!p.alive || p.bubbled) return;
  if (p.fireCooldown > 0) return;
  if (p.water < 1.6){
    if (game.input.lmbPressed && p.dryT <= 0){
      game.audio.dryFire();
      game.ui.showToast(p.waterReserve > 0 ? '弹匣已空 · 按 R 换弹' : '弹药耗尽 · 寻找补给箱', 1.6);
      p.dryT = 1.2;
    }
    return;
  }
  const weapon = p.weapon || 'rifle';
  const stats = weapon === 'sniper'
    ? { cd: 1.05, cost: 10, dmg: 92, speed: 160, spread: 0.0, gravity: -0.35 }
    : weapon === 'smg'
      ? { cd: 0.068, cost: 1.15, dmg: 11, speed: 120, spread: 0.03, gravity: -1.2 }
      : { cd: 0.105, cost: 3.35, dmg: 22, speed: 150, spread: 0.016, gravity: -1.1 };

  const muzzle = p.fighter.getMuzzleWorld(new THREE.Vector3());
  const aim = (p.fighter.aimPoint && p.fighter.aimPoint.clone()) || computeAimPoint(game, new THREE.Vector3());
  const dir = aim.sub(muzzle).normalize();
  // Never snap the body on the trigger: the old facing correction made the
  // character whip left for a frame and then rotate back to the target.
  // updatePlayerCombat already turns the body smoothly toward the reticle.
  p.fireCooldown = stats.cd;
  p.water = Math.max(0, p.water - stats.cost);
  p.lastShot = game.time;
  const moving = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 6);
  const spread = (stats.spread + moving * 0.016) * (1 - game.aimBlend * 0.7) * (p.grounded ? 1 : 1.5);
  game.projectiles.fire({
    origin: muzzle, dir, speed: stats.speed, team: 'blue', owner: p,
    damage: stats.dmg, spread, gravity: stats.gravity,
  });
  game.effects.muzzle(muzzle, dir, 'blue');
  game.audio.shot('blue', game.getPan(muzzle));
  p.fighter.playShoot();
  game.rig.addRecoil(weapon === 'sniper' ? 0.06 : 0.016 + Math.random() * 0.008);
  game.rig.addShake(weapon === 'sniper' ? 0.12 : 0.035);
  game.rig.fovKick += weapon === 'sniper' ? 0.5 : 0.18;
  p.stats.shots++;
  game.comboTimer = Math.max(game.comboTimer, 0.5);
}

export function computeAimPoint(game, out = new THREE.Vector3()){
  const origin = game.camera.position;
  const dir = new THREE.Vector3();
  game.camera.getWorldDirection(dir);
  let dist = 55;
  const world = game.map.rayHit(origin, dir, 130);
  if (world) dist = Math.max(2.2, world.t);

  // converge on actors under the reticle so the muzzle -> target line is exact
  const ray = new THREE.Ray(origin, dir);
  const sphere = new THREE.Sphere();
  const hit = new THREE.Vector3();
  for (const a of game.actors){
    if (!a.alive || a === game.player) continue;
    if (a.bubbled){
      sphere.center.copy(a.fighter.group.position).y += 1.05 * a.fighter.scale;
      sphere.radius = 1.28 * (1 + (a.bubbleInflate || 0) * 0.0035);
      const p = ray.intersectSphere(sphere, hit);
      if (p){
        const t = origin.distanceTo(p);
        if (t > 1.2 && t < dist) dist = t;
      }
      continue;
    }
    for (const s of a.fighter.getHitSpheres()){
      if (origin.distanceTo(s.center) < 1.1) continue;
      sphere.center.copy(s.center);
      sphere.radius = s.r * 1.15;
      const p = ray.intersectSphere(sphere, hit);
      if (p){
        const t = origin.distanceTo(p);
        if (t > 1.2 && t < dist) dist = t;
      }
    }
  }
  return out.copy(origin).addScaledVector(dir, dist);
}

export function tryPump(game){
  const p = game.player;
  if (!p.alive || p.bubbled) return;
  if (p.pumpCd > 0){
    game.ui.showToast('换弹中 · ' + p.pumpCd.toFixed(1) + 's', 1.0);
    return;
  }
  if (p.water > 92){
    game.ui.showToast('弹匣已满', 1.0);
    return;
  }
  if ((p.waterReserve || 0) <= 0){
    game.ui.showToast('备用弹药耗尽 · 寻找补给箱', 1.8);
    game.audio.dryFire();
    return;
  }
  p.waterReserve--;
  p.water = 100;
  p.pumpCd = 1.35;
  game.audio.reload();
  game.ui.showToast('换弹完成 · 弹匣 ×' + p.waterReserve, 1.2);
}

export function computeInteractTarget(game){
  const p = game.player;
  if (!p.alive) return null;
  const pos = p.fighter.group.position;
  let best = null, bestD = Infinity;
  for (const a of game.actors){
    if (!a.alive || a === p || a.bubbled) continue;
    if (a.team !== 'red') continue;
    const d = a.fighter.group.position.distanceTo(pos);
    if (d < 2.4 && d < bestD){
      bestD = d;
      best = { actor: a, type: 'melee', label: `近身击倒 ${a.name}` };
    }
  }
  return best;
}

export function tryPlayerInteract(game){
  const t = computeInteractTarget(game);
  if (!t){
    game.ui.showToast('靠近敌人再按 F 挥拳', 1.2);
    return;
  }
  playerMelee(game, t.actor);
}

function playerMelee(game, victim){
  if (!victim.alive) return;
  const p = game.player;
  if (p.meleeCd > 0) return;
  p.meleeCd = 0.85;
  p.fighter.playPunch();
  game.audio.meleeWhoosh();
  game.rig.addShake(0.45);
  game.rig.fovKick += 2.4;
  game.audio.kick();
  game.ui.hitmarker(true);
  game.combo += 1;
  game.comboTimer = 3.4;
  game.comboMax = Math.max(game.comboMax, game.combo);

  const dir = victim.fighter.group.position.clone().sub(p.fighter.group.position).setY(0);
  if (dir.lengthSq() > 0.001) dir.normalize();
  victim.fighter.group.rotation.y = Math.atan2(-dir.x, -dir.z);
  const center = victim.fighter.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  game.effects.dust(center, 8);
  victim.fighter.playHit();
  victim.hp = Math.max(0, victim.hp - 100);
  game.audio.meleeImpact();
  if (victim.hp <= 0) killActor(game, victim, p, 'melee');
  game.ui.showBanner('近身击倒', 'CQC TAKEDOWN', false, 1.2);
}

function playerKick(game, victim){
  if (!victim.bubbled || victim.fly) return;
  const p = game.player;
  p.fighter.playPunch();
  game.slowmo = 0.22;
  game.flashPulse = 0.65;
  game.rig.addShake(0.55);
  game.rig.fovKick += 4;
  game.audio.kick();
  game.ui.hitmarker(true);
  game.combo += 1;
  game.comboTimer = 3.4;
  game.comboMax = Math.max(game.comboMax, game.combo);

  // punch lands: the film bursts in place and the occupant is knocked flat
  const dir = victim.fighter.group.position.clone().sub(p.fighter.group.position).setY(0);
  if (dir.lengthSq() > 0.001) dir.normalize();
  victim.fighter.group.rotation.y = Math.atan2(-dir.x, -dir.z);
  popActor(game, victim, p, 'kick');
  game.ui.showBanner('泡泡炸裂', 'BREACH', false, 1.4);
}

function playerRescue(game, victim){
  if (!victim.bubbled) return;
  game.player.fighter.playPunch();
  rescueActor(game, victim, game.player);
}

/* ================= SHOOTING ================= */
export function enemyShoot(game, actor, target){
  if (!actor.alive || actor.bubbled || !target || !target.alive) return;
  const muzzle = actor.fighter.getMuzzleWorld(new THREE.Vector3());
  const aim = target.fighter.getCenter(new THREE.Vector3());
  if (target.vel) aim.addScaledVector(target.vel, 0.12);
  aim.y += 0.12;
  const dist = muzzle.distanceTo(aim);
  const dir = aim.sub(muzzle).normalize();
  const spread = 0.016 + Math.min(0.045, dist * 0.0011);
  game.projectiles.fire({
    origin: muzzle, dir, speed: 120, team: 'red', owner: actor,
    damage: 9.5, spread, gravity: -1.2,
  });
  actor.fighter.playShoot();
  game.effects.muzzle(muzzle, dir, 'red');
  game.audio.shot('red', game.getPan(muzzle));
  actor.stats.shots++;
  game.redStats.shots++;
}

export function allyShoot(game, actor, target){
  if (!actor.alive || actor.bubbled || !target || !target.alive) return;
  const muzzle = actor.fighter.getMuzzleWorld(new THREE.Vector3());
  const aim = target.fighter.getCenter(new THREE.Vector3());
  if (target.vel) aim.addScaledVector(target.vel, 0.13);
  aim.y += 0.1;
  const dir = aim.sub(muzzle).normalize();
  const dist = muzzle.distanceTo(aim);
  const spread = 0.01 + Math.min(0.028, dist * 0.0008);
  game.projectiles.fire({
    origin: muzzle, dir, speed: 140, team: 'blue', owner: actor,
    damage: 13, spread, gravity: -1.2,
  });
  actor.fighter.playShoot();
  game.effects.muzzle(muzzle, dir, 'blue');
  game.audio.shot('blue', game.getPan(muzzle));
  actor.stats.shots++;
}

export function enemyShootBubble(game, actor, bubble){
  shootBubble(game, actor, bubble, 'red');
}
export function allyShootBubble(game, actor, bubble){
  shootBubble(game, actor, bubble, 'blue');
}

function shootBubble(game, actor, bubble, color){
  if (!actor.alive || actor.bubbled || !bubble.alive || !bubble.bubbled) return;
  const muzzle = actor.fighter.getMuzzleWorld(new THREE.Vector3());
  const center = bubble.fighter.group.position.clone().add(new THREE.Vector3(0, 1.35 * bubble.fighter.scale, 0));
  const dir = center.sub(muzzle).normalize();
  game.projectiles.fire({
    origin: muzzle, dir, speed: 42, team: color, owner: actor,
    damage: 0, spread: 0.004, gravity: -1.9,
  });
  actor.fighter.playShoot();
  game.effects.muzzle(muzzle, dir, color);
  game.audio.shot(color, game.getPan(muzzle));
}

/* ================= DAMAGE / BUBBLES ================= */
export function handleCharacterHit(game, victim, point, projectile, meta){
  const shooter = projectile.owner;
  // bubble contact
  if (meta.bubble){
    if (shooter && shooter.team === victim.team){
      victim.rescueProgress = (victim.rescueProgress || 0) + 0.36;
      game.effects.splash(point, null, victim.team === 'red' ? 'red' : 'blue', false);
      game.audio.splash(game.getPan(point), false);
      game.spawnFloater(point, '救援 ' + Math.round(Math.min(1, victim.rescueProgress) * 100) + '%', '');
      if (victim.rescueProgress >= 1){
        rescueActor(game, victim, shooter);
      }
    } else {
      // enemy bubbles swell with every hit instead of popping instantly
      const add = Math.max(7, projectile.damage * 1.15);
      victim.bubbleInflate = Math.min(100, (victim.bubbleInflate || 0) + add);
      victim.fighter.bubbleInflate = victim.bubbleInflate;
      game.effects.splash(point.clone(), null, victim.team === 'red' ? 'red' : 'blue', false);
      game.audio.splash(game.getPan(point), false);
      if (shooter && shooter.isPlayer){
        game.ui.hitmarker(false);
        game.spawnFloater(point, '泡泡 ' + Math.round(victim.bubbleInflate) + '%', '');
      }
      if (victim.bubbleInflate >= 100) popActor(game, victim, shooter, 'shot');
    }
    return;
  }
  if (victim.invuln > 0) return;
  applyWet(game, victim, projectile.damage * (meta.headshot ? 1.45 : 1), shooter, point, meta.headshot);
}

export function applyWet(game, victim, amount, attacker, point, headshot = false){
  // bullets now deal plain health damage; the old soak / bubble pipeline is gone
  if (!victim.alive || victim.bubbled) return;
  victim.hp = Math.max(0, victim.hp - amount);
  victim.hpRegenDelay = 7.5;
  victim.fighter.playHit();
  const bloodDir = attacker && attacker.fighter
    ? new THREE.Vector3().subVectors(victim.fighter.group.position, attacker.fighter.group.position).setY(0)
    : null;
  game.effects.fleshHit(point.clone(), bloodDir);

  let gain = 0;
  if (attacker && attacker.alive){
    attacker.stats.hits++;
    if (attacker.team === 'blue'){
      const blueMult = attacker.isPlayer ? game.comboMult() : 1;
      gain = Math.max(1, Math.round((headshot ? 2 : 1) * blueMult));
      game.addScore(attacker, gain);
      if (attacker.isPlayer || attacker.isAlly){
        game.combo += 1;
        game.comboTimer = 3.3;
        game.comboMax = Math.max(game.comboMax, game.combo);
      }
    }
    if (attacker.isPlayer){
      game.ui.hitmarker(headshot);
      game.spawnFloater(point, (headshot ? 'CRIT +' : '+') + gain, headshot ? 'crit' : '');
      game.audio.hit();
      if (headshot) game.audio.headshot();
    }
  }

  if (victim.isPlayer){
    game.damageTaken += amount;
    game.damagePulse = Math.min(1, 0.55 + amount * 0.045);
    game.ui.flashDamage();
    game.rig.addShake(0.22 + amount * 0.012);
    if (attacker){
      const dir = attacker.fighter.group.position.clone().sub(victim.fighter.group.position);
      dir.y = 0; dir.normalize();
      const camFwd = new THREE.Vector3(); game.camera.getWorldDirection(camFwd); camFwd.y = 0; camFwd.normalize();
      const camRight = new THREE.Vector3().crossVectors(camFwd, UP).normalize();
      const angle = Math.atan2(dir.dot(camRight), dir.dot(camFwd));
      game.ui.damageFrom(angle);
    }
  }

  if (victim.hp <= 0) killActor(game, victim, attacker, 'shot');
}

/* straight kill: knockdown animation, then respawn */
export function killActor(game, victim, attacker, method = 'shot'){
  if (!victim.alive) return;
  victim.bubbled = false;
  victim.alive = false;
  victim.hp = 0;
  victim.respawnTimer = victim.isPlayer ? 4.2 : 8.0;
  victim.fighter.playDeath();
  const center = victim.fighter.group.position.clone().add(new THREE.Vector3(0, 1.1 * victim.fighter.scale, 0));
  game.effects.dust(center, 9);
  game.audio.pop();

  if (attacker && attacker.team === 'blue' && victim.team === 'red'){
    const pts = Math.round((method === 'melee' ? 45 : 25) * game.comboMult());
    game.addScore(attacker, pts);
    attacker.stats.pops++;
    if (method === 'melee') attacker.stats.melee++;
    game.audio.killConfirm();
    game.spawnFloater(center, '+' + pts, 'score');
    game.ui.addKillfeed(attacker.name, victim.name, method === 'melee' ? '近身击倒' : '击杀', '✕');
  } else if (attacker && attacker.team === 'red' && victim.team === 'blue'){
    const pts = method === 'melee' ? 35 : 20;
    game.scoreRed += pts;
    game.redStats.score += pts;
    game.ui.addKillfeed(attacker.name, victim.name, method === 'melee' ? '近身击倒' : '击杀', '✕');
    if (victim.isPlayer){
      game.ui.showBanner('你被击倒了', 'KILLED IN ACTION', true, 2.6);
      game.damagePulse = 1;
      game.rig.addShake(0.65);
      game.audio.alarm();
    } else {
      game.say('NOVA 倒下了，掩护复活点！', 'NOVA', 2.4);
    }
  }
  if (victim.isPlayer){
    game.rig.initialized = false;
    game.ui.refs.bubbleScreen.classList.remove('on');
  }
}

export function bubbleActor(game, victim, attacker){
  if (!victim.alive || victim.bubbled) return;
  victim.bubbled = true;
  victim.bubbleTimer = 0;
  victim.bubbleInflate = 0;
  victim.rescueProgress = 0;
  victim.struggle = 0;
  victim.wet = 100;
  victim.hp = Math.max(victim.hp, 30);
  victim.fighter.setBubbled(true);
  victim.fighter.setWetness(100);

  const center = victim.fighter.group.position.clone().add(new THREE.Vector3(0, 1.35 * victim.fighter.scale, 0));
  game.effects.bubbleForm(center, victim.team === 'red' ? 'red' : 'blue');
  game.audio.bubble();

  if (attacker && attacker.team === 'blue' && victim.team === 'red'){
    const pts = Math.round(15 * game.comboMult());
    game.addScore(attacker, pts);
    attacker.stats.bubbles++;
    game.ui.addKillfeed(attacker.name, victim.name, '泡封', '◉');
    if (attacker.isPlayer){
      game.ui.showBanner('目标泡封成功 · +' + pts, 'CONTAINED', false, 2.2);
      game.ui.hitmarker(true);
      game.spawnFloater(center, '泡封 +' + pts, 'score');
      game.flashPulse = 0.3;
    } else {
      game.say('泡封一个！快用近身击破打飞它。', 'NOVA', 2.6);
    }
  } else if (attacker && attacker.team === 'red' && victim.team === 'blue'){
    game.scoreRed += 12;
    game.redStats.score += 12;
    game.redStats.bubbles++;
    game.ui.addKillfeed(attacker.name, victim.name, '泡封', '◉');
    if (victim.isPlayer){
      game.ui.showBanner('CONTAINED', '向 NOVA 移动脱困', true, 2.8);
      game.audio.alarm();
      game.rig.addShake(0.4);
    } else {
      game.say('我被困住了，快来碰我一下！', 'NOVA', 2.6);
    }
  }
  if (victim.isPlayer){
    game.damagePulse = 1;
    game.rig.trauma = Math.min(1, game.rig.trauma + 0.35);
  }
}

export function rescueActor(game, victim, rescuer){
  if (!victim.alive || !victim.bubbled) return;
  victim.bubbled = false;
  victim.bubbleTimer = 0;
  victim.rescueProgress = 0;
  victim.struggle = 0;
  victim.fly = null;
  victim.wet = 45;
  victim.hp = Math.max(victim.hp, 48);
  victim.invuln = 1.0;
  victim.bubbleInflate = 0;
  victim.fighter.bubbleInflate = 0;
  victim.fighter.setBubbled(false);
  victim.fighter.setWetness(45);
  victim.fighter.playGetUp();

  const center = victim.fighter.group.position.clone().add(new THREE.Vector3(0, 1.2 * victim.fighter.scale, 0));
  game.effects.rescue(center, victim.team === 'red' ? 'blue' : 'green');
  game.audio.rescue();

  if (rescuer && rescuer !== victim){
    if (rescuer.team === 'blue' && victim.team === 'blue'){
      const pts = Math.round(25 * (rescuer.isPlayer ? game.comboMult() : 1));
      game.addScore(rescuer, pts);
      rescuer.stats.rescues++;
      game.ui.addKillfeed(rescuer.name, victim.name, '救援', '✚');
      if (rescuer.isPlayer){
        game.ui.showBanner('队友救援 +' + pts, 'RESCUED', false, 2.4);
        game.spawnFloater(center, '救援 +' + pts, 'score');
      } else {
        game.say('起来啦！继续压制。', 'NOVA', 2.4);
      }
    } else if (rescuer.team === 'red' && victim.team === 'red'){
      game.redStats.rescues++;
      game.ui.addKillfeed(rescuer.name, victim.name, '救援', '✚');
    }
  }
  if (victim.isPlayer){
    game.rig.initialized = false;
    game.ui.showBanner('继续守住水站', 'BREAKOUT', false, 2.2);
    game.audio.countdown(true);
  }
}

export function popActor(game, victim, attacker, method = 'kick'){
  if (!victim.alive || !victim.bubbled) return;
  victim.bubbled = false;
  victim.fly = null;
  victim.bubbleInflate = 0;
  victim.fighter.bubbleInflate = 0;
  victim.rescueProgress = 0;
  victim.struggle = 0;
  victim.fighter.setBubbled(false);
  victim.fighter.bubble.visible = false;
  victim.fighter.bubbleInner.visible = false;
  victim.fighter.playDeath();
  victim.alive = false;
  victim.respawnTimer = victim.isPlayer ? 3.4 : 7.0;

  // keep the body visible long enough to see it go down, then clear the field
  const fighterRef = victim.fighter;
  setTimeout(() => { if (!victim.alive) fighterRef.group.visible = false; }, 2600);

  const center = victim.fighter.group.position.clone().add(new THREE.Vector3(0, 1.3 * victim.fighter.scale, 0));
  game.effects.bubblePop(center, victim.team === 'red' ? 'red' : 'blue');
  game.audio.pop();

  if (attacker && attacker.team === 'blue' && victim.team === 'red'){
    const pts = Math.round((method === 'kick' ? 45 : 20) * game.comboMult());
    game.addScore(attacker, pts);
    attacker.stats.pops++;
    game.spawnFloater(center, '+' + pts, 'score');
    game.ui.addKillfeed(attacker.name, victim.name, method === 'kick' ? 'BREACH' : 'POP', '◉');
  } else if (attacker && attacker.team === 'red' && victim.team === 'blue'){
    const pts = method === 'kick' ? 35 : 18;
    game.scoreRed += pts;
    game.redStats.score += pts;
    game.redStats.pops++;
    game.ui.addKillfeed(attacker.name, victim.name, method === 'kick' ? 'BREACH' : 'POP', '◉');
    if (victim.isPlayer){
      game.ui.showBanner('被红队击飞了', 'BUBBLE BROKEN', true, 2.6);
      game.damagePulse = 1;
      game.rig.addShake(0.65);
      game.audio.alarm();
    } else {
      game.say('我被击飞了，掩护我！', 'NOVA', 2.8);
    }
  }
  if (victim.isPlayer){
    game.rig.initialized = false;
    game.ui.refs.bubbleScreen.classList.remove('on');
  }
}

export function enemyKick(game, actor, victim){
  if (!victim.alive || !victim.bubbled) return;
  actor.fighter.playPunch();
  game.effects.dust(actor.fighter.group.position.clone(), 6);
  game.audio.kick();
  popActor(game, victim, actor, 'kick');
}

/* ================= PER-FRAME ACTOR STATE ================= */
export function updateActorStates(game, dt, realDt = dt){
  for (const a of game.actors){
    const f = a.fighter;

    // punted bubble flight
    if (a.fly){
      a.fly.t += dt;
      const pos = f.group.position;
      pos.x += a.fly.vx * dt;
      pos.z += a.fly.vz * dt;
      pos.y += a.fly.vy * dt;
      a.fly.vy -= 15 * dt;
      f.group.rotation.y += dt * 9;
      f.update(dt, game.time);
      if ((a.fly.t > 0.5 && pos.y <= 0.35) || a.fly.t > 1.5){
        pos.y = Math.max(0, pos.y);
        const attacker = a.fly.attacker;
        a.fly = null;
        popActor(game, a, attacker, 'kick');
      }
      continue;
    }

    if (!a.alive){
      a.fighter.updateDeath(realDt);
      if (a.isPlayer || a.isAlly){
        a.respawnTimer -= dt;
        if (a.respawnTimer <= 0) respawnActor(game, a);
      }
      continue;
    }
    a.invuln = Math.max(0, a.invuln - dt);

    // wet decay / health regen
    a.wetDecayDelay = Math.max(0, a.wetDecayDelay - dt);
    if (a.wetDecayDelay <= 0 && a.wet > 0 && !a.bubbled){
      a.wet = Math.max(0, a.wet - (a.isPlayer ? 4.2 : 2.4) * dt);
      f.setWetness(a.wet);
    }
    a.hpRegenDelay = Math.max(0, a.hpRegenDelay - dt);
    if (a.hpRegenDelay <= 0 && a.hp < 100 && !a.bubbled){
      a.hp = Math.min(100, a.hp + (a.isPlayer ? 7 : 4.5) * dt);
    }

    // aim pose for AI
    if (!a.isPlayer){
      const engaging = a.ai && (a.ai.state === 'engage' || a.ai.state === 'rescue' || a.ai.state === 'finish');
      a.aimBlend = THREE.MathUtils.lerp(a.aimBlend, engaging ? 1 : 0, 1 - Math.pow(0.001, dt));
      f.setMotion(a.moveSpeed, a.aimBlend, a.grounded);
      a.state = a.ai ? a.ai.state : 'idle';
    }

    // water drips
    if (a.wet > 55 && Math.random() < dt * (a.wet / 100) * 7){
      const p = f.group.position;
      game.effects.drip(new THREE.Vector3(
        p.x + (Math.random() - 0.5) * 0.7,
        p.y + 0.35 + Math.random() * 1.2,
        p.z + (Math.random() - 0.5) * 0.7
      ));
    }

    f.update(dt, game.time);
  }
}

export function updateBubbleState(game, dt){
  const BUBBLE_LIFE = 12;
  if (game.player.autoPunchCd) game.player.autoPunchCd = Math.max(0, game.player.autoPunchCd - dt);
  for (const a of game.actors){
    if (!a.alive || !a.bubbled || a.fly) continue;

    // teammates rescue by touch: walk into the bubble
    for (const m of game.actors){
      if (m === a || !m.alive || m.bubbled || m.team !== a.team) continue;
      if (m.fighter.group.position.distanceTo(a.fighter.group.position) < 1.25){
        rescueActor(game, a, m);
        break;
      }
    }
    if (!a.bubbled) continue;

    a.bubbleTimer += dt;

    // extremely close enemies trigger an automatic cat punch
    if (a.team === 'red' && game.player.alive && !game.player.bubbled && !game.player.autoPunchCd){
      const pp = game.player.fighter.group.position;
      const d = pp.distanceTo(a.fighter.group.position);
      if (d < 1.7){
        game.player.autoPunchCd = 1.2;
        playerKick(game, a);
        continue;
      }
    }

    if (a.bubbleTimer >= BUBBLE_LIFE) bubbleTimeout(game, a);
  }
}

function bubbleTimeout(game, a){
  if (!a.alive || !a.bubbled) return;
  a.hp = 0;
  game.ui.addKillfeed(a.name, '泡泡', '破裂', '◌');
  popActor(game, a, null, 'timeout');
  if (a.isPlayer){
    game.ui.showBanner('下次记得向 NOVA 靠拢', 'BUBBLE BROKEN', true, 2.6);
    game.audio.alarm();
  } else if (a.isAlly){
    game.ui.showToast('NOVA 的泡泡破了 · 她正在重新集结', 2.2);
  }
}

export function respawnActor(game, actor){
  const spawn = actor.isPlayer ? game.map.playerSpawn
    : actor.isAlly ? game.map.allySpawn
    : pickEnemySpawn(game);
  const f = actor.fighter;
  actor.alive = true;
  actor.bubbled = false;
  actor.wet = 0;
  actor.hp = 100;
  actor.invuln = 2.0;
  actor.respawnTimer = 0;
  actor.bubbleTimer = 0;
  actor.rescueProgress = 0;
  actor.struggle = 0;
  actor.fly = null;
  actor.bubbleInflate = 0;
  actor.vy = 0;
  actor.grounded = true;
  actor.water = 100;
  actor.pumpCd = 0;
  actor.fireCooldown = 0;
  actor.moveSpeed = 0;
  actor.heading = actor.isPlayer ? Math.PI : Math.random() * Math.PI * 2;
  // Clear the death pose first: updateDeath() shifts body.position.y to keep the
  // corpse on the ground, and without resetting it the fresh spawn sinks into
  // the map up to the waist.
  f.resetPose();
  f.group.position.copy(spawn);
  f.group.position.y = 0;
  f.group.rotation.y = actor.heading;
  f.group.visible = true;
  f.root.position.set(0, 0, 0);
  f.root.rotation.set(0, 0, 0);
  if (actor.ai){
    actor.ai.state = 'patrol';
    actor.ai.target = null;
    actor.ai.patrol = null;
    actor.ai.shootCd = 1 + Math.random() * 1.5;
    actor.ai.burst = 0;
    actor.ai.kickT = 0;
  }
  game.effects.ringAt(spawn.clone().setY(0.05), 1.2, 'surface', 2.4, 0.6, new THREE.Color(0xe2c68a), new THREE.Vector3(0, 1, 0));
  if (actor.isPlayer){
    game.rig.initialized = false;
    game.ui.showBanner('重新部署', 'REDEPLOY', false, 1.8);
  }
}

function pickEnemySpawn(game){
  const p = game.player.fighter.group.position;
  let best = game.map.enemySpawns[0], bestD = -1;
  for (const s of game.map.enemySpawns){
    const d = s.distanceTo(p);
    if (d > bestD){ bestD = d; best = s; }
  }
  // slight variation
  return best.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
}

export function handleWorldHit(game, point, normal, projectile){
  game.effects.impact(point, normal);
  game.audio.impact(game.getPan(point), normal && normal.y > 0.7);
  if (normal.y > 0.55 && point.y < 0.25){
    game.effects.spawnDecal(point, normal, 1.0, 0x3a2f22);
  }
}

function lerpAngle(a, b, t){
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
