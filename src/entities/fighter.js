import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ============================================================
   FIGHTER — realistic rigged human with a water rifle.
   Keeps the gameplay-facing API of the previous procedural unit,
   but swaps the cartoon body for a scanned/rigged glTF soldier.
   ============================================================ */

/* Shared blue-squad palette: player and ally are deliberately identical in
   cloth / skin / hair / halo colour. Individuality comes from gear and build.
   Everyone else gets a distinct silhouette + palette. */
const SKINS = {
  player: { model: 'vanguard', tint: 0x2b7d8c, accent: 0x63e6ff, label: 'ECHO',
            top: 0x1e8a99, bottom: 0x1a2026, hair: 0xa8b8bd, body: 0xe8c9ae,
            gear: ['headset', 'pauldron', 'holster'], build: 1.0 },
  ally:   { model: 'vanguard', tint: 0x2b7d8c, accent: 0x63e6ff, label: 'NOVA',
            top: 0x1e8a99, bottom: 0x1a2026, hair: 0xa8b8bd, body: 0xe8c9ae,
            gear: ['cap', 'vest'], build: 0.975 },
  red:    { model: 'vanguard', tint: 0x8a3232, accent: 0xff8674, label: 'HOSTILE',
            gear: ['vest', 'pauldron'] },
  orange: { model: 'remy',     tint: 0x9a5618, accent: 0xffb35c, label: 'RAIDER',
            top: 0x7a3f1c, bottom: 0x2a2620, hair: 0x221812, body: 0xd9b48f,
            gear: ['cap', 'vest'], build: 0.96 },
  purple: { model: 'remy',     tint: 0x513a7a, accent: 0xc98cff, label: 'SPECTRE',
            gear: ['vest', 'holster'], build: 1.02 },
  teal:   { model: 'eve',      tint: 0x3f8f9e, accent: 0x64e0e6, label: 'DIVER',
            gear: ['headset', 'vest'], build: 0.965 },
  sunny:  { model: 'remy',     tint: 0x8a6a1e, accent: 0xffd76a, label: 'SUNSTRIKE',
            top: 0x6a531f, bottom: 0x2c2a24, hair: 0x2a1a12, body: 0xe0b892,
            gear: ['cap', 'vest'], build: 0.985 },
  mint:   { model: 'eve',      tint: 0x4fae8c, accent: 0x9cffcf, label: 'MINT',
            gear: ['mask', 'vest'], build: 0.99 },
  berry:  { model: 'remy',     tint: 0x6e2a4d, accent: 0xff9ccb, label: 'BERRY',
            top: 0x4f1c36, bottom: 0x241a20, hair: 0x16100d, body: 0xcfa27d,
            gear: ['hood', 'holster'], build: 0.945 },
  rocky:  { model: 'vanguard', tint: 0x3d4650, accent: 0xa8c8e8, label: 'ROCK',
            top: 0x2a3138, bottom: 0x1c2126, hair: 0x1a1512, body: 0xd9b48f,
            gear: ['vest', 'pauldron'], build: 1.065 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

/* Mixamo rigs come in three flavours: mixamorigBone, mixamorig:Bone and the
   Ready Player Me prefix-less Bone. Normalise all of them to mixamorigBone. */
function normBone(name){
  let n = name.replace(/mixamorig[:_]/g, 'mixamorig');
  if (!n.startsWith('mixamorig')) n = 'mixamorig' + n;
  return n;
}

/* Retarget a Mixamo clip onto another Mixamo-compatible rig: every bone
   rotation is expressed as a delta from the source bind pose and applied on
   top of the destination bind pose. Translation tracks are dropped so the
   receiving hips keep their own proportions. */
function retargetClip(clip, srcBind, dstBind, dstNames, srcPos, dstPos){
  const out = clip.clone();
  const tracks = [];
  for (const track of clip.tracks){
    const suffix = track.name.endsWith('.quaternion') ? '.quaternion' : (track.name.endsWith('.position') ? '.position' : null);
    if (!suffix) continue;
    const boneName = normBone(track.name.slice(0, -suffix.length));
    const outName = (dstNames && dstNames.get(boneName)) || boneName;
    if (suffix === '.position'){
      // only the hips carry locomotion/height; keep the destination rest pose
      // as the anchor and apply the source motion as a delta
      if (boneName !== 'mixamorigHips' || !srcPos || !dstPos) continue;
      const s = srcPos.get(boneName);
      const d = dstPos.get(boneName);
      if (!s || !d) continue;
      const v = track.values;
      const nv = new Float32Array(v.length);
      for (let i = 0; i < v.length; i += 3){
        // Locomotion clips have baked root motion (up to +3.6m forward). The
        // actor group already moves via gameplay velocity, so keep only the
        // vertical bob and pin the hips to the destination rest position.
        nv[i] = d.x;
        nv[i + 1] = d.y + (v[i + 1] - s.y);
        nv[i + 2] = d.z;
      }
      tracks.push(new THREE.VectorKeyframeTrack(outName + '.position', Array.from(track.times), Array.from(nv)));
      continue;
    }
    const sb = srcBind.get(boneName);
    const db = dstBind.get(boneName);
    if (!sb || !db) continue;
    const inv = sb.clone().invert();
    const v = track.values;
    const nv = new Float32Array(v.length);
    const sq = new THREE.Quaternion();
    const dq = new THREE.Quaternion();
    for (let i = 0; i < v.length; i += 4){
      sq.set(v[i], v[i + 1], v[i + 2], v[i + 3]);
      dq.copy(inv).multiply(sq);      // delta in source bind space
      dq.premultiply(db);             // apply on destination bind
      nv[i] = dq.x; nv[i + 1] = dq.y; nv[i + 2] = dq.z; nv[i + 3] = dq.w;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(outName + '.quaternion', Array.from(track.times), Array.from(nv)));
  }
  out.tracks = tracks;
  return out;
}

function bindMap(scene){
  const map = new Map();
  scene.traverse((o) => {
    if (o.isBone) map.set(normBone(o.name), o.quaternion.clone());
  });
  return map;
}

const IDENT_Q = new THREE.Quaternion();

/* Build a node graph (including non-bone parents such as Armature nodes) with
   bind-pose local + world rotations. Needed for a world-space retarget that
   survives rigs whose bone rolls differ from Mixamo's T-pose (Soldier / RPM). */
function buildBoneGraph(root){
  const recs = [];
  const byObj = new Map();
  root.traverse((o) => {
    const rec = {
      node: o,
      name: o.name || '',
      norm: o.name ? normBone(o.name) : 'anon_' + recs.length,
      isBone: !!o.isBone,
      parent: null,
      children: [],
      bindLocal: o.quaternion.clone(),
      bindWorld: new THREE.Quaternion(),
      srcWorld: new THREE.Quaternion(),
      dstWorld: new THREE.Quaternion(),
    };
    recs.push(rec);
    byObj.set(o, rec);
  });
  for (const rec of recs){
    let p = rec.node.parent;
    while (p){
      const pr = byObj.get(p);
      if (pr){ rec.parent = pr; pr.children.push(rec); break; }
      p = p.parent;
    }
  }
  const byNorm = new Map();
  for (const rec of recs){
    if (rec.node.name && !byNorm.has(rec.norm)) byNorm.set(rec.norm, rec);
  }
  const order = [];
  const rootRec = byObj.get(root);
  const visit = (rec) => {
    rec.bindWorld.copy(rec.parent ? rec.parent.bindWorld : IDENT_Q).multiply(rec.bindLocal);
    order.push(rec);
    for (const c of rec.children) visit(c);
  };
  if (rootRec) visit(rootRec);
  return { order, byNorm, root: rootRec };
}

/* World-space retarget: dstWorld(t) = srcWorld(t) * inv(srcBindWorld) * dstBindWorld.
   This keeps limbs attached for rigs (Soldier / RPM) whose local bone axes are
   not the same as the Mixamo source clips. Sampled at 30 Hz into a fresh clip. */
function retargetClipWorld(clip, srcGraph, dstGraph, srcPos, dstPos){
  const duration = Math.max(0.001, clip.duration || 0.001);
  const fps = 30;
  const count = Math.max(2, Math.ceil(duration * fps) + 1);
  const times = new Array(count);
  for (let i = 0; i < count; i++) times[i] = Math.min(duration, i / fps);
  times[count - 1] = duration;

  const interp = new Map();
  for (const tr of clip.tracks){
    if (!tr.name.endsWith('.quaternion')) continue;
    const norm = normBone(tr.name.slice(0, -'.quaternion'.length));
    try { interp.set(norm, tr.createInterpolant()); } catch (e){ /* ignore */ }
  }
  const hipsTrack = clip.tracks.find(tr => tr.name.endsWith('.position') && /Hips/i.test(tr.name));
  const hipsInterp = hipsTrack ? hipsTrack.createInterpolant() : null;

  const dstBones = dstGraph.order.filter(r => r.isBone);
  const arrays = new Map();
  for (const rec of dstBones) arrays.set(rec, new Float32Array(count * 4));

  const q = new THREE.Quaternion();
  const inv = new THREE.Quaternion();
  const tq = new THREE.Quaternion();

  for (let i = 0; i < count; i++){
    const t = times[i];
    for (const rec of srcGraph.order){
      const it = interp.get(rec.norm);
      if (it){
        const v = it.evaluate(t);
        q.set(v[0], v[1], v[2], v[3]);
      } else {
        q.copy(rec.bindLocal);
      }
      rec.srcWorld.copy(rec.parent ? rec.parent.srcWorld : IDENT_Q).multiply(q);
    }
    for (const rec of dstGraph.order){
      const srec = srcGraph.byNorm.get(rec.norm);
      const parentW = rec.parent ? rec.parent.dstWorld : IDENT_Q;
      if (srec && rec.isBone){
        inv.copy(srec.bindWorld).invert();
        tq.copy(srec.srcWorld).multiply(inv).multiply(rec.bindWorld);
        q.copy(parentW).invert().multiply(tq);
      } else {
        q.copy(rec.bindLocal);
      }
      rec.dstWorld.copy(parentW).multiply(q);
      if (rec.isBone){
        const arr = arrays.get(rec);
        arr[i * 4] = q.x; arr[i * 4 + 1] = q.y; arr[i * 4 + 2] = q.z; arr[i * 4 + 3] = q.w;
      }
    }
  }

  const tracks = [];
  for (const [rec, arr] of arrays){
    tracks.push(new THREE.QuaternionKeyframeTrack(rec.node.name + '.quaternion', times, arr));
  }
  const dstHips = dstGraph.byNorm.get('mixamorigHips');
  if (hipsInterp && dstHips && dstHips.isBone && srcPos && dstPos){
    const s = srcPos.get('mixamorigHips');
    const d = dstPos.get('mixamorigHips');
    if (s && d){
      const vals = new Float32Array(count * 3);
      for (let i = 0; i < count; i++){
        const v = hipsInterp.evaluate(times[i]);
        vals[i * 3] = d.x;
        vals[i * 3 + 1] = d.y + (v[1] - s.y);
        vals[i * 3 + 2] = d.z;
      }
      tracks.push(new THREE.VectorKeyframeTrack(dstHips.node.name + '.position', times, vals));
    }
  }
  return new THREE.AnimationClip(clip.name, duration, tracks);
}

function boneNames(scene){
  const map = new Map();
  scene.traverse((o) => {
    if (o.isBone) map.set(normBone(o.name), o.name);
  });
  return map;
}

function posMap(scene){
  const map = new Map();
  scene.traverse((o) => {
    if (o.isBone) map.set(normBone(o.name), o.position.clone());
  });
  return map;
}

function boneOf(root, name){
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    if (normBone(o.name) === name) found = o;
  });
  return found;
}

