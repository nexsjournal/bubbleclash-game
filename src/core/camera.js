import * as THREE from 'three';

/* ============================================================
   Over-the-shoulder third person camera rig
   ============================================================ */
export class CameraRig {
  constructor(camera, map){
    this.camera = camera;
    this.map = map;
    this.yaw = 0;
    this.pitch = 0.03;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.shoulder = 0.68;
    this.distance = 3.9;
    this.aimDistance = 2.8;
    this.aimBlend = 0;
    this.baseFov = 62;
    this.aimFov = 44;
    this.fovKick = 0;
    this.trauma = 0;
    this.time = 0;
    this.smoothPos = new THREE.Vector3();
    this.smoothLook = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.tempV = new THREE.Vector3();
    this.tempV2 = new THREE.Vector3();
    this.shakeOffset = new THREE.Vector3();
    this.bubbleAngle = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.initialized = false;
  }

  addLook(dx, dy){
    this.yaw -= dx * this.sensitivity;
    this.pitch -= dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-0.72, Math.min(0.78, this.pitch));
  }

  addRecoil(amount){
    this.recoilPitch += amount;
  }

  addShake(amount){
    this.trauma = Math.min(1, this.trauma + amount);
  }

  getForward(out = new THREE.Vector3()){
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  getRight(out = new THREE.Vector3()){
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  setAim(blend){ this.aimBlend = blend; }

  /** main gameplay follow */
  updateCombat(dt, focus, moving = 0, time = 0){
    this.time = time;
    const forward = this.getForward(this.tempV);
    const right = this.getRight(this.tempV2);
    const aim = this.aimBlend;

    const shoulder = this.shoulder + aim * 0.18;
    const dist = THREE.MathUtils.lerp(this.distance, this.aimDistance, aim);
    const pivot = new THREE.Vector3(focus.x, focus.y + 1.55, focus.z)
      .addScaledVector(right, shoulder * 0.55 * (1 - aim))
      .add(new THREE.Vector3(0, 0.1 + aim * 0.06, 0));

    const desired = pivot.clone()
      .addScaledVector(forward, -dist)
      .addScaledVector(right, shoulder);

    // camera collision against the world
    const offset = desired.clone().sub(pivot);
    const len = offset.length();
    offset.normalize();
    const hit = this.map.raycastObstacles(pivot, offset, len);
    if (hit < len - 0.1){
      desired.copy(pivot).addScaledVector(offset, Math.max(1.45, hit - 0.22));
    }
    desired.y = Math.max(desired.y, 0.42);

    // spring smoothing
    const posLerp = this.initialized ? 1 - Math.pow(0.001, dt) : 1;
    const lookLerp = this.initialized ? 1 - Math.pow(0.0005, dt) : 1;
    this.smoothPos.lerp(desired, posLerp * 0.85);
    if (!this.initialized) this.smoothPos.copy(desired);

    this.lookTarget.copy(pivot)
      .addScaledVector(forward, 14)
      .addScaledVector(right, shoulder * (0.3 + 0.7 * aim));
    // additive recoil
    this.recoilPitch *= Math.max(0, 1 - dt * 8);
    this.recoilYaw *= Math.max(0, 1 - dt * 8);
    this.lookTarget.y += this.recoilPitch * 1.3;
    this.lookTarget.addScaledVector(right, this.recoilYaw * 1.2);

    if (!this.initialized) this.smoothLook.copy(this.lookTarget);
    else this.smoothLook.lerp(this.lookTarget, lookLerp);

    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.35);
    const shake = this.trauma * this.trauma;
    const t = time * 34;
    this.shakeOffset.set(
      (Math.sin(t * 1.1) + Math.sin(t * 2.7) * 0.4) * 0.12,
      (Math.cos(t * 1.7) + Math.sin(t * 3.1) * 0.35) * 0.09,
      Math.sin(t * 2.3) * 0.05
    ).multiplyScalar(shake);

    this.camera.position.copy(this.smoothPos).add(this.shakeOffset);
    this.camera.up.set(
      Math.sin(t * 0.9) * 0.03 * shake,
      1,
      0
    );
    this.camera.lookAt(this.smoothLook.clone().add(this.shakeOffset.clone().multiplyScalar(0.4)));

    // fov
    const targetFov = THREE.MathUtils.lerp(this.baseFov, this.aimFov, aim) + moving * 1.8 + this.fovKick;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.pow(0.002, dt));
    this.camera.updateProjectionMatrix();
    this.fovKick *= Math.max(0, 1 - dt * 6);

    this.initialized = true;
    return this.camera;
  }

  /** cinematic orbit while the player is bubbled */
  updateBubble(dt, center, time){
    this.time = time;
    this.bubbleAngle += dt * 0.32;
    const r = 4.1;
    const desired = new THREE.Vector3(
      center.x + Math.cos(this.bubbleAngle) * r,
      center.y + 2.25 + Math.sin(time * 0.6) * 0.22,
      center.z + Math.sin(this.bubbleAngle) * r
    );
    const posLerp = 1 - Math.pow(0.002, dt);
    this.smoothPos.lerp(desired, posLerp);
    const look = new THREE.Vector3(center.x, center.y + 1.0, center.z);
    this.smoothLook.lerp(look, posLerp);
    this.camera.position.copy(this.smoothPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.smoothLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 62, 1 - Math.pow(0.005, dt));
    this.camera.updateProjectionMatrix();
    this.initialized = true;
  }

  /** direct control for menu / intro shots */
  setShot(position, lookAt, dt = 1, snap = false, fov = 70){
    if (snap) this.initialized = false;
    const posLerp = snap ? 1 : 1 - Math.pow(0.015, dt);
    this.smoothPos.lerp(position, posLerp);
    this.smoothLook.lerp(lookAt, posLerp);
    this.camera.position.copy(this.smoothPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.smoothLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, snap ? 1 : 1 - Math.pow(0.05, dt));
    this.camera.updateProjectionMatrix();
  }

  getAimRay(ray = new THREE.Ray()){
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    ray.origin.copy(this.camera.position);
    ray.direction.copy(dir);
    return ray;
  }

  reset(focus){
    this.initialized = false;
    this.trauma = 0;
    this.yaw = 0;
    this.pitch = 0.02;
  }

  /** aim point at a fixed distance for convergence */
  getAimPoint(distance = 55, target = new THREE.Vector3()){
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return target.copy(this.camera.position).addScaledVector(dir, distance);
  }
}
