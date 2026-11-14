import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/* ============================================================
   Asset library — HDRI + PBR texture sets + procedural sprites
   ============================================================ */
const PBR_SETS = [
  { name: 'sand',     dir: 'sand_01' },
  { name: 'plaster',  dir: 'plastered_wall_02' },
  { name: 'sandstone',dir: 'sandstone_blocks_04' },
  { name: 'wood',     dir: 'wooden_planks' },
  { name: 'metal',    dir: 'rusty_metal_sheet' },
  { name: 'roof',     dir: 'clay_roof_tiles' },
];

// photoreal-ish rigged humans (three.js / Mixamo example assets)
const CHAR_MODELS = [
  { key: 'vanguard', url: 'models/Soldier.glb', flip: Math.PI },
  { key: 'remy',     url: 'models/avatar3.glb' },
  { key: 'eve',      url: 'models/eve.glb' },
];

// Mixamo motion captures, retargeted onto both rigs at runtime
const CHAR_ANIMS = [
  { key: 'rifleIdle', url: 'models/anim/Rifle_Idle.glb' },
  { key: 'rifleWalk', url: 'models/anim/Walk_With_Rifle.glb' },
  { key: 'rifleRun',  url: 'models/anim/Rifle_Run.glb' },
  { key: 'shoot',     url: 'models/anim/Rifle_Aiming_Idle.glb' },
  { key: 'punch',     url: 'models/anim/Cross_Punch.glb' },
  { key: 'death',     url: 'models/anim/Falling_Flat_Impact.glb' },
];

function loadImage(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed: ' + url));
    img.src = assetUrl(url);
  });
}

/* When the game is shipped as a single HTML file, the build embeds every
   binary asset as a data URI in window.__ASSET_MAP. In a normal hosted build
   the map is absent and the original path is used. */
function assetUrl(path){
  if (typeof window !== 'undefined' && window.__ASSET_MAP){
    return window.__ASSET_MAP[path] || path;
  }
  return path;
}

export class Assets {
  constructor(renderer){
    this.renderer = renderer;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.textures = {};
    this.envMap = null;
    this.hdriTexture = null;
    this.sprites = {};
    this.faces = {};
    this.decals = {};
  }

  async load(onProgress = () => {}, onLabel = () => {}){
    const steps = [];
    for (const set of PBR_SETS) steps.push(set);
    const total = steps.length + 3 + CHAR_MODELS.length + CHAR_ANIMS.length;
    let done = 0;
    const tick = (label) => { done++; onProgress(done / total); onLabel(label); };

    // --- HDRI ---
    onLabel('HDR ENVIRONMENT · 沙漠天空');
    this.hdriTexture = await new Promise((resolve, reject) => {
      new RGBELoader().load(assetUrl('assets/hdri/desert_sky_4k.hdr'), resolve, undefined, reject);
    });
    this.hdriTexture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    this.envMap = pmrem.fromEquirectangular(this.hdriTexture).texture;
    pmrem.dispose();
    tick('HDR ENVIRONMENT · 沙漠天空');

    // --- PBR sets ---
    for (const set of PBR_SETS){
      onLabel(`PBR SURFACE · ${set.name.toUpperCase()}`);
      const base = `assets/textures/${set.dir}/`;
      const [diff, nor, arm] = await Promise.all([
        loadImage(base + 'diff.jpg'),
        loadImage(base + 'nor_gl.jpg'),
        loadImage(base + 'arm.jpg'),
      ]);
      const map = new THREE.CanvasTexture(diff);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.anisotropy = this.maxAniso;

      const normalMap = new THREE.CanvasTexture(nor);
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.anisotropy = this.maxAniso;

      const armTex = new THREE.CanvasTexture(arm);
      armTex.wrapS = armTex.wrapT = THREE.RepeatWrapping;
      armTex.anisotropy = this.maxAniso;

      this.textures[set.name] = { map, normalMap, arm: armTex, image: diff };
      tick();
    }

    onLabel('PROCEDURAL MATERIALS · 程序化细节');
    this.buildSprites();
    this.buildFaces();
    this.buildDecals();
    this.buildGunMaps();
    tick('PROCEDURAL MATERIALS · 程序化细节');

    // --- rigged human characters ---
    this.characterModels = {};
    const gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    for (const c of CHAR_MODELS){
      onLabel(`CHARACTER RIG · ${c.key.toUpperCase()}`);
      const gltf = await new Promise((resolve, reject) => gltfLoader.load(assetUrl(c.url), resolve, undefined, reject));
      gltf.scene.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh){
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
      this.characterModels[c.key] = { scene: gltf.scene, animations: gltf.animations, flip: c.flip || 0 };
      tick(`CHARACTER RIG · ${c.key.toUpperCase()}`);
    }

    // --- shared Mixamo motion captures ---
    this.motionClips = {};
    for (const a of CHAR_ANIMS){
      onLabel(`MOTION CAPTURE · ${a.key.toUpperCase()}`);
      const gltf = await new Promise((resolve, reject) => gltfLoader.load(assetUrl(a.url), resolve, undefined, reject));
      const clip = gltf.animations[0];
      if (clip) clip.name = a.key;
      const bind = new Map();
      const posBind = new Map();
      gltf.scene.traverse((o) => {
        // animation-only exports may not flag nodes as Bones
        if (o.name && o.name.includes('mixamorig')){
          const n = o.name.replace(/mixamorig[:_]/g, 'mixamorig');
          bind.set(n, o.quaternion.clone());
          posBind.set(n, o.position.clone());
        }
      });
      if (clip) this.motionClips[a.key] = { clip, bind, posBind, scene: gltf.scene };
      tick(`MOTION CAPTURE · ${a.key.toUpperCase()}`);
    }
    return this;
  }