export class Fighter {
  constructor(assets, opts = {}){
    this.assets = assets;
    this.kind = opts.kind || 'red';
    this.skin = SKINS[this.kind] || SKINS.red;
    this.isPlayer = opts.isPlayer != null ? !!opts.isPlayer : this.kind === 'player';
    this.name = opts.name || 'OPERATOR';
    this.scale = (opts.scale || 1) * (this.skin.build || 1);
    this.team = opts.team || (this.kind === 'player' || this.kind === 'ally' ? 'blue' : 'red');

    this.group = new THREE.Group();
    this.group.name = 'Fighter_' + this.name;
    this.root = new THREE.Group();
    this.root.scale.setScalar(this.scale);
    this.group.add(this.root);

    this.wetness = 0;
    this.bubbled = false;
    this.bubbleT = 0;
    this.bubbleScale = 0;
    this.bubbleInflate = 0;
    this.moveSpeed = 0;
    this.aimBlend = 0;
    this.aimHold = false;
    this.aimTrack = false;
    this.state = 'idle';
    this.time = 0;
    this.recoil = 0;
    this.fireLock = 0;
    this.hitFlash = 0;
    this.cheer = false;
    this.grounded = true;
    this.wetMats = [];
    this.modelMats = [];
    this._wetApplied = -1;

    this.buildModel();
    this.buildGear();
    this.buildWeapon();
    this.buildBubble();
    this.buildShadow();

    this.hitSpheres = [
      { y: 1.62, r: 0.2 },
      { y: 1.2, r: 0.3 },
      { y: 0.82, r: 0.27 },
    ];
  }

  /* ---------------- body ---------------- */
  buildModel(){
    const src = this.assets.characterModels && this.assets.characterModels[this.skin.model];
    this.mixer = null;
    this.actions = {};

    if (!src){
      this.buildFallback();
      return;
    }

    const body = skeletonClone(src.scene);
    // Skinned bind-space bounds are unreliable: measure the skeleton instead
    // and normalise every rig to 1.8 m with feet on the origin.
    body.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let minY = Infinity, maxY = -Infinity;
    body.traverse((o) => {
      if (!o.isBone) return;
      o.getWorldPosition(v);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    });
    const boneH = maxY - minY;
    if (Number.isFinite(boneH) && boneH > 0.8){
      const k = 1.8 / boneH;
      body.scale.multiplyScalar(k);
      body.position.y -= minY * body.scale.y;
    }
    // Some rigs (Soldier.glb) face -Z in their native bind pose. Store the
    // correction so respawn/reset keeps exactly the same facing instead of
    // silently flipping the operator 180° after the first death.
    this.bodyFlip = src.flip || 0;
    if (this.bodyFlip){
      body.rotation.y += this.bodyFlip;
    }

    body.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh){
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = mats.map((m) => {
          const cm = m.clone();
          const n = (m.name || '') + ' ' + (o.name || '');
          const s = this.skin;
          if (/hair|headwear/i.test(n) && s.hair != null){
            cm.color && cm.color.setHex(s.hair);
          } else if (/top|shirt|jacket|cloth/i.test(n) && s.top != null){
            cm.color && cm.color.setHex(s.top);
          } else if (/bottom|pant|short|jean|leg/i.test(n) && s.bottom != null){
            cm.color && cm.color.setHex(s.bottom);
          } else if (/body|skin/i.test(n) && s.body != null){
            cm.color && cm.color.lerp(new THREE.Color(s.body), 0.16);
          } else if (cm.color){
            // subtle team tint so squads read apart without breaking realism
            cm.color.lerp(new THREE.Color(this.skin.tint), 0.16);
          }
          cm.roughness = Math.min(1, (cm.roughness ?? 0.8));
          cm.envMapIntensity = 1.1;
          this.modelMats.push(cm);
          this.wetMats.push({ mat: cm, base: cm.color ? cm.color.clone() : null, baseRough: cm.roughness ?? 0.8 });
          return cm;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      }
      if (o.isBone){
        const bn = normBone(o.name);
        if (bn === 'mixamorigRightHand') this.handBone = o;
        if (bn === 'mixamorigLeftHand') this.leftHandBone = o;
      }
      if (/weapon|rifle|gun/i.test(o.name)) o.visible = false; // hide any baked-in prop
    });

    this.body = body;
    this.bodyBaseY = body.position.y;
    this.root.add(body);

    this.mixer = new THREE.AnimationMixer(body);
    const lib = this.assets.motionClips;
    const mk = (clip, loop = THREE.LoopRepeat) => {
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      a.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
      a.clampWhenFinished = loop === THREE.LoopOnce;
      return a;
    };

    if (lib && lib.rifleIdle && lib.rifleWalk && lib.rifleRun){
      // shared Mixamo rifle set retargeted onto this rig in world space
      const dstGraph = buildBoneGraph(body);
      const dstPos = posMap(body);
      const graphs = this.assets._srcGraphs || (this.assets._srcGraphs = {});
      const rt = (entry, key) => {
        if (!entry) return null;
        let sg = graphs[key];
        if (!sg){
          if (entry.scene){ sg = buildBoneGraph(entry.scene); graphs[key] = sg; }
          else return retargetClip(entry.clip, entry.bind, bindMap(body), boneNames(body), entry.posBind, dstPos);
        }
        return retargetClipWorld(entry.clip, sg, dstGraph, entry.posBind, dstPos);
      };
      this.actions.idle = mk(rt(lib.rifleIdle, 'idle'));
      this.actions.walk = mk(rt(lib.rifleWalk, 'walk'));
      this.actions.run = mk(rt(lib.rifleRun, 'run'));
      this.actions.aim = mk(rt(lib.shoot, 'shoot'));
      this.actions.fire = mk(rt(lib.shoot, 'shoot'), THREE.LoopOnce);
      this.actions.punch = mk(rt(lib.punch, 'punch'), THREE.LoopOnce);
      this.actions.death = mk(rt(lib.death, 'death'), THREE.LoopOnce);
    } else {
      let clips = src.animations || [];
      const hasLocomotion = clips.some((c) => /walk|run/i.test(c.name));
      let aimClip = null;
      if (!hasLocomotion){
        // Civilian rigs (Remy) only ship an aiming loop. Keep that upper-body
        // firing stance and graft retargeted leg motion underneath it.
        const donor = this.assets.characterModels.vanguard;
        if (donor && donor.animations){
          const srcBind = bindMap(donor.scene);
          const dstBind = bindMap(body);
          const dstNames = boneNames(body);
          const retargeted = donor.animations.map((c) => retargetClip(c, srcBind, dstBind, dstNames));
          aimClip = clips[0] || null;
          if (aimClip){
            aimClip = aimClip.clone();
            aimClip.name = 'AimIdle';
            // the civilian rig bakes a large hip translation into the loop; drop
            // it so the body stays centred on the actor origin (collision + tank)
            aimClip.tracks = aimClip.tracks.filter((t) => !t.name.endsWith('.position'));
            const aimMap = new Map(aimClip.tracks.map((t) => [t.name, t]));
            const lower = /(Hips|UpLeg|Leg|Foot|ToeBase)/;
            for (const c of retargeted){
              c.tracks = c.tracks.map((t) => {
                const bone = t.name.replace(/\.quaternion$/, '');
                if (lower.test(bone)) return t;
                const at = aimMap.get(t.name);
                if (!at) return t;
                const q = at.values.slice(0, 4);
                return new THREE.QuaternionKeyframeTrack(t.name, [0, 1], [...q, ...q]);
              });
            }
            clips = [aimClip, ...retargeted];
          } else {
            clips = retargeted;
          }
        }
      }
      const pick = (re) => clips.find((c) => re.test(c.name));
      this.actions.idle = mk(aimClip || pick(/idle/i) || clips[0]);
      this.actions.walk = mk(pick(/walk/i));
      this.actions.run = mk(pick(/run/i));
      this.actions.fire = mk(pick(/fire|shoot/i), THREE.LoopOnce);
      this.actions.death = mk(pick(/death|die/i), THREE.LoopOnce);
    }