  /* ---------------- sprite + texture helpers ---------------- */
  canvasTexture(w, h, draw, colorSpace = THREE.SRGBColorSpace){
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = colorSpace;
    t.anisotropy = Math.min(8, this.maxAniso);
    return t;
  }

  buildSprites(){
    const soft = (ctx, w, h) => {
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    };
    this.sprites.glow = this.canvasTexture(128, 128, soft);
    this.sprites.water = this.canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(190,250,255,0.9)');
      g.addColorStop(0.6, 'rgba(60,190,240,0.35)');
      g.addColorStop(1, 'rgba(30,120,200,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++){
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 26;
        ctx.beginPath();
        ctx.arc(w/2 + Math.cos(a) * r, h/2 + Math.sin(a) * r, 1.5 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220,255,255,.7)';
        ctx.fill();
      }
    });
    this.sprites.splashRing = this.canvasTexture(256, 256, (ctx, w, h) => {
      ctx.strokeStyle = 'rgba(220,255,255,0.85)';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(w/2, h/2, 92, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,220,255,0.35)';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(w/2, h/2, 78, 0, Math.PI*2); ctx.stroke();
      ctx.globalCompositeOperation = 'destination-out';
      const g = ctx.createRadialGradient(w/2, h/2, 60, w/2, h/2, 128);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    });
    this.sprites.smoke = this.canvasTexture(256, 256, (ctx, w, h) => {
      for (let i = 0; i < 26; i++){
        const x = w/2 + (Math.random()-.5) * 130;
        const y = h/2 + (Math.random()-.5) * 130;
        const r = 20 + Math.random() * 50;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${0.05 + Math.random()*0.07})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
      }
    });
    this.sprites.shadow = this.canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    });
    this.sprites.flare = this.canvasTexture(256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
      g.addColorStop(0, 'rgba(255,250,235,1)');
      g.addColorStop(0.08, 'rgba(255,240,210,0.85)');
      g.addColorStop(0.3, 'rgba(255,200,140,0.22)');
      g.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,240,220,0.55)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 14; i++){
        const a = Math.random()*Math.PI*2, l = 40 + Math.random()*80;
        ctx.beginPath(); ctx.moveTo(w/2, h/2); ctx.lineTo(w/2+Math.cos(a)*l, h/2+Math.sin(a)*l); ctx.stroke();
      }
    });
  }

  buildFaces(){
    const variants = {
      hero: { brow: 0.06, eyeH: 1.0, mouth: 'smirk', accent: '#37e7ff', sclera: true },
      ally: { brow: 0.10, eyeH: 0.95, mouth: 'smile', accent: '#54f0a4' },
      angry:{ brow: -0.20, eyeH: 0.82, mouth: 'grin', accent: '#ff435c' },
      smug: { brow: -0.10, eyeH: 0.72, mouth: 'smirk', accent: '#ffb648' },
      wild: { brow: -0.24, eyeH: 1.05, mouth: 'grin', accent: '#c37dff' },
      big:  { brow: 0.12, eyeH: 1.24, mouth: 'grin', accent: '#37e7ff', sparkle: true, sclera: true },
      squint:{ brow: 0.14, eyeH: 0.34, mouth: 'grin', accent: '#ffb648' },
      wink: { brow: 0.04, eyeH: 1.12, mouth: 'smirk', accent: '#ff8fb4', wink: true, sclera: true },
      fierce:{ brow: -0.28, eyeH: 0.6, mouth: 'grin', accent: '#f2545b' },
      specs:{ brow: 0.08, eyeH: 0.78, mouth: 'smile', accent: '#7fd8ff', sclera: true },
    };
    for (const [key, v] of Object.entries(variants)){
      this.faces[key] = this.canvasTexture(512, 512, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        // brows
        ctx.strokeStyle = '#22333d'; ctx.lineCap = 'round';
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(128, 188 + v.brow * 120); ctx.quadraticCurveTo(176, 150 + v.brow * 60, 224, 170 + v.brow * 100);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(384, 188 + v.brow * 120); ctx.quadraticCurveTo(336, 150 + v.brow * 60, 288, 170 + v.brow * 100);
        ctx.stroke();
        // eyes
        const eyeH = 142 * v.eyeH;
        for (const cx of [170, 342]){
          if (v.wink && cx === 170){
            ctx.strokeStyle = '#10202a'; ctx.lineWidth = 18; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx - 38, 276); ctx.quadraticCurveTo(cx, 314, cx + 38, 276); ctx.stroke();
            continue;
          }
          if (v.sclera){
            ctx.fillStyle = '#fffdf8';
            ctx.beginPath();
            ctx.ellipse(cx, 276, 71, eyeH / 2 + 7, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          const g = ctx.createRadialGradient(cx, 284, 8, cx, 276, 84);
          g.addColorStop(0, '#07121a');
          g.addColorStop(0.38, '#103a58');
          g.addColorStop(0.62, '#1f7fce');
          g.addColorStop(0.84, '#5cc6fb');
          g.addColorStop(1, '#a4e9ff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(cx, 276, 67, eyeH / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          // highlights
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          ctx.beginPath(); ctx.ellipse(cx - 20, 246, 18, 23, -0.3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(190,245,255,.55)';
          ctx.beginPath(); ctx.ellipse(cx + 19, 306, 9, 11, 0.4, 0, Math.PI * 2); ctx.fill();
        }
        if (v.sparkle){
          ctx.fillStyle = 'rgba(255,255,255,.95)';
          for (const [sx, sy, r] of [[146, 228, 7], [370, 232, 5], [258, 204, 4]]){
            ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
          }
        }
        // blush
        ctx.fillStyle = 'rgba(255,120,120,.18)';
        ctx.beginPath(); ctx.ellipse(118, 350, 36, 18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(394, 350, 36, 18, 0, 0, Math.PI * 2); ctx.fill();
        // mouth
        ctx.strokeStyle = '#1a2a33'; ctx.lineWidth = 14; ctx.lineCap = 'round';
        if (v.mouth === 'grin'){
          ctx.beginPath(); ctx.moveTo(212, 372); ctx.quadraticCurveTo(256, 414, 300, 372);
          ctx.quadraticCurveTo(256, 426, 212, 372); ctx.fillStyle = '#38151c'; ctx.fill();
          ctx.strokeStyle = '#101a20'; ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.fillRect(228, 377, 20, 9); ctx.fillRect(262, 379, 20, 9);
        } else if (v.mouth === 'smile'){
          ctx.beginPath(); ctx.moveTo(220, 376); ctx.quadraticCurveTo(256, 406, 292, 376); ctx.stroke();
        } else if (v.mouth === 'smirk'){
          ctx.beginPath(); ctx.moveTo(224, 382); ctx.quadraticCurveTo(268, 404, 300, 374); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(226, 384); ctx.lineTo(286, 384); ctx.stroke();
        }
      });
    }
  }

  buildDecals(){
    // paper poster A
    this.decals.poster1 = this.canvasTexture(512, 720, (ctx, w, h) => {
      ctx.fillStyle = '#d8b887'; ctx.fillRect(0,0,w,h);
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'rgba(255,240,210,.35)'); g.addColorStop(1,'rgba(80,50,20,.35)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle = '#2b4f5a'; ctx.lineWidth = 10; ctx.strokeRect(26,26,w-52,h-52);
      ctx.fillStyle = '#1d3d49';
      ctx.beginPath(); ctx.arc(w/2, 240, 108, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e8d4ab'; ctx.beginPath(); ctx.arc(w/2, 228, 92, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2e7d94';
      ctx.beginPath(); ctx.ellipse(w/2, 228, 56, 70, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e8d4ab'; ctx.beginPath(); ctx.ellipse(w/2-20, 200, 16, 26, -.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#253c45';
      ctx.font = '700 62px Chakra Petch, sans-serif'; ctx.textAlign='center';
      ctx.fillText('AQUA', w/2, 430);
      ctx.font = '600 30px Chakra Petch, sans-serif';
      ctx.fillText('VILLAGE WATER CO.', w/2, 472);
      ctx.font = '500 20px Chakra Petch, sans-serif';
      ctx.fillText('PURE · PRESSURIZED · LOCAL', w/2, 512);
      ctx.fillStyle = 'rgba(60,120,140,.5)'; ctx.fillRect(60, 570, w-120, 4);
      ctx.font = '700 26px Chakra Petch, sans-serif';
      ctx.fillStyle = '#7c3a2a';
      ctx.fillText('HOLD THE LINE · HOLD SITE A', w/2, 620);
      // grunge
      ctx.globalCompositeOperation = 'multiply';
      for (let i=0;i<60;i++){
        ctx.fillStyle = `rgba(90,70,45,${Math.random()*.12})`;
        ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 8+Math.random()*40, 0, Math.PI*2); ctx.fill();
      }
    });
    // graffiti tag
    this.decals.graffiti = this.canvasTexture(512, 300, (ctx, w, h) => {
      ctx.clearRect(0,0,w,h);
      ctx.strokeStyle = 'rgba(60,220,255,.85)';
      ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(60, 60); ctx.lineTo(60, 240); ctx.lineTo(150, 240);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(210, 150, 55, 0, Math.PI*2); ctx.stroke();
      ctx.save(); ctx.translate(300, 150); ctx.rotate(-0.2);
      ctx.font = '700 130px Chakra Petch, sans-serif'; ctx.fillStyle = 'rgba(255,180,70,.9)';
      ctx.fillText('BC', -40, 45); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 3;
      for (let i=0;i<9;i++){ ctx.beginPath(); ctx.moveTo(20, 20+i*10); ctx.lineTo(w-20, 10+i*10); ctx.stroke(); }
    });
    // hazard stripes
    this.decals.hazard = this.canvasTexture(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#d8a648'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle = '#20272b';
      for (let x=-h; x<w+h; x+=72){
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+36,0); ctx.lineTo(x+36-h,h); ctx.lineTo(x-h,h); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'multiply';
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'rgba(70,50,30,.1)'); g.addColorStop(1,'rgba(40,25,10,.55)');
      ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
    });
    // splash ring (for water on ground)
    this.decals.splash = this.canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0,0,w,h);
      const g = ctx.createRadialGradient(w/2,h/2,10,w/2,h/2,120);
      g.addColorStop(0, 'rgba(200,245,255,.18)');
      g.addColorStop(0.55, 'rgba(140,225,255,.34)');
      g.addColorStop(0.8, 'rgba(90,190,235,.22)');
      g.addColorStop(1, 'rgba(70,150,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w/2,h/2,120,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = 'rgba(220,255,255,.55)'; ctx.lineWidth=2;
      for (let i=0;i<9;i++){
        const a=Math.random()*Math.PI*2, r=40+Math.random()*70;
        ctx.beginPath(); ctx.arc(w/2,h/2,r,a,a+0.5+Math.random()); ctx.stroke();
      }
    });
    // sand footprint/track
    this.decals.tracks = this.canvasTexture(512, 512, (ctx, w, h) => {
      ctx.clearRect(0,0,w,h);
      ctx.strokeStyle = 'rgba(80,58,34,.34)'; ctx.lineWidth = 12; ctx.lineCap='round';
      for (let i=0;i<6;i++){
        ctx.beginPath();
        ctx.moveTo(60 + i*8, 20);
        ctx.bezierCurveTo(100, 160, 40, 320, 90 + i*4, 500);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(80,58,34,.22)'; ctx.lineWidth = 4;
      for (let i=0;i<10;i++){
        ctx.beginPath(); ctx.arc(100+Math.random()*300, 40+Math.random()*430, 3+Math.random()*4, 0, Math.PI*2); ctx.stroke();
      }
    });
    // cloth: striped awning
    const cloth = (c1, c2) => this.canvasTexture(512, 512, (ctx, w, h) => {
      for (let i=0;i<16;i++){
        ctx.fillStyle = i%2 ? c1 : c2;
        ctx.fillRect(i*(w/16), 0, w/16, h);
      }
      ctx.globalCompositeOperation='multiply';
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'rgba(255,255,255,.12)'); g.addColorStop(.6,'rgba(90,60,30,.18)'); g.addColorStop(1,'rgba(60,35,15,.45)');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      for(let i=0;i<90;i++){
        ctx.fillStyle=`rgba(50,35,20,${Math.random()*.15})`;
        ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,2+Math.random()*22,0,Math.PI*2); ctx.fill();
      }
      // ragged bottom edge
      ctx.globalCompositeOperation='destination-out';
      for (let x=0;x<w;x+=16){
        const d = 4 + Math.random()*16;
        ctx.fillRect(x, h-d, 16, d);
      }
    });
    this.decals.clothRed = cloth('#b8453c', '#e8dcc3');
    this.decals.clothTeal = cloth('#2c7a86', '#ddcfa9');
    // rug
    this.decals.rug = this.canvasTexture(512, 512, (ctx,w,h)=>{
      ctx.fillStyle='#7a2f2c'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#d9b06a'; ctx.lineWidth=14; ctx.strokeRect(22,22,w-44,h-44);
      ctx.strokeStyle='#2e5a63'; ctx.lineWidth=6; ctx.strokeRect(52,52,w-104,h-104);
      ctx.fillStyle='#d9b06a';
      for(let y=90;y<h-80;y+=74)
        for(let x=90;x<w-80;x+=74){
          ctx.save(); ctx.translate(x+18,y+18); ctx.rotate(Math.PI/4); ctx.fillRect(-14,-14,28,28); ctx.restore();
        }
      ctx.globalCompositeOperation='multiply';
      for(let i=0;i<50;i++){ctx.fillStyle=`rgba(30,15,10,${Math.random()*.18})`;ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,4+Math.random()*30,0,Math.PI*2);ctx.fill();}
    });
    // billboard / village sign
    this.decals.sign = this.canvasTexture(512, 256, (ctx,w,h)=>{
      ctx.fillStyle='#7c5230'; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#3a2216'; ctx.fillRect(12,12,w-24,h-24);
      ctx.fillStyle='#e6c68a';
      ctx.font='700 64px Chakra Petch, sans-serif'; ctx.textAlign='center';
      ctx.fillText('BUBBLE CLASH', w/2, 105);
      ctx.font='600 30px Chakra Petch, sans-serif';
      ctx.fillText('DUST SECTOR · 沙漠战区', w/2, 155);
      ctx.fillStyle='#37c8e8';
      ctx.fillRect(90, 180, w-180, 6);
      ctx.font='500 20px Chakra Petch, sans-serif'; ctx.fillStyle='#b79b6f';
      ctx.fillText('SEASON 01 · SPLASH PROTOCOL', w/2, 215);
    });
  }

  /* gun surface detail: procedural wear / polymer grain / desert camo.
     Shared by every weapon so eleven fighters add almost no texture cost. */
  buildGunMaps(){
    const grain = (size, base, amp, scratches, speckles) => this.canvasTexture(size, size, (ctx, w, h) => {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++){
        const v = base + (Math.random() - 0.5) * amp;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      ctx.lineCap = 'round';
      for (let i = 0; i < scratches; i++){
        const x = Math.random() * w, y = Math.random() * h;
        const a = Math.random() * Math.PI;
        const l = 6 + Math.random() * 46;
        ctx.strokeStyle = Math.random() > 0.45 ? 'rgba(232,232,232,0.42)' : 'rgba(26,26,26,0.34)';
        ctx.lineWidth = 0.6 + Math.random() * 1.6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        ctx.stroke();
      }
      for (let i = 0; i < speckles; i++){
        const x = Math.random() * w, y = Math.random() * h;
        const r = 0.6 + Math.random() * 2.4;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(240,240,240,0.35)' : 'rgba(20,20,20,0.3)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }, THREE.NoColorSpace);
    const worn = grain(512, 122, 46, 130, 320);
    const polymer = grain(512, 150, 30, 26, 900);
    worn.wrapS = worn.wrapT = THREE.RepeatWrapping;
    polymer.wrapS = polymer.wrapT = THREE.RepeatWrapping;
    worn.repeat.set(2.4, 2.4);
    polymer.repeat.set(3.5, 3.5);

    const camo = this.canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#6f6046'; ctx.fillRect(0, 0, w, h);
      const blobs = [['#4d4a35', 40], ['#8a7a58', 34], ['#3a3d2c', 26], ['#574834', 18]];
      for (const [color, count] of blobs){
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++){
          const x = Math.random() * w, y = Math.random() * h;
          ctx.beginPath();
          for (let k = 0; k < 9; k++){
            const a = (k / 9) * Math.PI * 2;
            const r = 16 + Math.random() * 42;
            const px = x + Math.cos(a) * r * 1.5, py = y + Math.sin(a) * r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 2600; i++){
        ctx.fillStyle = `rgba(30,26,18,${Math.random() * 0.12})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
      }
      ctx.globalCompositeOperation = 'source-over';
    });
    camo.wrapS = camo.wrapT = THREE.RepeatWrapping;
    this.gunMaps = { worn, polymer, camo };
    const decal = (title, sub) => this.canvasTexture(512, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(232,226,208,0.94)';
      ctx.font = '700 56px ui-monospace, Menlo, monospace';
      ctx.fillText(title, 14, 62);
      ctx.font = '500 25px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(190,180,150,0.92)';
      ctx.fillText(sub, 16, 103);
      ctx.fillStyle = 'rgba(190,120,50,0.9)';
      ctx.fillRect(14, 112, 120, 4);
      ctx.fillRect(300, 20, 4, 84);
    });
    this.gunDecals = {
      rifle: decal('M4A1', '5.56 × 45 // CARBINE'),
      sniper: decal('M24', '.300 WM // DMR'),
      smg: decal('MP5', '9 × 19 // PDW'),
    };
  }

  /* build a reusable PBR material */
  makePBR(name, { repeat = [1,1], color = 0xffffff, roughness = 0.9, metalness = 0.0,
    normalScale = 1, roughnessScale = 1, useAo = true } = {}){
    const set = this.textures[name];
    if (!set) return new THREE.MeshStandardMaterial({ color });
    const map = set.map.clone();
    const normalMap = set.normalMap.clone();
    const arm = set.arm.clone();
    map.needsUpdate = normalMap.needsUpdate = arm.needsUpdate = true;
    for (const t of [map, normalMap, arm]){
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat[0], repeat[1]);
      t.anisotropy = this.maxAniso;
    }
    const mat = new THREE.MeshStandardMaterial({
      map, normalMap, roughnessMap: arm, metalnessMap: arm,
      aoMap: useAo ? arm : null,
      color, roughness, metalness,
      normalScale: new THREE.Vector2(normalScale, normalScale),
      roughness: roughnessScale,
    });
    mat.roughness = roughnessScale;
    mat.metalness = metalness;
    mat.color.set(color);
    return mat;
  }
}