    if (this.actions.idle){
      this.actions.idle.play();
      this.current = this.actions.idle;
    }
  }

  buildFallback(){
    const suit = new THREE.MeshStandardMaterial({ color: this.skin.tint, roughness: 0.62, metalness: 0.08 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c2127, roughness: 0.55, metalness: 0.35 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.52, 6, 12), suit);
    torso.position.y = 1.16; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), dark);
    head.position.y = 1.62; head.castShadow = true;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 5, 10), dark);
    legs.position.y = 0.55; legs.castShadow = true;
    this.root.add(torso, head, legs);
    this.modelMats.push(suit, dark);
    this.wetMats.push({ mat: suit, base: suit.color.clone(), baseRough: 0.62 });
  }

  /* ---------------- tactical gear ----------------
     Small procedural accessories give every operator a distinct silhouette.
     They are parented to the actual skeleton bones, so they follow idle,
     walk, run and death animations instead of floating in world space. */
  buildGear(){
    const list = this.skin.gear;
    if (!list || !list.length || !this.body) return;
    const dark = new THREE.MeshStandardMaterial({ color: 0x161c21, roughness: 0.58, metalness: 0.38 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0d1114, roughness: 0.92, metalness: 0.04 });
    const cloth = new THREE.MeshStandardMaterial({ color: this.skin.top ?? 0x27303a, roughness: 0.9, metalness: 0.02 });
    const accent = new THREE.MeshStandardMaterial({
      color: this.skin.accent, roughness: 0.32, metalness: 0.55,
      emissive: this.skin.accent, emissiveIntensity: 0.55,
    });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6b767f, roughness: 0.36, metalness: 0.9 });
    this.gearMats = [dark, rubber, cloth, accent, steel];

    this.body.updateMatrixWorld(true);
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(-1, 0, 0).applyQuaternion(rootQ);
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ);

    const attach = (bone, obj, worldPos, worldQuat = rootQ) => {
      if (!bone) return;
      obj.position.copy(worldPos);
      obj.quaternion.copy(worldQuat);
      obj.updateMatrixWorld(true);
      bone.attach(obj);
    };

    const head = boneOf(this.body, 'mixamorigHead');
    if (head && (list.includes('helmet') || list.includes('cap') || list.includes('headset') || list.includes('mask') || list.includes('hood'))){
      const hp = head.getWorldPosition(new THREE.Vector3());
      const g = new THREE.Group();
      if (list.includes('mask')){
        const hoodMask = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 14), dark);
        hoodMask.scale.set(1.02, 1.06, 1.02);
        hoodMask.position.y = 0.035;
        g.add(hoodMask);
        const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.052, 0.028), dark);
        goggles.position.set(0, 0.06, 0.105);
        goggles.rotation.x = 0.12;
        g.add(goggles);
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.032, 0.006), accent);
        lens.position.set(0, 0.06, 0.122);
        lens.rotation.x = 0.12;
        g.add(lens);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.011, 6, 20), rubber);
        strap.rotation.x = Math.PI / 2;
        strap.rotation.z = 0.06;
        strap.position.y = 0.062;
        g.add(strap);
        const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 10), steel);
        filter.rotation.x = Math.PI / 2;
        filter.position.set(0.06, -0.012, 0.11);
        g.add(filter);
        const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 18), cloth);
        cowl.rotation.x = Math.PI / 2;
        cowl.position.y = -0.06;
        g.add(cowl);
      } else if (list.includes('hood')){
        const hood = new THREE.Mesh(new THREE.SphereGeometry(0.148, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.66), cloth);
        hood.scale.set(1.04, 1.0, 1.12);
        hood.position.set(0, 0.055, -0.018);
        hood.castShadow = true;
        g.add(hood);
        const peak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.12, 8, 1, true), cloth);
        peak.rotation.x = 0.6;
        peak.position.set(0, 0.14, 0.06);
        g.add(peak);
        const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.102, 0.03, 8, 18), cloth);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = -0.055;
        g.add(scarf);
        const mask = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.02), rubber);
        mask.position.set(0, -0.01, 0.108);
        g.add(mask);
      } else if (list.includes('helmet')){
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), dark);
        dome.scale.set(1, 0.92, 1.08);
        dome.position.y = 0.105;
        dome.castShadow = true;
        g.add(dome);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.117, 0.012, 8, 24), dark);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.094;
        g.add(rim);
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.014, 0.07), dark);
        brim.position.set(0, 0.088, 0.112);
        brim.rotation.x = 0.18;
        g.add(brim);
        for (const sx of [-1, 1]){
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.024, 0.085), steel);
          rail.position.set(sx * 0.106, 0.122, 0.005);
          g.add(rail);
        }
        const nvg = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.026, 0.04), dark);
        nvg.position.set(0, 0.152, 0.104);
        g.add(nvg);
        const dot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), accent);
        dot.position.set(0, 0.152, 0.126);
        g.add(dot);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.007, 0.17), accent);
        stripe.position.set(0, 0.196, -0.012);
        g.add(stripe);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.045), rubber);
        strap.position.set(-0.105, -0.012, -0.025);
        strap.rotation.z = 0.18;
        g.add(strap);
      } else if (list.includes('cap')){
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), cloth);
        dome.scale.set(1, 0.84, 1.06);
        dome.position.y = 0.105;
        dome.castShadow = true;
        g.add(dome);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.013, 0.105), cloth);
        visor.position.set(0, 0.093, 0.12);
        visor.rotation.x = 0.2;
        g.add(visor);
        const badge = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.011, 0.004), accent);
        badge.position.set(0, 0.132, 0.115);
        badge.rotation.x = 0.35;
        g.add(badge);
      } else {
        // headset / tactical comms
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.01, 6, 22, Math.PI), dark);
        band.position.y = 0.02;
        g.add(band);
        for (const sx of [-1, 1]){
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.028, 14), dark);
          cup.rotation.z = Math.PI / 2;
          cup.position.set(sx * 0.118, 0.02, 0.004);
          g.add(cup);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.0045, 6, 16), accent);
          ring.rotation.y = Math.PI / 2;
          ring.position.set(sx * 0.132, 0.02, 0.004);
          g.add(ring);
        }
        const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.1, 6), rubber);
        boom.position.set(-0.1, -0.02, 0.05);
        boom.rotation.set(0.55, 0, 0.5);
        g.add(boom);
        const mic = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), accent);
        mic.position.set(-0.138, -0.048, 0.094);
        g.add(mic);
      }
      attach(head, g, hp.clone().setY(hp.y + 0.005));
    }

    const spine = boneOf(this.body, 'mixamorigSpine2');
    if (spine && list.includes('vest')){
      const sp = spine.getWorldPosition(new THREE.Vector3());
      // Measure the actual shoulder span so the plate hugs this rig instead of
      // floating in front of slim avatars (Ready Player Me bodies are much
      // narrower than the Mixamo soldier the plate size was tuned for).
      let span = 0.34;
      const la = boneOf(this.body, 'mixamorigLeftArm');
      const ra = boneOf(this.body, 'mixamorigRightArm');
      if (la && ra){
        const a = la.getWorldPosition(new THREE.Vector3());
        const b = ra.getWorldPosition(new THREE.Vector3());
        span = Math.max(0.26, Math.min(0.4, a.distanceTo(b)));
      }
      const chestW = span * 0.8;
      const chestH = 0.25 * (span / 0.34);
      const chestD = 0.075;
      const shell = new THREE.MeshStandardMaterial({
        color: new THREE.Color(this.skin.top ?? 0x27303a).multiplyScalar(0.62),
        roughness: 0.88, metalness: 0.04,
      });
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(chestW, chestH, chestD), shell);
      plate.position.y = 0.02;
      plate.castShadow = true;
      g.add(plate);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.84, chestH * 0.76, 0.018), dark);
      cover.position.set(0, 0.02, chestD * 0.5 + 0.001);
      g.add(cover);
      for (const [px, py, w] of [[-chestW * 0.25, -0.052, chestW * 0.2], [0, -0.052, chestW * 0.19], [chestW * 0.25, -0.052, chestW * 0.2]]){
        const pouch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.072, 0.038), shell);
        pouch.position.set(px, py, chestD * 0.5 + 0.024);
        g.add(pouch);
        const flap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, 0.02, 0.04), dark);
        flap.position.set(px, py + 0.029, chestD * 0.5 + 0.026);
        g.add(flap);
      }
      const velcro = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.24, 0.024, 0.006), accent);
      velcro.position.set(0, chestH * 0.36, chestD * 0.5 + 0.01);
      g.add(velcro);
      for (const sx of [-1, 1]){
        const strap = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.12, chestH * 0.8, 0.016), dark);
        strap.position.set(sx * chestW * 0.4, chestH * 0.34, -0.01);
        strap.rotation.z = sx * 0.1;
        g.add(strap);
      }
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 6), rubber);
      tube.position.set(chestW * 0.34, -0.02, -chestD * 0.5 - 0.016);
      tube.rotation.z = 0.35;
      g.add(tube);
      attach(spine, g, sp.clone().addScaledVector(forward, 0.055), rootQ);
    }

    const arm = boneOf(this.body, 'mixamorigRightArm');
    if (arm && list.includes('pauldron')){
      const ap = arm.getWorldPosition(new THREE.Vector3());
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), dark);
      plate.scale.set(1.0, 0.7, 1.12);
      plate.castShadow = true;
      g.add(plate);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.007, 6, 16), accent);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 0.008;
      g.add(edge);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.016, 0.09), cloth);
      pad.position.set(0, 0.04, 0);
      g.add(pad);
      attach(arm, g, ap.clone().setY(ap.y + 0.035), rootQ);
    }

    const leg = boneOf(this.body, 'mixamorigRightUpLeg');
    if (leg && list.includes('holster')){
      const lp = leg.getWorldPosition(new THREE.Vector3());
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.17, 0.075), dark);
      g.add(shell);
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.084), rubber);
      strap.position.y = 0.07;
      g.add(strap);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.06, 0.03), steel);
      grip.position.set(0, 0.105, -0.012);
      grip.rotation.x = -0.3;
      g.add(grip);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.004), accent);
      led.position.set(0.032, -0.05, 0.038);
      g.add(led);
      attach(leg, g, lp.clone().addScaledVector(right, 0.11).addScaledVector(forward, 0.02).setY(lp.y - 0.14), rootQ);
    }
  }

  /* ---------------- water weapons ---------------- */
  buildWeapon(){
    const gm = this.assets.gunMaps || {};
    const worn = gm.worn || null;
    const polymer = gm.polymer || null;
    const camo = gm.camo || null;
    const matMetal = new THREE.MeshStandardMaterial({
      color: 0x2b3239, roughness: 0.52, metalness: 0.95,
      roughnessMap: worn, bumpMap: worn, bumpScale: 0.0035,
    });
    const matDark = new THREE.MeshStandardMaterial({
      color: 0x121619, roughness: 0.62, metalness: 0.72,
      roughnessMap: worn, bumpMap: worn, bumpScale: 0.0025,
    });
    const matPoly = new THREE.MeshStandardMaterial({
      color: 0x1c2227, roughness: 0.86, metalness: 0.04,
      bumpMap: polymer, bumpScale: 0.004,
    });
    const matTan = new THREE.MeshStandardMaterial({
      color: 0x6b5b41, roughness: 0.84, metalness: 0.04,
      map: camo, bumpMap: polymer, bumpScale: 0.0035,
    });
    const matSteel = new THREE.MeshStandardMaterial({
      color: 0xa9b3ba, roughness: 0.28, metalness: 0.98,
      roughnessMap: worn, bumpMap: worn, bumpScale: 0.002,
    });
    const matAccent = new THREE.MeshStandardMaterial({
      color: 0x8a4a24, roughness: 0.62, metalness: 0.25,
    });
    const matWater = new THREE.MeshStandardMaterial({
      color: 0x4a4a3e, roughness: 0.72, metalness: 0.35,
    });
    const matGlass = new THREE.MeshStandardMaterial({
      color: 0x33352e, roughness: 0.55, metalness: 0.55,
    });
    const matRubber = new THREE.MeshStandardMaterial({ color: 0x0b0d0f, roughness: 0.97, metalness: 0.02 });
    const matBrass = new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.26, metalness: 0.92 });
    const matLens = new THREE.MeshStandardMaterial({
      color: 0x2a0b08, roughness: 0.03, metalness: 0.55,
      emissive: 0xff4a2a, emissiveIntensity: 1.2,
    });
    this.weaponMats = [matMetal, matDark, matPoly, matTan, matSteel, matAccent, matWater, matGlass, matRubber, matBrass, matLens];

    const cylZ = (r1, r2, len, seg = 12) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2);
    const bag = () => {
      const map = new Map();
      const put = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
        const m4 = new THREE.Matrix4().compose(
          new THREE.Vector3(p[0], p[1], p[2]),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])),
          new THREE.Vector3(s[0], s[1], s[2])
        );
        geo.applyMatrix4(m4);
        if (!map.has(mat)) map.set(mat, []);
        map.get(mat).push(geo);
      };
      const build = (name, muzzleZ) => {
        const g = new THREE.Group();
        g.name = name;
        for (const [mat, geos] of map){
          const merged = mergeGeometries(geos, false);
          if (!merged) continue;
          const mesh = new THREE.Mesh(merged, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          g.add(mesh);
        }
        const muzzle = new THREE.Object3D();
        muzzle.position.set(0, 0.03, muzzleZ);
        g.add(muzzle);
        const flash = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        flash.position.set(0, 0.03, muzzleZ + 0.1);
        flash.rotation.x = Math.PI / 2;
        g.add(flash);
        g.userData = { muzzle, flash, muzzleZ };
        return g;
      };
      return { put, build };
    };
    const rail = (b, z0, z1, y) => {
      b.put(new THREE.BoxGeometry(0.03, 0.012, z1 - z0), matDark, [0, y, (z0 + z1) / 2]);
      for (let z = z0 + 0.012; z < z1; z += 0.024){
        b.put(new THREE.BoxGeometry(0.034, 0.008, 0.012), matMetal, [0, y + 0.008, z]);
      }
    };
    const screws = (b, y, z) => {
      for (const x of [-0.026, 0.026]) b.put(cylZ(0.005, 0.005, 0.012, 6), matSteel, [x, y, z]);
    };

    /* ---------- HYDRA-7 assault rifle ---------- */
    const r = bag();
    r.put(new THREE.BoxGeometry(0.062, 0.084, 0.34), matMetal, [0, 0.03, 0.06]);
    r.put(new THREE.BoxGeometry(0.056, 0.062, 0.2), matDark, [0, -0.02, 0.05]);
    r.put(new THREE.BoxGeometry(0.067, 0.014, 0.33), matMetal, [0, 0.078, 0.06]);
    r.put(new THREE.BoxGeometry(0.005, 0.028, 0.08), matDark, [0.031, 0.036, 0.11]);
    r.put(new THREE.BoxGeometry(0.05, 0.014, 0.032), matSteel, [-0.006, 0.052, 0.2]);
    r.put(new THREE.BoxGeometry(0.03, 0.022, 0.06), matDark, [0.034, 0.048, 0.02]);
    r.put(cylZ(0.041, 0.041, 0.32, 8), matMetal, [0, 0.032, 0.4]);
    for (let i = 0; i < 7; i++){
      r.put(new THREE.BoxGeometry(0.086, 0.007, 0.026), matDark, [0, 0.032, 0.28 + i * 0.04]);
    }
    r.put(cylZ(0.013, 0.013, 0.36, 12), matSteel, [0, 0.032, 0.73]);
    r.put(new THREE.BoxGeometry(0.032, 0.032, 0.05), matDark, [0, 0.052, 0.6]);
    r.put(cylZ(0.008, 0.008, 0.12, 6), matSteel, [0, 0.076, 0.58]);
    r.put(cylZ(0.027, 0.024, 0.095, 12), matDark, [0, 0.032, 0.92]);
    for (let i = 0; i < 3; i++){
      r.put(new THREE.BoxGeometry(0.058, 0.011, 0.014), matAccent, [0, 0.032, 0.89 + i * 0.022]);
    }
    r.put(new THREE.TorusGeometry(0.027, 0.004, 6, 16), matAccent, [0, 0.032, 0.972]);
    r.put(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 10), matSteel, [0, 0.032, 0.55]);
    r.put(new THREE.CylinderGeometry(0.027, 0.027, 0.05, 10), matDark, [0, 0.032, 0.47]);
    // stock
    r.put(cylZ(0.019, 0.019, 0.18, 10), matMetal, [0, 0.03, -0.16]);
    r.put(new THREE.BoxGeometry(0.05, 0.085, 0.13), matPoly, [0, 0.016, -0.285]);
    r.put(new THREE.BoxGeometry(0.056, 0.075, 0.02), matRubber, [0, 0.016, -0.355]);
    r.put(new THREE.BoxGeometry(0.044, 0.018, 0.1), matPoly, [0, 0.07, -0.26]);
    r.put(new THREE.TorusGeometry(0.022, 0.004, 6, 12), matMetal, [0.036, 0.03, -0.18], [0, Math.PI / 2, 0]);
    // grip + trigger
    r.put(new THREE.BoxGeometry(0.042, 0.12, 0.055), matPoly, [0, -0.1, 0.005], [0.26, 0, 0]);
    for (let i = 0; i < 3; i++){
      r.put(new THREE.BoxGeometry(0.046, 0.008, 0.058), matRubber, [0, -0.132 + i * 0.026, 0.012], [0.26, 0, 0]);
    }
    r.put(new THREE.TorusGeometry(0.032, 0.006, 6, 16, Math.PI), matMetal, [0, -0.055, 0.085], [0, Math.PI / 2, 0]);
    r.put(new THREE.BoxGeometry(0.008, 0.026, 0.008), matAccent, [0, -0.052, 0.072]);
    // water reservoir magazine (glass shell + liquid core + level ticks)
    r.put(new THREE.CylinderGeometry(0.034, 0.04, 0.17, 14), matGlass, [0, -0.125, 0.1]);
    r.put(new THREE.CylinderGeometry(0.029, 0.035, 0.148, 12), matWater, [0, -0.132, 0.1]);
    r.put(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 14), matDark, [0, -0.207, 0.1]);
    r.put(new THREE.CylinderGeometry(0.036, 0.036, 0.014, 14), matBrass, [0, -0.043, 0.1]);
    for (let i = 0; i < 4; i++){
      r.put(new THREE.BoxGeometry(0.052, 0.0035, 0.004), matSteel, [0, -0.09 - i * 0.024, 0.135]);
    }
    r.put(new THREE.CylinderGeometry(0.03, 0.03, 0.19, 12), matGlass, [0, -0.036, 0.42]);
    r.put(new THREE.CylinderGeometry(0.025, 0.025, 0.17, 10), matWater, [0, -0.04, 0.42]);
    r.put(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12), matDark, [0, -0.036, 0.323]);
    r.put(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 12), matDark, [0, -0.036, 0.517]);
    // angled foregrip
    r.put(new THREE.BoxGeometry(0.03, 0.09, 0.048), matPoly, [0, -0.078, 0.35], [-0.36, 0, 0]);
    r.put(new THREE.BoxGeometry(0.034, 0.008, 0.052), matRubber, [0, -0.115, 0.36], [-0.36, 0, 0]);
    for (let i = 0; i < 4; i++){
      r.put(new THREE.BoxGeometry(0.032, 0.005, 0.038), matRubber, [0, -0.062 - i * 0.016, 0.343 + i * 0.006], [-0.36, 0, 0]);
    }
    // optic
    rail(r, -0.08, 0.32, 0.088);
    r.put(new THREE.BoxGeometry(0.028, 0.028, 0.07), matDark, [0, 0.108, 0.05]);
    r.put(cylZ(0.024, 0.024, 0.15, 14), matMetal, [0, 0.128, 0.05]);
    r.put(cylZ(0.031, 0.031, 0.026, 14), matDark, [0, 0.128, 0.126]);
    r.put(cylZ(0.031, 0.031, 0.026, 14), matDark, [0, 0.128, -0.026]);
    r.put(cylZ(0.027, 0.027, 0.004, 14), matLens, [0, 0.128, 0.141]);
    r.put(cylZ(0.027, 0.027, 0.004, 14), matLens, [0, 0.128, -0.039]);
    r.put(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10), matDark, [0, 0.154, 0.05]);
    r.put(new THREE.CylinderGeometry(0.013, 0.013, 0.02, 10), matDark, [0.026, 0.128, 0.05], [0, 0, Math.PI / 2]);
    r.put(new THREE.TorusGeometry(0.028, 0.0025, 5, 18), matAccent, [0, 0.128, 0.138]);
    screws(r, 0.096, 0.02);
    // iron sights
    r.put(new THREE.BoxGeometry(0.006, 0.03, 0.008), matDark, [0, 0.1, -0.04]);
    r.put(new THREE.BoxGeometry(0.006, 0.026, 0.008), matDark, [0, 0.09, 0.64]);
    // receiver hard points: ejection port, dust cover, charging handle, controls
    r.put(new THREE.BoxGeometry(0.004, 0.034, 0.1), matSteel, [0.0325, 0.038, 0.11]);
    r.put(new THREE.BoxGeometry(0.003, 0.026, 0.084), matDark, [0.0345, 0.038, 0.11]);
    r.put(cylZ(0.004, 0.004, 0.11, 6), matBrass, [0.033, 0.061, 0.11]);
    r.put(new THREE.BoxGeometry(0.05, 0.012, 0.03), matDark, [0, 0.086, -0.1]);
    r.put(new THREE.BoxGeometry(0.012, 0.016, 0.05), matSteel, [0.02, 0.09, -0.075]);
    r.put(new THREE.BoxGeometry(0.016, 0.02, 0.016), matSteel, [0.034, 0.058, 0.055]);
    r.put(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 8), matDark, [0.038, 0.044, 0.03], [0, 0, Math.PI / 2]);
    r.put(new THREE.BoxGeometry(0.006, 0.018, 0.03), matSteel, [-0.034, 0.052, 0.03]);
    r.put(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 8), matSteel, [-0.036, 0.036, -0.04], [0, 0, Math.PI / 2]);
    // gas system + barrel nut + handguard M-LOK slots
    r.put(cylZ(0.006, 0.006, 0.26, 6), matSteel, [0, 0.079, 0.55]);
    r.put(cylZ(0.03, 0.03, 0.024, 12), matDark, [0, 0.032, 0.245]);
    for (let i = 0; i < 4; i++){
      r.put(new THREE.BoxGeometry(0.004, 0.02, 0.05), matDark, [0.043, 0.032, 0.32 + i * 0.062]);
      r.put(new THREE.BoxGeometry(0.004, 0.02, 0.05), matDark, [-0.043, 0.032, 0.32 + i * 0.062]);
    }
    // adjustable stock hardware
    r.put(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), matSteel, [0, -0.015, -0.33], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 3; i++){
      r.put(new THREE.BoxGeometry(0.062, 0.005, 0.014), matRubber, [0, -0.02 + i * 0.024, -0.381]);
    }
    r.put(new THREE.BoxGeometry(0.05, 0.006, 0.09), matAccent, [0, 0.093, -0.27]);
    // sling loops, hose clamps, receiver pins
    r.put(new THREE.TorusGeometry(0.014, 0.003, 6, 12), matSteel, [-0.034, 0.012, 0.2], [0, Math.PI / 2, 0]);
    r.put(new THREE.TorusGeometry(0.014, 0.003, 6, 12), matSteel, [0.034, 0.012, -0.24], [0, Math.PI / 2, 0]);
    for (const z of [0.02, 0.16]){
      r.put(new THREE.TorusGeometry(0.01, 0.0025, 6, 10), matRubber, [0.044, -0.012, z], [0, Math.PI / 2, 0]);
    }
    r.put(cylZ(0.005, 0.005, 0.012, 6), matSteel, [0, 0.03, 0.004]);
    r.put(cylZ(0.005, 0.005, 0.012, 6), matSteel, [0, 0.03, 0.2]);
    // optic mount + turret + lens hood
    r.put(new THREE.BoxGeometry(0.03, 0.018, 0.05), matDark, [0, 0.096, 0.05]);
    r.put(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10), matBrass, [0.033, 0.128, 0.05], [0, 0, Math.PI / 2]);
    r.put(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 12), matLens, [0, 0.128, 0.146]);
    const rifle = r.build('HYDRA-7', 0.99);

    /* ---------- HYDRA-S precision sniper ---------- */
    const s = bag();
    s.put(new THREE.BoxGeometry(0.064, 0.09, 0.4), matMetal, [0, 0.03, 0.05]);
    s.put(new THREE.BoxGeometry(0.058, 0.064, 0.24), matDark, [0, -0.02, 0.04]);
    s.put(new THREE.BoxGeometry(0.069, 0.014, 0.4), matMetal, [0, 0.08, 0.05]);
    s.put(new THREE.BoxGeometry(0.005, 0.03, 0.1), matDark, [0.032, 0.036, 0.12]);
    rail(s, -0.12, 0.26, 0.092);
    s.put(cylZ(0.013, 0.013, 0.62, 12), matSteel, [0, 0.034, 0.72]);
    s.put(cylZ(0.019, 0.017, 0.12, 10), matDark, [0, 0.034, 1.06]);
    for (let i = 0; i < 4; i++){
      s.put(new THREE.BoxGeometry(0.034, 0.008, 0.012), matDark, [0, 0.034, 1.02 + i * 0.022]);
    }
    s.put(new THREE.TorusGeometry(0.02, 0.0035, 6, 16), matAccent, [0, 0.034, 1.14]);
    s.put(new THREE.BoxGeometry(0.034, 0.034, 0.06), matDark, [0, 0.056, 0.48]);
    // handguard + chassis
    s.put(cylZ(0.036, 0.036, 0.3, 10), matTan, [0, 0.034, 0.38]);
    for (let i = 0; i < 5; i++){
      s.put(new THREE.BoxGeometry(0.076, 0.007, 0.024), matDark, [0, 0.034, 0.28 + i * 0.05]);
    }
    // bolt handle
    s.put(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), matSteel, [0.05, 0.045, 0.02], [0, 0, Math.PI / 2]);
    s.put(new THREE.SphereGeometry(0.017, 10, 8), matSteel, [0.088, 0.045, 0.02]);
    // stock
    s.put(cylZ(0.022, 0.022, 0.22, 10), matMetal, [0, 0.03, -0.2]);
    s.put(new THREE.BoxGeometry(0.056, 0.11, 0.18), matTan, [0, 0.015, -0.34]);
    s.put(new THREE.BoxGeometry(0.064, 0.095, 0.024), matRubber, [0, 0.015, -0.44]);
    s.put(new THREE.BoxGeometry(0.05, 0.026, 0.14), matTan, [0, 0.09, -0.3]);
    s.put(new THREE.BoxGeometry(0.012, 0.05, 0.12), matDark, [0.03, 0.05, -0.3]);
    s.put(new THREE.TorusGeometry(0.024, 0.004, 6, 12), matMetal, [0.04, 0.03, -0.22], [0, Math.PI / 2, 0]);
    // grip / trigger
    s.put(new THREE.BoxGeometry(0.042, 0.13, 0.06), matPoly, [0, -0.1, 0.005], [0.26, 0, 0]);
    for (let i = 0; i < 3; i++){
      s.put(new THREE.BoxGeometry(0.046, 0.008, 0.062), matRubber, [0, -0.135 + i * 0.026, 0.012], [0.26, 0, 0]);
    }
    s.put(new THREE.TorusGeometry(0.032, 0.006, 6, 16, Math.PI), matMetal, [0, -0.055, 0.085], [0, Math.PI / 2, 0]);
    s.put(new THREE.BoxGeometry(0.008, 0.026, 0.008), matAccent, [0, -0.052, 0.072]);
    // large pressure reservoir (glass shell + liquid core)
    s.put(new THREE.CylinderGeometry(0.05, 0.056, 0.29, 16), matGlass, [0, -0.115, 0.16]);
    s.put(new THREE.CylinderGeometry(0.044, 0.05, 0.26, 14), matWater, [0, -0.122, 0.16]);
    s.put(new THREE.CylinderGeometry(0.058, 0.058, 0.022, 16), matDark, [0, -0.257, 0.16]);
    s.put(new THREE.CylinderGeometry(0.058, 0.058, 0.022, 16), matDark, [0, 0.028, 0.16]);
    s.put(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), matBrass, [0.055, -0.02, 0.16], [0, 0, Math.PI / 2]);
    s.put(new THREE.CylinderGeometry(0.024, 0.024, 0.012, 12), matBrass, [-0.05, -0.02, 0.16], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 5; i++){
      s.put(new THREE.BoxGeometry(0.07, 0.003, 0.004), matSteel, [0, -0.06 - i * 0.036, 0.218]);
    }
    s.put(cylZ(0.008, 0.008, 0.16, 6), matRubber, [0.06, -0.06, -0.02], [0.4, 0, 0]);
    s.put(new THREE.TorusGeometry(0.014, 0.003, 6, 12), matSteel, [-0.055, -0.05, 0.1], [0, Math.PI / 2, 0]);
    // scope
    s.put(new THREE.BoxGeometry(0.03, 0.04, 0.08), matDark, [0, 0.118, 0.11]);
    s.put(new THREE.BoxGeometry(0.03, 0.04, 0.08), matDark, [0, 0.118, -0.04]);
    s.put(cylZ(0.045, 0.045, 0.34, 16), matMetal, [0, 0.152, 0.035]);
    s.put(cylZ(0.058, 0.052, 0.06, 16), matDark, [0, 0.152, 0.22]);
    s.put(cylZ(0.052, 0.058, 0.06, 16), matDark, [0, 0.152, -0.15]);
    s.put(cylZ(0.05, 0.05, 0.005, 16), matLens, [0, 0.152, 0.253]);
    s.put(cylZ(0.046, 0.046, 0.005, 16), matLens, [0, 0.152, -0.183]);
    s.put(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), matDark, [0, 0.2, 0.035]);
    s.put(new THREE.CylinderGeometry(0.016, 0.016, 0.026, 10), matDark, [0.05, 0.152, 0.035], [0, 0, Math.PI / 2]);
    for (const z of [0.12, -0.05]){
      s.put(new THREE.TorusGeometry(0.048, 0.006, 6, 16), matDark, [0, 0.152, z]);
    }
    // folded bipod
    for (const sx of [-1, 1]){
      s.put(new THREE.CylinderGeometry(0.007, 0.007, 0.32, 6), matSteel, [sx * 0.028, -0.05, 0.44], [Math.PI / 2, 0, sx * 0.12]);
      s.put(new THREE.BoxGeometry(0.03, 0.012, 0.04), matRubber, [sx * 0.05, -0.06, 0.6]);
    }
    // level + pressure gauge
    s.put(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 10), matLens, [0.04, 0.1, -0.12], [Math.PI / 2, 0, 0]);
    s.put(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12), matBrass, [-0.045, 0.06, 0.06], [0, 0, Math.PI / 2]);
    // barrel fluting
    for (let i = 0; i < 4; i++){
      const a = (i / 4) * Math.PI * 2;
      s.put(new THREE.BoxGeometry(0.003, 0.003, 0.46), matSteel, [Math.cos(a) * 0.012, 0.034 + Math.sin(a) * 0.012, 0.72]);
    }
    // chassis cut-outs + action screws
    s.put(new THREE.BoxGeometry(0.004, 0.036, 0.11), matDark, [0.0335, 0.04, 0.15]);
    s.put(new THREE.BoxGeometry(0.004, 0.036, 0.11), matDark, [-0.0335, 0.04, 0.15]);
    for (const z of [-0.02, 0.12, 0.24]){
      s.put(cylZ(0.006, 0.006, 0.014, 6), matSteel, [0.028, 0.03, z]);
      s.put(cylZ(0.006, 0.006, 0.014, 6), matSteel, [-0.028, 0.03, z]);
    }
    // magazine + magwell
    s.put(new THREE.BoxGeometry(0.058, 0.03, 0.1), matDark, [0, -0.052, 0.26]);
    s.put(new THREE.BoxGeometry(0.044, 0.11, 0.075), matTan, [0, -0.13, 0.27], [0.06, 0, 0]);
    s.put(new THREE.BoxGeometry(0.046, 0.012, 0.078), matRubber, [0, -0.19, 0.275], [0.06, 0, 0]);
    // bipod joints / feet
    for (const sx of [-1, 1]){
      s.put(new THREE.SphereGeometry(0.014, 8, 6), matSteel, [sx * 0.028, -0.045, 0.3]);
      s.put(new THREE.SphereGeometry(0.012, 8, 6), matSteel, [sx * 0.048, -0.06, 0.58]);
      s.put(new THREE.BoxGeometry(0.026, 0.02, 0.05), matRubber, [sx * 0.05, -0.068, 0.63]);
    }
    // scope details: sunshade, throw lever, cap, ring screws
    s.put(cylZ(0.062, 0.062, 0.05, 16), matDark, [0, 0.152, 0.27]);
    s.put(new THREE.BoxGeometry(0.024, 0.014, 0.038), matSteel, [0.03, 0.142, 0.09]);
    s.put(new THREE.BoxGeometry(0.05, 0.008, 0.012), matAccent, [0, 0.192, 0.06]);
    for (const z of [0.12, -0.05]){
      for (const sx of [-1, 1]) s.put(cylZ(0.006, 0.006, 0.01, 6), matSteel, [sx * 0.046, 0.152, z]);
    }
    s.put(new THREE.CylinderGeometry(0.006, 0.006, 0.06, 6), matRubber, [0.07, 0.152, 0.035], [0, 0, Math.PI / 2]);
    // cheek riser knobs
    for (const sx of [-1, 1]) s.put(new THREE.CylinderGeometry(0.01, 0.01, 0.014, 8), matSteel, [sx * 0.032, 0.045, -0.31], [0, 0, Math.PI / 2]);
    const sniper = s.build('HYDRA-S', 1.19);

    /* ---------- HYDRA-M compact SMG ---------- */
    const m = bag();
    m.put(new THREE.BoxGeometry(0.058, 0.08, 0.24), matMetal, [0, 0.028, 0.04]);
    m.put(new THREE.BoxGeometry(0.052, 0.058, 0.16), matDark, [0, -0.02, 0.04]);
    m.put(new THREE.BoxGeometry(0.062, 0.012, 0.22), matMetal, [0, 0.072, 0.04]);
    m.put(new THREE.BoxGeometry(0.004, 0.026, 0.07), matDark, [0.03, 0.034, 0.08]);
    m.put(new THREE.BoxGeometry(0.05, 0.012, 0.03), matSteel, [-0.004, 0.05, 0.18]);
    rail(m, -0.04, 0.2, 0.082);
    m.put(cylZ(0.03, 0.03, 0.22, 14), matMetal, [0, 0.03, 0.27]);
    for (let i = 0; i < 6; i++){
      m.put(cylZ(0.034, 0.034, 0.008, 14), matDark, [0, 0.03, 0.18 + i * 0.032]);
    }
    m.put(cylZ(0.012, 0.012, 0.18, 10), matSteel, [0, 0.03, 0.4]);
    m.put(cylZ(0.021, 0.019, 0.06, 10), matDark, [0, 0.03, 0.48]);
    m.put(new THREE.TorusGeometry(0.021, 0.003, 6, 14), matAccent, [0, 0.03, 0.51]);
    m.put(new THREE.TorusGeometry(0.014, 0.0025, 6, 12), matSteel, [0, 0.03, 0.44]);
    // folding stock
    for (const sx of [-1, 1]){
      m.put(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 6), matSteel, [sx * 0.022, 0.028, -0.14]);
    }
    m.put(new THREE.BoxGeometry(0.055, 0.07, 0.02), matPoly, [0, 0.018, -0.24]);
    m.put(new THREE.BoxGeometry(0.06, 0.062, 0.016), matRubber, [0, 0.018, -0.255]);
    m.put(new THREE.CylinderGeometry(0.012, 0.012, 0.024, 10), matDark, [0.028, 0.028, -0.055], [0, 0, Math.PI / 2]);
    m.put(new THREE.BoxGeometry(0.012, 0.02, 0.03), matSteel, [-0.03, 0.028, -0.06]);
    m.put(new THREE.TorusGeometry(0.012, 0.0025, 6, 10), matSteel, [0.032, 0.006, -0.22], [0, Math.PI / 2, 0]);
    // grip + trigger + guard
    m.put(new THREE.BoxGeometry(0.04, 0.11, 0.052), matPoly, [0, -0.095, 0.0], [0.24, 0, 0]);
    for (let i = 0; i < 3; i++){
      m.put(new THREE.BoxGeometry(0.044, 0.007, 0.054), matRubber, [0, -0.124 + i * 0.024, 0.008], [0.24, 0, 0]);
    }
    for (let i = 0; i < 6; i++){
      m.put(new THREE.BoxGeometry(0.036, 0.004, 0.004), matRubber, [0, -0.068 - i * 0.014, 0.026]);
    }
    m.put(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI), matMetal, [0, -0.05, 0.075], [0, Math.PI / 2, 0]);
    m.put(new THREE.BoxGeometry(0.007, 0.024, 0.007), matAccent, [0, -0.047, 0.066]);
    m.put(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 8), matSteel, [0.032, 0.02, 0.02], [0, 0, Math.PI / 2]);
    // vertical grip
    m.put(new THREE.BoxGeometry(0.032, 0.085, 0.045), matPoly, [0, -0.07, 0.25]);
    m.put(new THREE.BoxGeometry(0.036, 0.008, 0.05), matRubber, [0, -0.105, 0.25]);
    for (let i = 0; i < 4; i++){
      m.put(new THREE.BoxGeometry(0.034, 0.004, 0.047), matRubber, [0, -0.038 - i * 0.016, 0.25]);
    }
    // side water canister (glass + liquid + level marks)
    m.put(new THREE.CylinderGeometry(0.032, 0.032, 0.19, 14), matGlass, [0.049, -0.03, 0.03]);
    m.put(new THREE.CylinderGeometry(0.027, 0.027, 0.168, 12), matWater, [0.049, -0.035, 0.03]);
    m.put(new THREE.CylinderGeometry(0.034, 0.034, 0.014, 14), matDark, [0.049, 0.068, 0.03]);
    m.put(new THREE.CylinderGeometry(0.034, 0.034, 0.014, 14), matDark, [0.049, -0.128, 0.03]);
    m.put(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), matRubber, [0.05, 0.02, 0.13], [0.5, 0, 0]);
    for (let i = 0; i < 3; i++){
      m.put(new THREE.BoxGeometry(0.004, 0.003, 0.022), matSteel, [0.079, -0.02 - i * 0.032, 0.06]);
    }
    // top red dot
    m.put(new THREE.BoxGeometry(0.026, 0.03, 0.06), matDark, [0, 0.1, 0.02]);
    m.put(new THREE.BoxGeometry(0.02, 0.02, 0.004), matLens, [0, 0.102, 0.052]);
    m.put(new THREE.CylinderGeometry(0.005, 0.005, 0.008, 6), matAccent, [0, 0.102, 0.05], [Math.PI / 2, 0, 0]);
    m.put(new THREE.BoxGeometry(0.005, 0.024, 0.006), matDark, [0, 0.09, 0.31]);
    m.put(new THREE.BoxGeometry(0.024, 0.008, 0.016), matDark, [0.03, 0.086, 0.02]);
    m.put(new THREE.CylinderGeometry(0.011, 0.011, 0.036, 10), matDark, [-0.033, 0.06, 0.14], [0, 0, Math.PI / 2]);
    m.put(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10), matAccent, [-0.052, 0.06, 0.14], [0, 0, Math.PI / 2]);
    const smg = m.build('HYDRA-M', 0.53);

    // stencilled receiver markings (procedural canvas decals)
    const gd = this.assets.gunDecals || {};
    const decalMat = (tex) => new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.92, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    const addDecal = (gun, tex, w, h, x, y, z) => {
      if (!tex) return;
      const mat = decalMat(tex);
      for (const s of [-1, 1]){
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
        mesh.position.set(s * x, y, z);
        mesh.rotation.y = s * Math.PI / 2;
        mesh.renderOrder = 4;
        gun.add(mesh);
      }
    };
    addDecal(rifle, gd.rifle, 0.19, 0.047, 0.0345, 0.018, 0.075);
    addDecal(sniper, gd.sniper, 0.2, 0.05, 0.0345, 0.02, 0.1);
    addDecal(smg, gd.smg, 0.16, 0.04, 0.0345, 0.018, 0.03);

    this.guns = { rifle };
    if (this.isPlayer){
      this.guns.sniper = sniper;
      this.guns.smg = smg;
    }
    const gunScales = { rifle: 0.78, sniper: 0.7, smg: 0.74 };
    for (const k in this.guns){
      const g = this.guns[k];
      g.position.set(0.24, 1.16, 0.3);
      g.scale.setScalar(gunScales[k] || 0.9);
      g.visible = k === 'rifle';
      this.root.add(g);
    }
    this.gun = rifle;
    this.muzzle = rifle.userData.muzzle;
    this.muzzleFlash = rifle.userData.flash;
    this.gunBase = rifle.position.clone();
    this.weaponKind = 'rifle';
    this._gunSmooth = null;
    this._gunSmoothQ = null;
  }

  setWeapon(kind){
    if (!this.guns) return;
    const g = this.guns[kind] || this.guns.rifle;
    if (g === this.gun) return;
    for (const k in this.guns) this.guns[k].visible = this.guns[k] === g;
    this.gun = g;
    this.muzzle = g.userData.muzzle;
    this.muzzleFlash = g.userData.flash;
    this.weaponKind = kind;
  }

  /* ---------------- pressurized back tank ---------------- */
  buildTank(){
    const g = new THREE.Group();
    g.name = 'WaterTank';
    const gm = this.assets.gunMaps || {};
    const steel = new THREE.MeshStandardMaterial({
      color: 0x49535d, roughness: 0.42, metalness: 0.85,
      roughnessMap: gm.worn || null, bumpMap: gm.worn || null, bumpScale: 0.003,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2127, roughness: 0.62, metalness: 0.35 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x22282e, roughness: 0.88, metalness: 0.05 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a45a, roughness: 0.28, metalness: 0.92 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0xa9dbe8, roughness: 0.1, metalness: 0.0, transparent: true, opacity: 0.14,
      side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.55,
    });

    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.46, 26, 1, true), glass);
    shell.position.y = 1.285;
    g.add(shell);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.139, 0.139, 0.44, 26), steel);
    inner.position.y = 1.285;
    inner.visible = false;
    g.add(inner);

    // liquid body: animated caustics seen through the polycarbonate shell
    this.tankWaterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSlosh: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uSlosh;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        void main(){
          float t = uTime * (0.7 + uSlosh * 1.6);
          float n1 = noise(vec2(vUv.x * 9.0, vUv.y * 5.5 - t * 0.55));
          float n2 = noise(vec2(vUv.x * 15.0 + 4.0, vUv.y * 9.0 - t * 0.9));
          float caust = pow(1.0 - abs(n1 - n2), 4.2) * 1.7;
          float band = 0.5 + 0.5 * sin((vUv.y * 12.0 - t * 2.0) + n1 * 5.0);
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          vec3 col = mix(vec3(0.01, 0.11, 0.27), vec3(0.2, 0.66, 0.9), caust * 0.5 + band * 0.1);
          col += vec3(0.25, 0.68, 1.0) * fres * 0.32;
          gl_FragColor = vec4(col, 0.26 + caust * 0.22 + fres * 0.3);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.136, 0.136, 0.4, 26), this.tankWaterMat);
    water.position.y = 1.275;
    g.add(water);

    // sloshing surface
    this.tankSurfaceMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSlosh: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main(){
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uSlosh;
        varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          float ang = atan(p.y, p.x);
          float ring = sin(r * 26.0 - uTime * (5.0 + uSlosh * 5.0) + ang * 3.0) * 0.5 + 0.5;
          float ring2 = sin(r * 41.0 + uTime * 3.4 - ang * 2.0) * 0.5 + 0.5;
          float foam = smoothstep(0.72, 1.0, r) * (0.4 + ring2 * 0.5);
          vec3 col = mix(vec3(0.1, 0.5, 0.68), vec3(0.85, 0.99, 1.0), ring * 0.5 + foam * 0.7);
          float a = (0.18 + ring * 0.2 + foam * 0.55) * (1.0 - smoothstep(0.94, 1.0, r));
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const surface = new THREE.Mesh(new THREE.CircleGeometry(0.135, 28), this.tankSurfaceMat);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 1.472;
    g.add(surface);
    this.tankSurface = surface;
    this.tankSurfaceBaseY = 1.472;

    // suspended bubbles
    this.tankBubbles = [];
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: 0x9fe6ff, transparent: true, opacity: 0.3, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const bubbleGeo = new THREE.SphereGeometry(0.009, 6, 5);
    for (let i = 0; i < 14; i++){
      const b = new THREE.Mesh(bubbleGeo, bubbleMat);
      b.position.set((Math.random() - 0.5) * 0.2, 1.08 + Math.random() * 0.34, (Math.random() - 0.5) * 0.2);
      const r = 0.11 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      b.position.x = Math.cos(a) * r;
      b.position.z = Math.sin(a) * r;
      b.userData = { speed: 0.06 + Math.random() * 0.14, phase: Math.random() * 6.28, r, a };
      b.scale.setScalar(0.5 + Math.random() * 0.9);
      g.add(b);
      this.tankBubbles.push(b);
    }

    for (const y of [1.055, 1.515]){
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.045, 24), dark);
      ring.position.y = y;
      ring.castShadow = true;
      g.add(ring);
      if (y < 1.3){
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.148, 0.016, 24), steel);
        cap.position.y = y + 0.018;
        g.add(cap);
      }
    }
    // open glass window on top so the sloshing surface reads from behind
    const topGlass = new THREE.Mesh(new THREE.CircleGeometry(0.138, 28), glass);
    topGlass.rotation.x = -Math.PI / 2;
    topGlass.position.y = 1.54;
    g.add(topGlass);
    const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.008, 6, 26), dark);
    topRim.rotation.x = Math.PI / 2;
    topRim.position.y = 1.54;
    g.add(topRim);

    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.085, 12), steel);
    valve.position.set(0, 1.585, 0);
    g.add(valve);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.024, 12), dark);
    knob.position.set(0, 1.642, 0);
    g.add(knob);
    const knobInset = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.028, 10), brass);
    knobInset.position.set(0, 1.646, 0);
    g.add(knobInset);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 16), dark);
    gauge.rotation.z = Math.PI / 2;
    gauge.position.set(0.162, 1.52, 0.02);
    g.add(gauge);
    const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(0.039, 18),
      new THREE.MeshBasicMaterial({ color: 0xd7f7ff }));
    gaugeFace.rotation.y = Math.PI / 2;
    gaugeFace.position.set(0.174, 1.52, 0.02);
    g.add(gaugeFace);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.027, 0.004), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
    needle.position.set(0.176, 1.526, 0.02);
    needle.rotation.x = -0.6;
    g.add(needle);

    // hose loops from the tank valve to the hip
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.07, 1.55, -0.31),
      new THREE.Vector3(0.25, 1.42, -0.24),
      new THREE.Vector3(0.29, 1.2, 0.02),
      new THREE.Vector3(0.26, 1.07, 0.22),
    ]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 6, false), dark);
    hose.castShadow = true;
    g.add(hose);
    for (let i = 0; i < 3; i++){
      const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 5, 10), brass);
      clamp.position.copy(curve.getPoint(0.22 + i * 0.28));
      clamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(0.22 + i * 0.28));
      g.add(clamp);
    }

    for (const sx of [-1, 1]){
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.3, 0.014), strap);
      s.position.set(sx * 0.12, 1.36, 0.06);
      s.rotation.z = sx * 0.12;
      g.add(s);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.022), brass);
      buckle.position.set(sx * 0.135, 1.22, 0.07);
      g.add(buckle);
    }

    // small warning decal strip
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.045),
      new THREE.MeshBasicMaterial({ color: 0xffb038, transparent: true, opacity: 0.9 }));
    decal.position.set(0, 1.08, 0.142);
    g.add(decal);

    g.position.z = -0.3;
    this.root.add(g);
    this.tank = g;
    this.tankGlow = water;
    this.tankGaugeNeedle = needle;
  }

  updateTank(dt, time){
    if (!this.tankWaterMat) return;
    const slosh = THREE.MathUtils.clamp(this.moveSpeed / 6.5, 0, 1);
    this.tankWaterMat.uniforms.uTime.value = time;
    this.tankWaterMat.uniforms.uSlosh.value = slosh;
    this.tankSurfaceMat.uniforms.uTime.value = time;
    this.tankSurfaceMat.uniforms.uSlosh.value = slosh;
    if (this.tankSurface){
      this.tankSurface.position.y = this.tankSurfaceBaseY + Math.sin(time * 2.4) * 0.006 * (0.4 + slosh);
      this.tankSurface.rotation.z = Math.sin(time * 1.9) * 0.05 * (0.4 + slosh * 1.6);
      this.tankSurface.rotation.x = -Math.PI / 2 + Math.cos(time * 1.7) * 0.05 * (0.4 + slosh * 1.6);
    }
    if (this.tankBubbles){
      for (const b of this.tankBubbles){
        b.position.y += dt * b.userData.speed * (0.6 + slosh * 1.8);
        const wob = time * 2.2 + b.userData.phase;
        b.position.x = Math.cos(b.userData.a + Math.sin(wob) * 0.5) * b.userData.r;
        b.position.z = Math.sin(b.userData.a + Math.cos(wob) * 0.5) * b.userData.r;
        if (b.position.y > 1.44){
          b.position.y = 1.09;
          b.userData.a = Math.random() * Math.PI * 2;
          b.userData.r = 0.11 * Math.sqrt(Math.random());
        }
      }
    }
    if (this.tankGaugeNeedle){
      this.tankGaugeNeedle.rotation.x = -0.6 + Math.sin(time * 1.6) * 0.1 + slosh * 0.2;
    }
  }

  /* ---------------- bubble / shadow ---------------- */
  buildBubble(){
    const geoBubble = new THREE.SphereGeometry(1.0, 48, 32);
    this.bubbleMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color(this.skin.accent || 0xdff6ff) },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vN;
        varying vec3 vV;
        varying vec2 vUv;
        varying vec3 vP;
        void main(){
          vUv = uv;
          vP = position;
          vec3 p = position;
          float w = sin(position.y * 5.2 + uTime * 2.1) * 0.018;
          w += sin(position.x * 6.4 - uTime * 1.7) * 0.014;
          w += sin(position.z * 7.1 + uTime * 2.6) * 0.011;
          p += normal * w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec4 mv = viewMatrix * wp;
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uTint;
        uniform float uOpacity;
        varying vec3 vN;
        varying vec3 vV;
        varying vec2 vUv;
        varying vec3 vP;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        void main(){
          vec3 n = normalize(vN);
          vec3 v = normalize(vV);
          float fres = pow(1.0 - abs(dot(n, v)), 2.0);
          float edge = smoothstep(0.25, 1.0, fres);
          float swirl = noise(vUv * vec2(9.0, 7.0) + vec2(uTime * 0.09, -uTime * 0.06));
          float swirl2 = noise(vUv * vec2(16.0, 12.0) - vec2(uTime * 0.05, uTime * 0.08));
          float band = fres * 3.2 + swirl * 0.75 + swirl2 * 0.35 + uTime * 0.035;
          vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + band));
          float thin = 0.35 + 0.65 * smoothstep(0.1, 0.9, swirl2);
          // condensation droplets riding on the film
          vec2 gp = vUv * vec2(34.0, 22.0);
          vec2 cell = floor(gp);
          vec2 f = fract(gp) - 0.5;
          float h = hash(cell);
          vec2 off = vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5;
          float drop = smoothstep(0.16, 0.0, length(f - off * 0.45)) * step(0.74, h);
          // twin specular highlights from the sun + sky
          vec3 L1 = normalize(vec3(0.45, 0.82, 0.36));
          vec3 L2 = normalize(vec3(-0.55, 0.28, -0.45));
          float spec = pow(max(dot(reflect(-L1, n), v), 0.0), 160.0);
          float spec2 = pow(max(dot(reflect(-L2, n), v), 0.0), 48.0);
          vec3 col = uTint * (0.42 + edge * 0.75) + irid * thin * 0.65;
          col += vec3(1.0, 0.98, 0.94) * spec * 1.7;
          col += vec3(0.55, 0.92, 1.0) * spec2 * 0.55;
          col += vec3(0.8, 0.97, 1.0) * drop * 0.6;
          float sheen = pow(max(dot(n, normalize(vec3(0.32, 0.82, 0.47))), 0.0), 2.2);
          col += vec3(0.4, 0.8, 1.0) * sheen * 0.14;
          float film = 0.12 + 0.08 * thin + sheen * 0.05;
          float alpha = (film + edge * 0.7 + spec * 1.2 + spec2 * 0.4 + drop * 0.45 + 0.02) * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    this.bubble = new THREE.Mesh(geoBubble, this.bubbleMat);
    this.bubble.position.y = 0.95;
    this.bubble.scale.setScalar(0.001);
    this.bubble.renderOrder = 6;
    this.bubble.visible = false;
    this.group.add(this.bubble);

    this.bubbleInner = new THREE.Mesh(
      new THREE.SphereGeometry(0.965, 28, 20),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.skin.accent || 0xcffaff).multiplyScalar(0.35),
        transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false,
      })
    );
    this.bubbleInner.position.y = 0.95;
    this.bubbleInner.visible = false;
    this.group.add(this.bubbleInner);

    // countdown bar
    const bc = document.createElement('canvas');
    bc.width = 256; bc.height = 40;
    this.barCanvas = bc;
    this.barCtx = bc.getContext('2d');
    this.bubbleBarTex = new THREE.CanvasTexture(bc);
    this.bubbleBarTex.colorSpace = THREE.SRGBColorSpace;
    this.bubbleBar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.bubbleBarTex, transparent: true, depthTest: false, depthWrite: false,
    }));
    this.bubbleBar.scale.set(1.15, 0.19, 1);
    this.bubbleBar.position.y = 2.28;
    this.bubbleBar.visible = false;
    this.bubbleBar.renderOrder = 12;
    this.group.add(this.bubbleBar);
    this._barDrawn = -1;
  }

  updateBubbleBar(remaining){
    if (!this.bubbleBar) return;
    this.bubbleBar.visible = this.bubbled;
    if (!this.bubbled) return;
    const r = Math.max(0, Math.min(1, remaining));
    if (Math.abs(r - this._barDrawn) < 0.008) return;
    this._barDrawn = r;
    const ctx = this.barCtx, w = 256, h = 40;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8,14,20,0.72)';
    ctx.fillRect(2, 12, w - 4, 16);
    ctx.strokeStyle = 'rgba(180,236,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 12, w - 4, 16);
    const grd = ctx.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#5fd4ff');
    grd.addColorStop(1, '#d7f6ff');
    ctx.fillStyle = grd;
    ctx.fillRect(5, 15, (w - 10) * r, 10);
    this.bubbleBarTex.needsUpdate = true;
  }

  buildShadow(){
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({
        map: this.assets.sprites.shadow, transparent: true, opacity: 0.62,
        depthWrite: false, color: 0x000000,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.022;
    m.renderOrder = 1;
    this.group.add(m);
    this.blobShadow = m;

    const ringColor = this.skin.accent || (this.team === 'red' ? 0xff6a5a : 0x63c8ff);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: ringColor, transparent: true, opacity: 0.42,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    ring.renderOrder = 2;
    this.group.add(ring);
    this.teamRing = ring;
  }

  /* ---------------- gameplay visuals ---------------- */
  setWetness(w){
    // bullet combat: no wet sheen on the operators any more
    this.wetness = Math.max(0, Math.min(100, w));
  }

  setBubbled(on){
    if (this.bubbled === on) return;
    this.bubbled = on;
    this.bubble.visible = on;
    this.bubbleInner.visible = on;
    if (this.bubbleBar) this.bubbleBar.visible = on;
    if (this.gun) this.gun.visible = !on;
    this.bubbleT = 0;
    this.fireLock = 0;
    if (on){
      this.bubbleInflate = this.bubbleInflate || 0;
      this.state = 'bubble';
      this.aimBlend = 0;
      // never leave the skinning stack with zero weight: that exposes the
      // bind pose (T-pose). Stop everything and settle on the idle loop.
      for (const k of ['walk', 'run', 'fire', 'punch', 'death']){
        if (this.actions[k]) this.actions[k].stop();
      }
      if (this.actions.idle){
        this.actions.idle.reset().setEffectiveWeight(1).play();
        this.current = this.actions.idle;
      }
    } else {
      this.state = 'idle';
    }
  }

  playShoot(){
    this.recoil = 1;
    this.gunHidden = false;
    if (this.gun) this.gun.visible = true;
    const f = this.actions && this.actions.fire;
    if (f && this.mixer){
      f.reset();
      f.setLoop(THREE.LoopOnce, 1);
      f.clampWhenFinished = true;
      f.setEffectiveWeight(1);
      f.play();
      if (this.current && this.current !== f) f.crossFadeFrom(this.current, 0.06, false);
      this.current = f;
      this.fireLock = Math.min(0.5, f.getClip().duration * 0.85);
    }
    if (this.muzzleFlash) this.muzzleFlash.material.opacity = 0.9;
  }
  playPunch(){
    this.recoil = Math.max(this.recoil, 0.6);
    // free the hands for the punch; the weapon returns after the swing
    this.gunHidden = true;
    if (this.gun) this.gun.visible = false;
    const f = this.actions && this.actions.punch;
    if (f && this.mixer){
      f.reset();
      f.setLoop(THREE.LoopOnce, 1);
      f.clampWhenFinished = true;
      f.setEffectiveWeight(1);
      f.play();
      if (this.current && this.current !== f) f.crossFadeFrom(this.current, 0.05, false);
      this.current = f;
      this.fireLock = Math.min(1.15, f.getClip().duration * 0.75);
    }
  }

  playGetUp(){ this.hitFlash = 0; }

  playDeath(){
    this.bubbled = false;
    this.bubble.visible = false;
    this.bubbleInner.visible = false;
    if (this.bubbleBar) this.bubbleBar.visible = false;
    if (this.gun) this.gun.visible = false;
    if (this.tank) this.tank.visible = false;
    this.bubbleT = 0;
    this.bubbleScale = 0;
    this.dead = true;
    this.fireLock = 0;
    const f = this.actions && this.actions.death;
    if (f && this.mixer){
      this.mixer.stopAllAction();
      f.reset();
      f.setLoop(THREE.LoopOnce, 1);
      f.clampWhenFinished = true;
      f.setEffectiveWeight(1);
      f.play();
      this.current = f;
    } else {
      this.group.rotation.x = -1.25;
    }
  }

  updateDeath(dt){
    if (this.mixer) this.mixer.update(dt);
    this.updateTank(dt, this.time);
    // Keep the fallen operator on the ground: the shared death clip drops the
    // hips in source-rig units, which would otherwise leave the body hovering.
    if (!this.body) return;
    this.body.updateMatrixWorld(true);
    const v = this._deathV || (this._deathV = new THREE.Vector3());
    let minY = Infinity;
    this.body.traverse((o) => {
      if (!o.isBone) return;
      o.getWorldPosition(v);
      if (v.y < minY) minY = v.y;
    });
    if (Number.isFinite(minY)){
      const target = this.group.position.y + 0.01;
      const k = this.root.scale.y || 1;
      this.body.position.y += (target - minY) / k;
    }
  }

  resetPose(){
    this.dead = false;
    this.bubbled = false;
    this.fireLock = 0;
    this.aimHold = false;
    this.aimTrack = false;
    this.group.rotation.x = 0;
    if (this.body){
      if (Number.isFinite(this.bodyBaseY)) this.body.position.y = this.bodyBaseY;
      this.body.rotation.y = this.bodyFlip || 0;
    }
    this.bubble.visible = false;
    this.bubbleInner.visible = false;
    if (this.bubbleBar) this.bubbleBar.visible = false;
    if (this.gun) this.gun.visible = true;
    if (this.tank) this.tank.visible = true;
    this.bubbleT = 0;
    this.bubbleScale = 0;
    this.bubbleInflate = 0;
    if (this.mixer){
      this.mixer.stopAllAction();
      if (this.actions.idle){
        this.actions.idle.reset().setEffectiveWeight(1).play();
        this.current = this.actions.idle;
      }
    }
  }
  playHit(){ this.hitFlash = 1; }

  setMotion(speed, aimBlend, grounded = true){
    this.moveSpeed = speed;
    this.aimBlend = aimBlend;
    this.aimHold = aimBlend > 0.5;
    this.grounded = grounded;
  }

  update(dt, time){
    this.time = time;
    this.updateTank(dt, time);

    // hit flash
    if (this.hitFlash > 0){
      this.hitFlash = Math.max(0, this.hitFlash - dt * 4.5);
      const f = this.hitFlash;
      for (const m of this.modelMats){
        if (!m.emissive) continue;
        // warm impact flare — an amber flash reads as a bullet strike, not a
        // bubble/water hit (which used to turn the whole body cyan)
        m.emissive.setRGB(f * 0.52, f * 0.3, f * 0.06);
      }
    } else {
      for (const m of this.modelMats){
        if (m.emissive && (m.emissive.r > 0.002 || m.emissive.g > 0.002 || m.emissive.b > 0.002)){
          m.emissive.setRGB(0, 0, 0);
        }
      }
    }

    if (this.bubbled){
      this.bubbleT += dt;
      const s = Math.min(1, this.bubbleT * 2.4);
      const ease = 1 - Math.pow(1 - s, 3);
      this.bubbleScale = ease;
      const pulse = 1 + Math.sin(time * 2.1) * 0.012;
      const infl = 1 + Math.min(1, (this.bubbleInflate || 0) / 100) * 0.34;
      this.bubble.scale.setScalar(Math.max(0.001, ease * pulse * infl));
      this.bubble.position.y = 0.95 + Math.sin(time * 1.5) * 0.04;
      this.bubbleInner.scale.copy(this.bubble.scale);
      this.bubbleInner.position.y = this.bubble.position.y;
      this.bubbleBar.position.y = 2.28 + (infl - 1) * 1.2;
      this.bubbleMat.uniforms.uTime.value = time;
      if (this.mixer) this.mixer.update(dt * 0.25);
      this.updateWeapon(dt, true);
      return;
    }

    // one-shot fire pose takes priority over locomotion blending
    if (this.fireLock > 0){
      this.fireLock -= dt;
      if (this.mixer) this.mixer.update(dt);
      this.updateWeapon(dt, false);
      if (this.fireLock <= 0 && this.gunHidden){
        this.gunHidden = false;
        if (this.gun) this.gun.visible = !this.bubbled && !this.dead;
      }
      return;
    }

    // locomotion blend
    const sp = this.moveSpeed;
    const wantRun = sp > 4.0;
    const wantWalk = sp > 0.25 && !wantRun;
    const wantIdle = !wantRun && !wantWalk;
    let next = this.current;
    if (wantRun && this.actions.run) next = this.actions.run;
    else if (wantWalk && this.actions.walk) next = this.actions.walk;
    else if (wantIdle && this.aimHold && this.actions.aim) next = this.actions.aim;
    else if (wantIdle && this.actions.idle) next = this.actions.idle;

    if (next && next !== this.current){
      const prev = this.current;
      next.reset().setEffectiveWeight(1).play();
      if (prev) prev.crossFadeTo(next, 0.22, false);
      this.current = next;
    }
    if (this.current){
      const base = this.current === this.actions.run ? 5.4 : (this.current === this.actions.walk ? 1.7 : 1);
      const ts = this.current === this.actions.idle ? 1 : THREE.MathUtils.clamp(sp / base, 0.65, 1.65);
      this.current.timeScale = ts;
    }
    if (this.cheer && this.actions.idle){
      this.body && (this.body.rotation.z = Math.sin(time * 1.1) * 0.012);
    }
    if (this.mixer) this.mixer.update(dt);
    this.updateWeapon(dt, false);

    // bubble bar / ring
    if (this.teamRing){
      this.teamRing.material.opacity = 0.3 + Math.sin(time * 2.4) * 0.08;
    }
  }

  updateWeapon(dt, bubbled){
    if (!this.gun) return;
    const g = this.gun;
    g.updateMatrixWorld(true);
    let pos = this.gunBase;
    let quat = null;
    if (this.handBone && this.leftHandBone && this.body){
      this.root.updateWorldMatrix(true, true);
      const rp = this._rp || (this._rp = new THREE.Vector3());
      const lp = this._lp || (this._lp = new THREE.Vector3());
      this.handBone.getWorldPosition(rp);
      this.leftHandBone.getWorldPosition(lp);
      this.root.worldToLocal(rp);
      this.root.worldToLocal(lp);

      const fwd = this._fwdG || (this._fwdG = new THREE.Vector3());
      if (this.aimPoint && (this.aimTrack || this.aimHold || this.fireLock > 0)){
        // point the barrel at the reticle target, not merely along the hands
        const ap = this._apG || (this._apG = new THREE.Vector3());
        ap.copy(this.aimPoint);
        this.root.worldToLocal(ap);
        fwd.copy(ap).sub(rp);
        if (fwd.lengthSq() < 1e-5) fwd.set(0, 0, 1);
        fwd.normalize();
      } else {
        fwd.copy(lp).sub(rp);
        fwd.y *= 0.35;                       // keep the muzzle from pointing at the floor
        if (fwd.lengthSq() < 1e-5) fwd.set(0, 0, 1);
        fwd.normalize();
        // Idle / walk poses can have the arms crossed or hanging, which made
        // the rifle point sideways across the chest. Only follow the hand line
        // when it actually agrees with the torso, otherwise keep the barrel
        // along the operator's forward axis like a proper low-ready carry.
        const torso = this._torsoFwd || (this._torsoFwd = new THREE.Vector3(0, 0, 1));
        if (fwd.dot(torso) < 0.55){
          fwd.copy(torso);
        } else {
          fwd.lerp(torso, 0.55).normalize();
        }
      }

      const right = this._rightG || (this._rightG = new THREE.Vector3());
      right.crossVectors(this._upAxis || (this._upAxis = new THREE.Vector3(0, 1, 0)), fwd);
      if (right.lengthSq() < 1e-5) right.set(1, 0, 0);
      right.normalize();
      const up = this._upG || (this._upG = new THREE.Vector3());
      up.crossVectors(fwd, right).normalize();

      const basis = this._basis || (this._basis = new THREE.Matrix4());
      basis.makeBasis(right, up, fwd);
      quat = this._tq || (this._tq = new THREE.Quaternion());
      quat.setFromRotationMatrix(basis);

      // the pistol grip sits just below the palm; align that anchor with the hand
      const scale = g.scale.x;
      const gripY = (this.weaponKind === 'smg' ? 0.092 : 0.098) * scale;
      pos = this._tp || (this._tp = new THREE.Vector3());
      pos.copy(rp).addScaledVector(up, gripY).addScaledVector(fwd, 0.035).addScaledVector(right, -0.03);
    }

    if (!this._gunSmooth){
      this._gunSmooth = pos.clone();
      this._gunSmoothQ = quat ? quat.clone() : new THREE.Quaternion();
    }
    const k = Math.min(1, dt * 16);
    this._gunSmooth.lerp(pos, k);
    if (quat) this._gunSmoothQ.slerp(quat, k);

    this.recoil = Math.max(0, this.recoil - dt * 4.2);
    g.position.copy(this._gunSmooth);
    g.quaternion.copy(this._gunSmoothQ);
    if (this.recoil > 0.0001){
      g.translateZ(-this.recoil * 0.11);
      g.rotateX(-this.recoil * 0.2);
      g.rotateZ(this.recoil * 0.045);
    }

    if (this.muzzleFlash){
      const mat = this.muzzleFlash.material;
      mat.opacity = Math.max(0, mat.opacity - dt * 6);
      this.muzzleFlash.scale.setScalar(0.8 + (1 - mat.opacity) * 0.6);
    }
    if (this.bubbleMat) this.bubbleMat.uniforms.uTime.value = this.time;
  }

  getHitSpheres(){
    const out = [];
    for (const s of this.hitSpheres){
      out.push({ center: new THREE.Vector3(0, s.y, 0).applyMatrix4(this.group.matrixWorld), r: s.r * this.scale });
    }
    return out;
  }

  getMuzzleWorld(target = new THREE.Vector3()){
    return this.muzzle.getWorldPosition(target);
  }

  getCenter(target = new THREE.Vector3()){
    return target.set(0, 1.05 * this.scale, 0).applyMatrix4(this.group.matrixWorld);
  }
}
