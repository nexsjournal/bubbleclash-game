import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldUVBox, addBox, plane, decalTextureMaterial } from './materials.js';

/* ============================================================
   BUBBLE CLASH ARENA — desert village built for the water-rifle skirmish
   ============================================================ */
export class VillageMap {
  constructor(scene, M, assets){
    this.scene = scene;
    this.M = M;
    this.assets = assets;
    this.root = new THREE.Group();
    this.root.name = 'Village';
    scene.add(this.root);

    this.colliders = [];       // { box:THREE.Box3, tag }
    this.platforms = [];
    this.clothMeshes = [];
    this.waterJets = [];
    this.pavingMats = [];
    this.parkFloaters = [];
    this.waterfallMats = [];
    this.time = 0;

    // T spawn (south) pushes north through mid / long / catwalk toward A site
    this.playerSpawn = new THREE.Vector3(-2.4, 0, 21);
    this.allySpawn = new THREE.Vector3(-6.2, 0, 22.2);
    this.playerSpawnYaw = 0;
    this.enemySpawns = [
      new THREE.Vector3(0, 0, -21), new THREE.Vector3(-12, 0, -21),
      new THREE.Vector3(12, 0, -21), new THREE.Vector3(-8, 0, -18),
      new THREE.Vector3(8, 0, -18), new THREE.Vector3(0, 0, -18.5),
    ];
    this.patrolPoints = [
      new THREE.Vector3(0, 0, -12), new THREE.Vector3(29, 0, -12),
      new THREE.Vector3(29, 0, 14), new THREE.Vector3(-11, 0, -2),
      new THREE.Vector3(-11, 0, 10), new THREE.Vector3(0, 0, 8),
      new THREE.Vector3(0, 0, 18), new THREE.Vector3(-18, 0, 2),
    ];
    this.bounds = { minX: -44, maxX: 44, minZ: -40, maxZ: 40 };
  }

  /* ---------------- collision helpers ---------------- */
  solid(x, y0, z, w, h, d, tag = 'static', cast = true){
    const box = new THREE.Box3(
      new THREE.Vector3(x - w / 2, y0, z - d / 2),
      new THREE.Vector3(x + w / 2, y0 + h, z + d / 2)
    );
    this.colliders.push({ box, tag });
    this.platforms.push(box);
    return box;
  }

  /* ---------------- primitives ---------------- */
  box(w, h, d, mat, scale = 0){
    const geo = scale > 0 ? worldUVBox(w, h, d, scale) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  add(mesh, x, y, z, ry = 0, parent = this.root){
    mesh.position.set(x, y, z);
    if (ry) mesh.rotation.y = ry;
    parent.add(mesh);
    return mesh;
  }

  build(){
    this.buildGround();
    this.buildPerimeter();
    this.buildGatehouse();
    this.buildEastHouse();
    this.buildWestHouse();
    this.buildMinaret();
    this.buildMarketHall();
    this.buildLongBlock();
    this.buildSmallHouses();
    this.buildWaterTower();
    this.buildMarketStalls();
    this.buildCrateFields();
    this.buildLowWalls();
    this.buildSandbags();
    this.buildPalms();
    this.buildProps();
    this.buildPlazaDressing();
    this.buildCloth();
    this.buildPowerLines();
    this.buildWallDecals();
    this.buildGroundDetails();
    this.buildDustLayout();
    return this;
  }

  /* ================= GROUND ================= */
  buildGround(){
    const M = this.M;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 80, 80), M.sand);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    // gentle dune-like undulation away from the arena
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++){
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      const t = Math.max(0, (d - 55) / 60);
      pos.setZ(i, (Math.sin(x * 0.075) * Math.cos(y * 0.06) * 1.4 + Math.sin(x * 0.19 + y * 0.11) * 0.5) * t);
    }
    ground.geometry.computeVertexNormals();
    this.root.add(ground);

    // stone paving — plaza + building aprons
    const paveMat = M.sandstone.clone();
    paveMat.onBeforeCompile = () => {};
    paveMat.customProgramCacheKey = () => 'paving';
    paveMat.map = M.sandstone.map.clone();
    paveMat.normalMap = M.sandstone.normalMap.clone();
    paveMat.roughnessMap = M.sandstone.roughnessMap.clone();
    paveMat.aoMap = paveMat.roughnessMap;
    for (const t of [paveMat.map, paveMat.normalMap, paveMat.roughnessMap]){
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.needsUpdate = true;
    }
    paveMat.color.set(0xd6bd92);
    paveMat.normalScale = new THREE.Vector2(0.7, 0.7);
    this.pavingMats.push(paveMat);

    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(34, 30), paveMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.015, 4.5);
    plaza.receiveShadow = true;
    this.root.add(plaza);

    const apronA = new THREE.Mesh(new THREE.PlaneGeometry(22, 12), paveMat);
    apronA.rotation.x = -Math.PI / 2;
    apronA.position.set(27, 0.016, -11);
    apronA.receiveShadow = true;
    this.root.add(apronA);

    const apronB = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), paveMat);
    apronB.rotation.x = -Math.PI / 2;
    apronB.position.set(-27, 0.016, -10);
    apronB.receiveShadow = true;
    this.root.add(apronB);

    // circular inlay around the well
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x8f7a58, roughness: 0.72, metalness: 0.05 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 7.1, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, 7);
    ring.receiveShadow = true;
    this.root.add(ring);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(8.6, 9.05, 64), ringMat);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(0, 0.028, 7);
    ring2.receiveShadow = true;
    this.root.add(ring2);

    const spokes = new THREE.Group();
    for (let i = 0; i < 12; i++){
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.2), ringMat);
      g.rotation.x = -Math.PI / 2;
      g.rotation.z = (i / 12) * Math.PI * 2;
      g.position.set(Math.cos(i / 12 * Math.PI * 2) * 7.8, 0.029, 7 + Math.sin(i / 12 * Math.PI * 2) * 7.8);
      g.receiveShadow = true;
      spokes.add(g);
    }
    this.root.add(spokes);

    // paving border strips along buildings
    const strips = [
      [-33, 0.018, -2, 4, 18], [33, 0.018, -14, 4, 14],
      [-10, 0.018, -18, 16, 4], [10, 0.018, 16, 3, 12],
    ];
    for (const [x, y, z, w, d] of strips){
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paveMat);
      s.rotation.x = -Math.PI / 2; s.position.set(x, y, z); s.receiveShadow = true;
      this.root.add(s);
    }

    // worn processional path from the south gate into the plaza
    const path = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 15), paveMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.019, 26.5);
    path.receiveShadow = true;
    this.root.add(path);
    for (let i = 0; i < 14; i++){
      for (const sx of [-1, 1]){
        const kerb = this.box(0.34, 0.16, 0.9, M.sandstoneLight, 1);
        kerb.position.set(sx * 2.35, 0.08, 19.5 + i * 1.05);
        kerb.rotation.y = (Math.random() - 0.5) * 0.1;
        this.root.add(kerb);
      }
    }
  }

  /* ================= PERIMETER ================= */
  buildPerimeter(){
    const M = this.M;
    const wallMat = M.plasterTan;
    const h = 9;
    const thick = 1.6;
    // north (with gate opening handled by gatehouse sitting in front)
    this.add(this.box(88, h, thick, wallMat, 3), 0, h / 2, -41);
    this.solid(0, 0, -41, 88, h, thick, 'wall');
    // south
    this.add(this.box(88, h, thick, wallMat, 3), 0, h / 2, 41);
    this.solid(0, 0, 41, 88, h, thick, 'wall');
    // east / west
    this.add(this.box(thick, h, 82, wallMat, 3), 44, h / 2, 0);
    this.solid(44, 0, 0, thick, h, 82, 'wall');
    this.add(this.box(thick, h, 82, wallMat, 3), -44, h / 2, 0);
    this.solid(-44, 0, 0, thick, h, 82, 'wall');

    // trims + parapets
    const trim = M.sandstoneLight;
    const addTrim = (x, z, w, d) => {
      this.add(this.box(w, 0.45, d, trim), x, h - 0.5, z);
      this.add(this.box(w, 0.35, d, M.plasterOchre), x, h * 0.45, z);
    };
    addTrim(0, -40.2, 88, 2.0);
    addTrim(0, 40.2, 88, 2.0);
    addTrim(43.2, 0, 2.0, 82);
    addTrim(-43.2, 0, 2.0, 82);

    // south wall — the backdrop behind the spawn. Buttresses, a battlement
    // skyline and arrow slits stop it reading as one flat tan plane.
    for (let i = -3; i <= 3; i++){
      const px = i * 12.4;
      const pil = this.box(1.05, h + 0.9, 0.7, M.sandstone);
      pil.position.set(px, (h + 0.9) / 2, 40.35);
      pil.receiveShadow = true;
      this.root.add(pil);
      const cap = this.box(1.35, 0.3, 0.95, trim);
      cap.position.set(px, h + 0.82, 40.35);
      this.root.add(cap);
    }
    for (let i = -18; i <= 18; i++){
      const merlon = this.box(1.15, 0.85, 0.75, M.plasterOchre);
      merlon.position.set(i * 2.45, h + 0.42, 40.4);
      this.root.add(merlon);
    }
    for (let i = 0; i < 6; i++){
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 1.25), M.black);
      slit.position.set(-30 + i * 12, 5.6, 40.17);
      slit.rotation.y = Math.PI;
      this.root.add(slit);
    }

    // corner towers
    for (const [x, z] of [[-44, -41], [44, -41], [-44, 41], [44, 41]]){
      const t = this.box(9, 14, 9, M.sandstone, 3);
      this.add(t, x, 7, z);
      this.solid(x, 0, z, 9, 14, 9, 'tower');
      this.add(this.box(9.6, 0.6, 9.6, trim), x, 14.2, z);
      // crenellations
      for (let i = 0; i < 5; i++){
        for (let j = 0; j < 5; j++){
          if (i > 0 && i < 4 && j > 0 && j < 4) continue;
          if ((i + j) % 2 === 0) continue;
          this.add(this.box(1.1, 1.1, 1.1, M.sandstoneLight), x - 3.4 + i * 1.7, 15, z - 3.4 + j * 1.7);
        }
      }
      // dark windows
      for (let i = 0; i < 3; i++){
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), M.black);
        w.position.set(x, 9 + i * 1.8, z + (z < 0 ? 4.52 : -4.52));
        if (z > 0) w.rotation.y = Math.PI;
        this.root.add(w);
      }
    }

    // broken section on the east wall
    const gap = new THREE.Group();
    for (let i = 0; i < 8; i++){
      const b = this.box(2.2, 0.9 + Math.random() * 1.8, 1.4, M.plasterOchre, 2);
      b.position.set(31 + Math.random() * 2, 0.45 + Math.random() * 0.5, -25 + i * 1.2);
      b.rotation.set(Math.random() * 0.2, Math.random() * 0.4, Math.random() * 0.15);
      gap.add(b);
    }
    this.root.add(gap);

    // wall edge wear: exposed sandstone base
    const base = new THREE.Mesh(new THREE.BoxGeometry(88, 1.2, 1.75), M.sandstone);
    base.position.set(0, 0.6, -41);
    base.receiveShadow = true; this.root.add(base);
  }

  /* ================= GATEHOUSE ================= */
  buildGatehouse(){
    const M = this.M;
    const g = new THREE.Group();
    const x = 0, z = -32;
    const w = 26, d = 8.5, h = 11;

    // side blocks
    for (const sx of [-1, 1]){
      const bw = 9.4;
      const body = this.box(bw, h, d, M.plasterCream, 3.4);
      body.position.set(x + sx * (w / 2 - bw / 2 + 0.2), h / 2, z);
      g.add(body);
      this.solid(x + sx * (w / 2 - bw / 2 + 0.2), 0, z, bw, h, d, 'building');
      // upper band
      const band = this.box(bw + 0.3, 1.0, d + 0.3, M.plasterTan, 3);
      band.position.set(body.position.x, h - 1.2, z);
      g.add(band);
      // crenellations
      for (let i = 0; i < 4; i++){
        const cr = this.box(1.5, 1.2, 1.1, M.plasterCream, 1);
        cr.position.set(body.position.x - bw / 2 + 1.2 + i * 2.4, h + 0.6, z + d / 2 - 0.8);
        g.add(cr);
      }
    }

    // arch facade using an extruded shape with an arched hole
    const archW = 4.4, archH = 5.6;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(w / 2, h);
    shape.lineTo(-w / 2, h); shape.lineTo(-w / 2, 0);
    const hole = new THREE.Path();
    hole.moveTo(-archW / 2, 0);
    hole.lineTo(-archW / 2, archH - archW / 2);
    hole.absarc(0, archH - archW / 2, archW / 2, Math.PI, 0, true);
    hole.lineTo(archW / 2, 0);
    hole.lineTo(-archW / 2, 0);
    shape.holes.push(hole);
    const archGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.7, bevelEnabled: false, curveSegments: 24 });
    archGeo.translate(0, 0, -0.85);
    const archMat = M.sandstone.clone();
    archMat.map = M.sandstone.map.clone(); archMat.normalMap = M.sandstone.normalMap.clone();
    archMat.roughnessMap = M.sandstone.roughnessMap.clone(); archMat.aoMap = archMat.roughnessMap;
    for (const t of [archMat.map, archMat.normalMap, archMat.roughnessMap]){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.22, 0.22); t.needsUpdate = true; }
    const arch = new THREE.Mesh(archGeo, archMat);
    arch.castShadow = true; arch.receiveShadow = true;
    arch.position.set(x, 0, z + d / 2 - 0.4);
    g.add(arch);

    // arch trim
    const trimMat = M.sandstoneLight;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(archW / 2 + 0.18, 0.16, 8, 32, Math.PI), trimMat);
    trim.position.set(x, archH - archW / 2, z + d / 2 + 0.52);
    trim.castShadow = true;
    g.add(trim);
    for (const sx of [-1, 1]){
      const col = this.box(0.36, archH - archW / 2 + 0.3, 0.4, trimMat);
      col.position.set(x + sx * (archW / 2 + 0.2), (archH - archW / 2) / 2, z + d / 2 + 0.52);
      g.add(col);
    }

    // facade relief: plinth course, flanking pilasters and a crowning cornice
    for (const sx of [-1, 1]){
      const plinth = this.box((w - archW) / 2, 1.1, 0.55, M.sandstone);
      plinth.position.set(x + sx * (archW / 2 + (w - archW) / 4), 0.55, z + d / 2 + 0.55);
      plinth.receiveShadow = true;
      g.add(plinth);
    }
    for (const sx of [-1, 1]){
      const pil = this.box(0.95, 10.3, 0.5, M.sandstone);
      pil.position.set(x + sx * 5.15, 6.25, z + d / 2 + 0.55);
      pil.castShadow = true;
      g.add(pil);
      const pcap = this.box(1.2, 0.32, 0.7, trimMat);
      pcap.position.set(x + sx * 5.15, 10.5, z + d / 2 + 0.6);
      g.add(pcap);
      const blush = this.box(0.62, 0.55, 0.16, M.plasterTan);
      blush.position.set(x + sx * 5.15, 1.5, z + d / 2 + 0.82);
      g.add(blush);
    }
    const cornice = this.box(w + 0.5, 0.42, 0.62, trimMat);
    cornice.position.set(x, h - 0.42, z + d / 2 + 0.6);
    g.add(cornice);

    // sunlit desert vista seen through the gate passage
    const pc = document.createElement('canvas');
    pc.width = 512; pc.height = 320;
    const px = pc.getContext('2d');
    const sky = px.createLinearGradient(0, 0, 0, 210);
    sky.addColorStop(0, '#6f9fc4'); sky.addColorStop(0.55, '#cfd8cf'); sky.addColorStop(1, '#f4dcb2');
    px.fillStyle = sky; px.fillRect(0, 0, 512, 210);
    const sun = px.createRadialGradient(360, 110, 4, 360, 110, 110);
    sun.addColorStop(0, 'rgba(255,248,222,1)'); sun.addColorStop(0.3, 'rgba(255,236,190,.55)'); sun.addColorStop(1, 'rgba(255,220,160,0)');
    px.fillStyle = sun; px.fillRect(0, 0, 512, 210);
    px.fillStyle = '#d9b984'; px.beginPath();
    px.moveTo(0, 178); px.bezierCurveTo(120, 150, 220, 192, 320, 170); px.bezierCurveTo(400, 152, 460, 186, 512, 168);
    px.lineTo(512, 320); px.lineTo(0, 320); px.closePath(); px.fill();
    px.fillStyle = '#cba267'; px.beginPath();
    px.moveTo(0, 205); px.bezierCurveTo(140, 186, 250, 220, 360, 204); px.bezierCurveTo(430, 194, 470, 214, 512, 206);
    px.lineTo(512, 320); px.lineTo(0, 320); px.closePath(); px.fill();
    // distant palms
    px.fillStyle = '#6b5a3e';
    for (const [tx, th] of [[90, 62], [126, 46], [420, 54]]){
      px.fillRect(tx, 196 - th, 5, th);
      for (let i = 0; i < 7; i++){
        const a = -Math.PI + i * Math.PI / 6;
        px.save(); px.translate(tx + 2, 196 - th); px.rotate(a);
        px.beginPath(); px.ellipse(16, 0, 18, 3.2, 0, 0, Math.PI * 2); px.fill(); px.restore();
      }
    }
    // low tents
    px.fillStyle = '#b98f5c';
    for (const [tx, tw] of [[250, 46], [320, 34]]){
      px.beginPath(); px.moveTo(tx - tw / 2, 225); px.lineTo(tx, 225 - tw * 0.42); px.lineTo(tx + tw / 2, 225); px.closePath(); px.fill();
    }
    const portalTex = new THREE.CanvasTexture(pc);
    portalTex.colorSpace = THREE.SRGBColorSpace;
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 6.6), new THREE.MeshBasicMaterial({ map: portalTex }));
    portal.position.set(x, 3.3, z - 6.2);
    this.root.add(portal);

    // passage floor receding to the desert
    const passFloor = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.4), M.sand);
    passFloor.rotation.x = -Math.PI / 2;
    passFloor.position.set(x, 0.012, z - 3.0);
    this.root.add(passFloor);
    this.solid(-w / 4 - archW / 4, 0, z, w / 2 - archW / 2, h, d, 'building');
    this.solid(w / 4 + archW / 4, 0, z, w / 2 - archW / 2, h, d, 'building');
    // lintel above passage (character can walk under)
    this.solid(0, archH, z, archW, h - archH, d, 'building');

    // wooden door leaves folded open
    for (const sx of [-1, 1]){
      const leaf = this.box(0.12, 4.0, 1.9, M.woodDark);
      leaf.position.set(x + sx * (archW / 2 - 0.25), 2.0, z + d / 2 + 0.6);
      leaf.rotation.y = sx * 0.9;
      g.add(leaf);
    }

    // small windows + shutters on the side blocks (flush with the arch facade)
    const faceZ = z + d / 2 + 0.46;
    for (const sx of [-1, 1]){
      const wx = x + sx * 8;
      for (let row = 0; row < 2; row++){
        const win = this.makeWindow(1.15, 1.7, { grille: row === 0 });
        win.position.set(wx, 4.2 + row * 3.0, faceZ);
        g.add(win);
      }
      // upper blind window above the banners
      const deco = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.35), M.black);
      deco.position.set(wx, 9.85, faceZ - 0.02);
      g.add(deco);
      const decoArch = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 5, 12, Math.PI), M.sandstoneLight);
      decoArch.position.set(wx, 10.53, faceZ);
      g.add(decoArch);
    }

    // roof terrace
    this.add(this.box(w + 0.6, 0.5, d + 0.8, M.sandstone), x, h + 0.1, z, 0, g);
    // rooftop crates and a water tank
    const c1 = this.makeCrate(1.5, M); c1.position.set(-4, h + 0.35 + 0.75, z + 1.2); g.add(c1);
    const c2 = this.makeCrate(1.2, M); c2.position.set(-2.3, h + 0.35 + 0.6, z + 1.0); c2.rotation.y = 0.4; g.add(c2);

    // gate sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), decalTextureMaterial(this.assets.decals.sign, 1));
    sign.position.set(x, 7.2, faceZ + 0.08);
    g.add(sign);

    // ceremonial banners on the side blocks
    for (const sx of [-1, 1]){
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 4.0, 5, 10), sx < 0 ? M.clothRed : M.clothTeal);
      ban.position.set(x + sx * 11.2, 7.2, faceZ + 0.05);
      g.add(ban);
      this.clothMeshes.push({ mesh: ban, base: ban.geometry.attributes.position.array.slice(), amp: 0.09, speed: 0.85 });
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6), M.brass);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(ban.position.x, 9.22, faceZ + 0.08);
      g.add(rod);
      const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), M.brass);
      emblem.position.set(ban.position.x, 7.5, faceZ + 0.09);
      g.add(emblem);
      // arrow slits and blind arcade
      for (let i = 0; i < 3; i++){
        const bx = ban.position.x + sx * (-1.15 + i * 1.15);
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 1.3), M.black);
        slit.position.set(bx, 8.4, faceZ + 0.01);
        g.add(slit);
        const arch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.075, 5, 12, Math.PI), M.sandstoneLight);
        arch.position.set(bx, 9.0, faceZ + 0.02);
        g.add(arch);
      }
    }

    // palm + pots flanking the gate
    this.root.add(g);
  }

  /* ================= EAST HOUSE ================= */
  buildEastHouse(){
    const M = this.M;
    const g = new THREE.Group();
    const x = 30, z = -24, w = 15, d = 14, h = 9;
    const body = this.box(w, h, d, M.plasterOchre, 3.4);
    body.position.set(x, h / 2, z); g.add(body);
    this.solid(x, 0, z, w, h, d, 'building');

    // upper floor lighter band + parapet
    this.add(this.box(w + 0.4, 2.2, d + 0.4, M.plasterCream, 3.2), x, h - 0.7, z, 0, g);
    this.add(this.box(w + 0.8, 0.5, d + 0.8, M.sandstone), x, h + 0.25, z, 0, g);
    for (let i = 0; i < 7; i++){
      const cr = this.box(1.3, 1.1, 0.6, M.plasterCream, 1);
      cr.position.set(x - w / 2 + 1.6 + i * 2.1, h + 0.8, z + d / 2 - 0.4);
      g.add(cr);
    }

    // south-facing arched openings (decor)
    for (let i = -1; i <= 1; i++){
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), M.windowGlass);
      win.position.set(x + i * 4.0, 4.4, z + d / 2 + 0.03);
      g.add(win);
      const top = new THREE.Mesh(new THREE.CircleGeometry(1.0, 20, 0, Math.PI), M.windowGlass);
      top.position.set(x + i * 4.0, 5.9, z + d / 2 + 0.035);
      g.add(top);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.1, 6, 20, Math.PI), M.sandstoneLight);
      trim.position.set(x + i * 4.0, 5.9, z + d / 2 + 0.1);
      g.add(trim);
      const frameL = this.box(0.16, 3.0, 0.2, M.sandstoneLight);
      frameL.position.set(x + i * 4.0 - 1.06, 4.4, z + d / 2 + 0.08); g.add(frameL);
      const frameR = frameL.clone(); frameR.position.x = x + i * 4.0 + 1.06; g.add(frameR);
    }

    // wooden balcony
    const balc = new THREE.Group();
    this.add(this.box(8, 0.25, 1.8, M.woodDark), 0, 6.4, 0, 0, balc);
    for (let i = 0; i < 10; i++){
      this.add(this.box(0.12, 0.9, 0.12, M.woodDark), -3.8 + i * 0.85, 6.95, 0.8, 0, balc);
    }
    this.add(this.box(8, 0.14, 0.14, M.woodDark), 0, 7.4, 0.8, 0, balc);
    for (const sx of [-1, 1]){
      this.add(this.box(0.2, 6.4, 0.2, M.woodDark), sx * 3.8, 3.2, 0.8, 0, balc);
    }
    balc.position.set(x, 0, z + d / 2);
    g.add(balc);

    // laundry line + hanging cloths
    for (let i = 0; i < 4; i++){
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.7, 4, 4), i % 2 ? M.clothRed : M.clothTeal);
      cl.position.set(x - 4 + i * 2.0, 5.6, z + d / 2 + 0.9);
      cl.rotation.y = 0.04;
      g.add(cl);
      this.clothMeshes.push({ mesh: cl, base: cl.geometry.attributes.position.array.slice(), amp: 0.06, speed: 1.0 + i * 0.2 });
    }

    // side shade awning
    const aw = this.makeAwning(5.2, 2.4, M.clothRed, 0.2);
    aw.position.set(x - 5.2, 5.4, z + d / 2 + 1.3);
    aw.rotation.y = 0.12;
    g.add(aw);

    // rooftop clutter
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), M.metalDark);
    dish.rotation.set(Math.PI / 2.6, 0.6, 0);
    dish.position.set(x + 3.5, h + 1.4, z - 2);
    g.add(dish);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 8), M.iron);
    pole.position.set(x + 3.5, h + 0.9, z - 2); g.add(pole);

    // exterior stairs to roof (decorative, shallow steps colliders)
    for (let i = 0; i < 8; i++){
      const st = this.box(2.4, 0.28, 0.8, M.sandstone, 1.5);
      st.position.set(x - w / 2 - 1.2, 0.14 + i * 0.28, z + d / 2 - 1 - i * 0.8);
      g.add(st);
      this.solid(x - w / 2 - 1.2, 0, z + d / 2 - 1 - i * 0.8, 2.4, 0.28 + i * 0.28, 0.8, 'stairs');
    }

    // ground floor doorway
    const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), M.woodDark);
    door.position.set(x + 5, 1.7, z + d / 2 + 0.03); g.add(door);
    const lintel = this.box(2.7, 0.25, 0.25, M.sandstoneLight);
    lintel.position.set(x + 5, 3.6, z + d / 2 + 0.05); g.add(lintel);

    // posters
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1), decalTextureMaterial(this.assets.decals.poster1, 1));
    p1.position.set(x - 2.6, 2.5, z + d / 2 + 0.06); g.add(p1);

    this.root.add(g);
  }

  /* ================= WEST HOUSE ================= */
  buildWestHouse(){
    const M = this.M;
    const g = new THREE.Group();
    const x = -30, z = -22, w = 17, d = 14, h = 8.5;
    const body = this.box(w, h, d, M.plasterTan, 3.4);
    body.position.set(x, h / 2, z); g.add(body);
    this.solid(x, 0, z, w, h, d, 'building');

    this.add(this.box(w + 0.5, 0.5, d + 0.5, M.sandstone), x, h + 0.2, z, 0, g);
    // roof room
    this.add(this.box(6, 3, 5, M.plasterCream, 2.5), x - 4, h + 1.5, z + 2, 0, g);
    this.solid(x - 4, h, z + 2, 6, 3, 5, 'roofroom');

    // big arched entrance
    const arch = new THREE.Group();
    const aw = 3.4, ah = 4.6;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(aw, ah - aw / 2), M.windowGlass);
    win.position.set(0, (ah - aw / 2) / 2, 0);
    arch.add(win);
    const top = new THREE.Mesh(new THREE.CircleGeometry(aw / 2, 24, 0, Math.PI), M.windowGlass);
    top.position.set(0, ah - aw / 2, 0.001);
    arch.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(aw / 2 + 0.16, 0.14, 8, 28, Math.PI), M.sandstoneLight);
    ring.position.set(0, ah - aw / 2, 0.02);
    arch.add(ring);
    for (const sx of [-1, 1]){
      const col = this.box(0.34, ah - aw / 2, 0.3, M.sandstoneLight);
      col.position.set(sx * (aw / 2 + 0.18), (ah - aw / 2) / 2, 0.02);
      arch.add(col);
    }
    arch.position.set(x + 2, 0, z + d / 2 + 0.04);
    g.add(arch);

    // wooden door in arch
    const door = this.box(aw - 0.2, ah - aw / 2 - 0.1, 0.15, M.woodDark);
    door.position.set(x + 2, (ah - aw / 2 - 0.1) / 2, z + d / 2 + 0.16);
    g.add(door);
    for (let i = 0; i < 4; i++){
      const plank = this.box(0.06, ah - aw / 2 - 0.4, 0.06, M.iron);
      plank.position.set(x + 2 - 1.2 + i * 0.8, 1.8, z + d / 2 + 0.26);
      g.add(plank);
    }

    // windows with iron grilles
    for (let i = 0; i < 3; i++){
      const wx = x - 5 + i * 3.2;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), M.black);
      win.position.set(wx, 5.6, z + d / 2 + 0.04);
      g.add(win);
      for (let b = 0; b < 3; b++){
        const bar = this.box(0.05, 1.6, 0.06, M.iron);
        bar.position.set(wx - 0.4 + b * 0.4, 5.6, z + d / 2 + 0.1); g.add(bar);
      }
      const frame = this.box(1.45, 1.85, 0.08, M.woodDark);
      frame.position.set(wx, 5.6, z + d / 2 + 0.01); g.add(frame);
      // hollow out center illusion: dark plane is on top
    }

    // large red awning
    const awn = this.makeAwning(7.5, 3.0, M.clothRed, 0.28);
    awn.position.set(x + 3, 4.9, z + d / 2 + 1.6);
    g.add(awn);

    // market table under awning
    const table = this.makeTable(3.4, 1.4);
    table.position.set(x + 3.4, 0, z + d / 2 + 2.6);
    g.add(table);

    // clay pots by the wall
    for (let i = 0; i < 4; i++){
      const pot = this.makePot(0.35 + i * 0.05, M);
      pot.position.set(x + 7.0, 0, z + d / 2 - 0.4 - i * 0.9);
      g.add(pot);
    }

    // rooftop antenna
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), M.iron);
    ant.position.set(x + 5, h + 2, z - 3); g.add(ant);
    for (let i = 0; i < 3; i++){
      const bar = this.box(1.2, 0.05, 0.05, M.iron);
      bar.position.set(x + 5, h + 2.6 + i * 0.6, z - 3); g.add(bar);
    }

    this.root.add(g);
  }

  /* ================= MINARET / LANDMARK TOWER ================= */
  buildMinaret(){
    const M = this.M;
    const g = new THREE.Group();
    const x = -37, z = -33;
    const widths = [6.2, 5.4, 4.6];
    let y = 0;
    for (let i = 0; i < widths.length; i++){
      const w = widths[i], h = i === 0 ? 8 : 6.5;
      const body = this.box(w, h, w, i % 2 ? M.plasterCream : M.plasterTan, 2.6);
      body.position.set(x, y + h / 2, z); g.add(body);
      this.solid(x, y, z, w, h, w, 'minaret');
      // arched recesses
      for (let f = 0; f < 4; f++){
        const a = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), M.black);
        const off = w / 2 + 0.03;
        const ang = f * Math.PI / 2;
        a.position.set(x + Math.sin(ang) * off, y + h * 0.55, z + Math.cos(ang) * off);
        a.rotation.y = ang;
        g.add(a);
      }
      // balcony
      if (i < widths.length - 1){
        const bal = this.box(w + 1.3, 0.3, w + 1.3, M.sandstoneLight);
        bal.position.set(x, y + h + 0.15, z); g.add(bal);
        for (let b = 0; b < 24; b++){
          const a = b / 24 * Math.PI * 2;
          const post = this.box(0.09, 0.85, 0.09, M.iron);
          post.position.set(x + Math.cos(a) * (w / 2 + 0.55), y + h + 0.7, z + Math.sin(a) * (w / 2 + 0.55));
          g.add(post);
        }
        const rail = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.55, 0.045, 4, 32), M.iron);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(x, y + h + 1.12, z);
        g.add(rail);
      }
      y += h;
    }
    // dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(widths[2] / 2 + 0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.roofDark);
    dome.position.set(x, y, z); dome.castShadow = true; g.add(dome);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.6, 8), M.brass);
    finial.position.set(x, y + widths[2] / 2 + 1.1, z); g.add(finial);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), M.brass);
    orb.position.set(x, y + widths[2] / 2 + 0.3, z); g.add(orb);

    // satellite dish
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.7), M.metalDark);
    dish.rotation.set(Math.PI / 2.2, 0.7, 0);
    dish.position.set(x + 2, y - 0.4, z + 5);
    g.add(dish);

    // hanging banner on tower
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 5.0, 6, 12), M.clothTeal);
    banner.position.set(x + 3.2, 9, z + 3.2);
    banner.rotation.y = Math.PI / 4;
    g.add(banner);
    this.clothMeshes.push({ mesh: banner, base: banner.geometry.attributes.position.array.slice(), amp: 0.16, speed: 0.7 });

    this.root.add(g);
  }

  /* ================= MARKET HALL ================= */
  buildMarketHall(){
    const M = this.M;
    const g = new THREE.Group();
    const x = -27, z = 18;
    // open-sided stone hall
    const base = this.box(15, 1.0, 11, M.sandstone, 2.4);
    base.position.set(x, 0.5, z); g.add(base);
    this.solid(x, 0, z, 15, 1.0, 11, 'plinth');
    // back wall
    const back = this.box(15, 6.0, 0.8, M.plasterTan, 3);
    back.position.set(x, 4, z - 5.1); g.add(back);
    this.solid(x, 1, z - 5.1, 15, 6, 0.8, 'wall');
    // pillars
    for (const px of [-6.4, -2.1, 2.1, 6.4]){
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 5.4, 12), M.sandstone);
      p.position.set(x + px, 3.7, z + 4.4); p.castShadow = true; g.add(p);
      this.solid(x + px, 1, z + 4.4, 0.8, 5.4, 0.8, 'pillar');
      const cap = this.box(0.9, 0.35, 0.9, M.sandstoneLight);
      cap.position.set(x + px, 6.5, z + 4.4); g.add(cap);
    }
    // roof
    this.add(this.box(16, 0.45, 12, M.woodDark), x, 6.9, z, 0, g);
    this.add(this.box(16.5, 0.25, 12.5, M.roof), x, 7.2, z, 0, g);
    // warm bounce-lit ceiling plate: without it the deep roof underside reads black
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x8a6240, roughness: 1, metalness: 0,
      emissive: 0x3a2412, emissiveIntensity: 0.45,
    });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(15.4, 11.2), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(x, 6.66, z);
    g.add(ceil);
    // awnings between pillars
    const a1 = this.makeAwning(7.6, 2.4, M.clothRed, 0.35);
    a1.position.set(x - 3.4, 6.1, z + 5.4); g.add(a1);
    const a2 = this.makeAwning(6.0, 2.2, M.clothTeal, 0.3);
    a2.position.set(x + 4.2, 5.9, z + 5.2); g.add(a2);

    // stalls and goods
    const table = this.makeTable(5.5, 1.5);
    table.position.set(x - 3, 1.0, z + 2.4); g.add(table);
    const table2 = this.makeTable(4.0, 1.3);
    table2.position.set(x + 4.2, 1.0, z + 2.0); g.add(table2);
    // produce baskets
    for (let i = 0; i < 9; i++){
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.26, 12), M.sack);
      basket.position.set(x - 5.2 + (i % 3) * 1.9, 1.35, z + 1.6 + Math.floor(i / 3) * 1.2);
      basket.castShadow = true; g.add(basket);
      for (let j = 0; j < 5; j++){
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6),
          j % 2 ? M.terracottaLight : new THREE.MeshStandardMaterial({ color: 0xc8a63a, roughness: 0.6 }));
        fruit.position.set(basket.position.x + (Math.random() - 0.5) * 0.4, 1.53, basket.position.z + (Math.random() - 0.5) * 0.4);
        g.add(fruit);
      }
    }
    // hanging lanterns
    for (let i = 0; i < 3; i++){
      const l = this.makeLantern();
      l.position.set(x - 4.5 + i * 4.3, 5.4, z + 4.6);
      g.add(l);
    }

    // rugs on back wall
    for (let i = 0; i < 2; i++){
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.0), decalTextureMaterial(this.assets.decals.rug, 1));
      rug.position.set(x - 3.4 + i * 5.2, 3.4, z - 4.68);
      g.add(rug);
    }

    this.root.add(g);
  }

  /* ================= EAST LONG BLOCK ================= */
  buildLongBlock(){
    const M = this.M;
    const g = new THREE.Group();
    const x = 38, z = 6;
    const body = this.box(9, 6.5, 28, M.plasterCream, 3.4);
    body.position.set(x, 3.25, z); g.add(body);
    this.solid(x, 0, z, 9, 6.5, 28, 'building');
    // parapet
    this.add(this.box(9.6, 0.4, 28.6, M.sandstone), x, 6.6, z, 0, g);
    for (let i = 0; i < 12; i++){
      const cr = this.box(1.1, 0.9, 0.55, M.plasterCream, 1);
      cr.position.set(x - 4.3, 7.2, z - 13 + i * 2.3); g.add(cr);
    }
    // west-facing windows + doors + awnings
    for (let i = 0; i < 5; i++){
      const wz = z - 11 + i * 5.5;
      const win = this.makeWindow(1.5, 2.0, { shutterMat: [M.shutterTeal, M.shutterBlue, M.shutterRust][i % 3] });
      win.position.set(x - 4.51, 4.2, wz);
      win.rotation.y = -Math.PI / 2;
      g.add(win);
    }
    // shop awning + table
    const awn = this.makeAwning(5.5, 2.2, M.clothRed, 0.3);
    awn.position.set(x - 5.0, 4.4, z - 4);
    awn.rotation.y = -Math.PI / 2;
    g.add(awn);
    const stall = this.makeTable(4.0, 1.2);
    stall.position.set(x - 6.0, 0, z - 4);
    g.add(stall);
    this.solid(x - 6.0, 0, z - 4, 4.0, 1.2, 1.4, 'stall');

    // south gable face — door, windows, awning so the plaza never reads blank
    const zf = z + 14 + 0.03;
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.2), M.woodDark);
    doorway.position.set(x, 1.6, zf); g.add(doorway);
    const doorArch = new THREE.Mesh(new THREE.CircleGeometry(1.0, 18, 0, Math.PI), M.woodDark);
    doorArch.position.set(x, 3.2, zf); g.add(doorArch);
    const doorTrim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.09, 5, 20, Math.PI), M.sandstoneLight);
    doorTrim.position.set(x, 3.2, zf + 0.05); g.add(doorTrim);
    const doorL = this.box(0.15, 3.2, 0.18, M.sandstoneLight);
    doorL.position.set(x - 1.06, 1.6, zf + 0.04); g.add(doorL);
    const doorR = doorL.clone(); doorR.position.x = x + 1.06; g.add(doorR);
    for (const sx of [-1, 1]){
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.8), M.black);
      win.position.set(x + sx * 2.9, 4.3, zf); g.add(win);
      const shut = this.box(0.55, 1.8, 0.08, M.woodPale);
      shut.position.set(x + sx * 2.9 - sx * 1.0, 4.3, zf + 0.06);
      shut.rotation.y = sx * 0.16; g.add(shut);
      const beam = this.box(1.65, 0.14, 0.14, M.woodDark);
      beam.position.set(x + sx * 2.9, 5.28, zf + 0.05); g.add(beam);
    }
    const awnS = this.makeAwning(4.2, 2.0, M.clothTeal, 0.22);
    awnS.position.set(x - 0.4, 5.9, zf + 1.0);
    awnS.rotation.y = -Math.PI / 2;
    g.add(awnS);
    const potS = this.makePot(0.4, M);
    potS.position.set(x - 2.2, 0, zf + 0.9); g.add(potS);
    const potS2 = this.makePot(0.3, M);
    potS2.position.set(x - 2.9, 0, zf + 0.6); g.add(potS2);

    // rooftop pergola silhouettes
    const perg = new THREE.Group();
    for (const [px, pz] of [[-2.6, -6], [2.6, -6], [-2.6, 2], [2.6, 2]]){
      const post = this.box(0.18, 2.2, 0.18, M.woodDark);
      post.position.set(px + x, 6.5 + 1.1, pz + z);
      perg.add(post);
    }
    const pTop = this.box(6.2, 0.12, 9.2, M.woodPale);
    pTop.position.set(x, 6.5 + 2.2, z - 2); g.add(pTop);
    for (const post of perg.children) g.add(post);
    const clothTop = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 9.0), M.clothRed);
    clothTop.rotation.x = -Math.PI / 2;
    clothTop.position.set(x, 6.5 + 2.27, z - 2);
    g.add(clothTop);
    this.clothMeshes.push({ mesh: clothTop, base: clothTop.geometry.attributes.position.array.slice(), amp: 0.04, speed: 1.1 });

    this.root.add(g);
  }

  /* ================= SMALL HOUSES ================= */
  buildSmallHouses(){
    const M = this.M;
    const houses = [
      { x: 18, z: 14, w: 8, d: 7, h: 5.5, mat: M.plasterTan, ry: 0 },
      { x: -18, z: -6, w: 7, d: 8, h: 6.5, mat: M.plasterCream, ry: 0.3 },
      { x: 22, z: -6, w: 6, d: 6, h: 5, mat: M.plasterOchre, ry: -0.2 },
      { x: -20, z: 7, w: 7, d: 6, h: 4.5, mat: M.plasterTan, ry: 0.1 },
      { x: 6, z: 20, w: 5.5, d: 5, h: 4.2, mat: M.plasterCream, ry: -0.12 },
    ];
    for (const s of houses){
      const g = new THREE.Group();
      if (s.x === 6 && s.z === 20) this.menuHide = g;
      const body = this.box(s.w, s.h, s.d, s.mat, 3);
      body.position.set(0, s.h / 2, 0); g.add(body);
      // weathered stone plinth
      const plinth = this.box(s.w + 0.5, 0.72, s.d + 0.5, M.sandstone, 2);
      plinth.position.set(0, 0.36, 0); g.add(plinth);
      // corner quoins
      for (const qx of [-1, 1]){
        for (const qz of [-1, 1]){
          const quoin = this.box(0.34, s.h, 0.34, M.sandstoneLight, 1.5);
          quoin.position.set(qx * (s.w / 2 - 0.05), s.h / 2, qz * (s.d / 2 - 0.05));
          g.add(quoin);
        }
      }
      // cornice band under the roof
      const cornice = this.box(s.w + 0.65, 0.34, s.d + 0.65, M.sandstoneLight, 2);
      cornice.position.set(0, s.h - 0.28, 0); g.add(cornice);
      // protruding roof beams
      for (let i = 0; i < 5; i++){
        const beam = this.box(0.16, 0.16, s.d + 0.9, M.woodDark);
        beam.position.set(-s.w / 2 + 0.8 + i * ((s.w - 1.6) / 4), s.h - 0.06, 0);
        g.add(beam);
      }
      // roof slab + parapet
      this.add(this.box(s.w + 0.5, 0.4, s.d + 0.5, M.sandstone), 0, s.h + 0.1, 0, 0, g);
      // door
      const doorUnit = this.makeDoor(1.3, 2.3);
      doorUnit.position.set(0, 1.15, s.d / 2 + 0.01);
      g.add(doorUnit);
      // recessed window with shutters (paint varies house to house)
      const shutterMat = [M.shutterTeal, M.shutterBlue, M.shutterRust][Math.abs(Math.round(s.x * 3 + s.z * 7)) % 3];
      const winUnit = this.makeWindow(1.15, 1.45, { shutterMat });
      winUnit.position.set(s.w / 4, s.h - 1.6, s.d / 2 + 0.01);
      g.add(winUnit);
      // side + back windows so every facade reads inhabited
      for (const [wx, wz, ry] of [
        [-s.w / 2 - 0.01, 0, -Math.PI / 2],
        [s.w / 2 + 0.01, 1.0, Math.PI / 2],
        [0, -s.d / 2 - 0.01, Math.PI],
      ]){
        const sw = this.makeWindow(1.0, 1.32, { shutters: false });
        sw.position.set(wx, s.h - 1.7, wz);
        sw.rotation.y = ry;
        g.add(sw);
      }
      // awning on some
      if (s.h > 4.2){
        const a = this.makeAwning(s.w * 0.6, 1.8, Math.random() > .5 ? M.clothRed : M.clothTeal, 0.25);
        a.position.set(0, s.h - 1.0, s.d / 2 + 0.9);
        g.add(a);
      }
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.ry;
      this.root.add(g);
      this.solid(s.x, 0, s.z, s.w + 0.6, s.h, s.d + 0.6, 'building');
    }
  }

  /* ================= WELL / FOUNTAIN ================= */
  buildWell(){
    const M = this.M;
    const g = new THREE.Group();
    const x = 0, z = 7;
    const R = 3.2;
    // masonry ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.12, 0.75, 36, 1, true), M.sandstone);
    ring.position.set(x, 0.375, z); ring.castShadow = true; ring.receiveShadow = true; g.add(ring);
    const cap = new THREE.Mesh(new THREE.RingGeometry(R - 0.45, R + 0.18, 36), M.sandstoneLight);
    cap.rotation.x = -Math.PI / 2; cap.position.set(x, 0.78, z); cap.receiveShadow = true; g.add(cap);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.45, R - 0.45, 0.7, 36, 1, true), M.sandstone);
    inner.position.set(x, 0.35, z); inner.receiveShadow = true; g.add(inner);

    // water
    const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.5, 36), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, 0.62, z);
    water.receiveShadow = true;
    g.add(water);
    this.wellWater = water;

    // stone blocks around rim
    for (let i = 0; i < 22; i++){
      const a = i / 22 * Math.PI * 2;
      const b = this.box(0.9, 0.42, 0.55, M.sandstone, 1);
      b.position.set(x + Math.cos(a) * (R + 0.05), 0.32, z + Math.sin(a) * (R + 0.05));
      b.rotation.y = -a + Math.PI / 2;
      g.add(b);
      // collider ring segments
      this.solid(x + Math.cos(a) * (R + 0.05), 0, z + Math.sin(a) * (R + 0.05), 1.1, 0.8, 0.9, 'well');
    }

    // tiered central fountain
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.82, 0.34, 16), M.sandstone);
    base.position.set(x, 0.79, z); base.castShadow = true; g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.15, 12), M.sandstoneLight);
    shaft.position.set(x, 1.52, z); shaft.castShadow = true; g.add(shaft);
    const midBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.5, 0.16, 20), M.sandstoneLight);
    midBowl.position.set(x, 2.12, z); midBowl.castShadow = true; g.add(midBowl);
    const midWater = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), M.water);
    midWater.rotation.x = -Math.PI / 2; midWater.position.set(x, 2.21, z); g.add(midWater);
    const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.55, 10), M.sandstoneLight);
    shaft2.position.set(x, 2.42, z); g.add(shaft2);
    const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.28, 0.12, 16), M.brass);
    topBowl.position.set(x, 2.73, z); g.add(topBowl);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), M.brass);
    finial.position.set(x, 2.86, z); g.add(finial);

    // four falling water arcs from the top bowl
    const arcMat2 = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < 4; k++){
      const a = k / 4 * Math.PI * 2 + Math.PI / 4;
      const pts = [];
      for (let i = 0; i <= 12; i++){
        const t = i / 12;
        const rr = 0.35 + t * 2.4;
        pts.push(new THREE.Vector3(x + Math.cos(a) * rr, 2.7 - t * t * 2.05, z + Math.sin(a) * rr));
      }
      const arcG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 5, false);
      const arcM = new THREE.Mesh(arcG, arcMat2);
      g.add(arcM);
    }

    // side spout into the basin
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 8), M.brass);
    spout.rotation.z = Math.PI / 2.4;
    spout.position.set(x - 0.45, 2.15, z);
    g.add(spout);
    // water arc from spout
    const arcPts = [];
    for (let i = 0; i <= 14; i++){
      const t = i / 14;
      arcPts.push(new THREE.Vector3(x - 0.8 - t * 1.35, 2.15 + Math.sin(t * Math.PI) * 0.5 - t * t * 1.0, z));
    }
    const arcGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPts), 24, 0.035, 6, false);
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const arc = new THREE.Mesh(arcGeo, arcMat);
    g.add(arc);
    this.spoutArc = arc;

    // water splash particles in the basin
    this.wellDrops = this.makeWaterJet(x - 2.0, 0.7, z, 40, 0.55);

    // pots around
    for (let i = 0; i < 3; i++){
      const p = this.makePot(0.4, M);
      p.position.set(x - 4.5 - i * 0.9, 0, z + 2 + i * 0.8);
      g.add(p);
    }

    this.root.add(g);
  }

  makeWaterJet(x, y, z, count, spread){
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++){
      data.push({ life: Math.random(), speed: 1.2 + Math.random() * 2.2, ox: (Math.random() - .5) * spread, oz: (Math.random() - .5) * spread });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.055, map: this.assets.sprites.water, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcdfbff,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.root.add(pts);
    this.waterJets.push({ pts, data, origin: new THREE.Vector3(x, y, z) });
    return pts;
  }

  /* ================= WATER TOWER ================= */
  buildWaterTower(){
    const M = this.M;
    const g = new THREE.Group();
    const x = -37, z = 3;
    // legs
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]){
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 7.0, 6), M.iron);
      leg.position.set(dx, 3.5, dz); leg.rotation.z = dx * 0.012; leg.castShadow = true;
      g.add(leg);
      this.solid(x + dx, 0, z + dz, 0.45, 7, 0.45, 'leg');
    }
    // cross bracing
    for (let i = 0; i < 3; i++){
      const y = 1.6 + i * 2.0;
      for (const r of [0, Math.PI / 2]){
        const br = this.box(5.2, 0.08, 0.08, M.iron);
        br.position.set(0, y, 0); br.rotation.y = r; br.rotation.z = (i % 2 ? 1 : -1) * 0.25;
        g.add(br);
      }
    }
    // tank
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.4, 24), M.metalPaint);
    tank.position.set(0, 8.8, 0); tank.castShadow = true; g.add(tank);
    this.solid(x, 7.2, z, 5.2, 3.4, 5.2, 'tank');
    const tankTop = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metalPaint);
    tankTop.position.set(0, 10.5, 0); g.add(tankTop);
    for (let i = 0; i < 3; i++){
      const band = new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.06, 4, 32), M.iron);
      band.rotation.x = Math.PI / 2; band.position.set(0, 7.4 + i * 1.2, 0); g.add(band);
    }
    // ladder
    for (const sx of [-0.35, 0.35]){
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 8.6, 6), M.iron);
      rail.position.set(sx, 4.3, 2.75); g.add(rail);
    }
    for (let i = 0; i < 12; i++){
      const rung = this.box(0.75, 0.05, 0.05, M.iron);
      rung.position.set(0, 0.6 + i * 0.7, 2.75); g.add(rung);
    }
    // vent pipe
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.4, 8), M.iron);
    vent.position.set(1.2, 11.8, -0.6); g.add(vent);

    g.position.set(x, 0, z);
    this.root.add(g);
  }

  /* ================= MARKET STALLS ================= */
  buildMarketStalls(){
    const M = this.M;
    const stalls = [
      { x: 12, z: 17, ry: 0.5, cloth: M.clothRed },
      { x: -13, z: 21, ry: 3.6, cloth: M.clothTeal },
    ];
    for (const s of stalls){
      const g = new THREE.Group();
      for (const [dx, dz] of [[-1.8, -1.4], [1.8, -1.4], [-1.8, 1.4], [1.8, 1.4]]){
        const post = this.box(0.14, 2.6, 0.14, M.woodDark);
        post.position.set(dx, 1.3, dz); g.add(post);
      }
      const top = this.makeAwning(4.5, 3.4, s.cloth, 0.4);
      top.position.set(0, 2.9, 0);
      g.add(top);
      const tbl = this.makeTable(3.6, 1.1);
      tbl.position.set(0, 0, 0); g.add(tbl);
      // goods
      for (let i = 0; i < 6; i++){
        const pot = this.makePot(0.16 + Math.random() * 0.14, M);
        pot.position.set(-1.4 + (i % 3) * 1.3, 0.85, -0.35 + Math.floor(i / 3) * 0.7);
        g.add(pot);
      }
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.ry;
      this.root.add(g);
      this.solid(s.x, 0, s.z, 4.4, 1.1, 3.4, 'stall');
    }
  }

  /* ================= CRATES / BARRELS ================= */
  buildCrateFields(){
    const M = this.M;
    const fields = [
      { x: 15, z: -22, n: 7 },
      { x: -17, z: -17, n: 6 },
      { x: -13, z: 4, n: 4 },
      { x: 31, z: 14, n: 6 },
      { x: -31, z: 24, n: 4 },
      { x: 6, z: 25, n: 5 },
      { x: 27, z: -31, n: 4 },
    ];
    for (const f of fields){
      for (let i = 0; i < f.n; i++){
        const size = 1.0 + Math.random() * 0.8;
        const ox = (Math.random() - 0.5) * 4.5;
        const oz = (Math.random() - 0.5) * 4.5;
        const stack = Math.random() < 0.35 && i > 1;
        const centerY = stack ? size * 1.5 + 0.02 : size / 2 + 0.01;
        const c = this.makeCrate(size, M);
        c.position.set(f.x + ox, centerY, f.z + oz);
        c.rotation.y = Math.random() * 0.8 - 0.4;
        this.root.add(c);
        const top = centerY + size / 2;
        this.solid(f.x + ox, 0, f.z + oz, size, top, size, 'crate');
      }
    }
    // barrels
    const barrels = [
      [10, -17, 'metal'], [-14, -19, 'wood'], [3, -4, 'metal'], [24, 8, 'wood'],
      [-22, 2, 'metal'], [17, 22, 'wood'], [-8, 27, 'metal'], [35, -8, 'wood'],
      [-33, -6, 'metal'], [-2, -27, 'wood'],
    ];
    for (const [bx, bz, type] of barrels){
      const b = this.makeBarrel(type === 'metal' ? M.metal : M.woodDark, M);
      b.position.set(bx, 0, bz);
      b.rotation.y = Math.random() * Math.PI;
      this.root.add(b);
      this.solid(bx, 0, bz, 1.2, 1.25, 1.2, 'barrel');
    }
  }

  buildLowWalls(){
    const M = this.M;
    const walls = [
      { x: -10, z: 15, w: 8, h: 1.25, d: 0.7, ry: 0.1 },
      { x: 10, z: 11, w: 7, h: 1.1, d: 0.7, ry: -0.15 },
      { x: 14, z: -16, w: 9, h: 1.4, d: 0.8, ry: 0.45 },
      { x: -16, z: -11, w: 7, h: 1.2, d: 0.7, ry: -0.3 },
      { x: 25, z: 2, w: 6, h: 1.3, d: 0.8, ry: 0.1 },
      { x: -24, z: 13, w: 7, h: 1.1, d: 0.7, ry: 0.5 },
      { x: 30, z: 27, w: 8, h: 1.1, d: 0.7, ry: -0.2 },
    ];
    for (const w of walls){
      const g = new THREE.Group();
      const m = this.box(w.w, w.h, w.d, M.plasterOchre, 2);
      m.position.set(0, w.h / 2, 0); g.add(m);
      const cap = this.box(w.w + 0.2, 0.14, w.d + 0.16, M.sandstoneLight);
      cap.position.set(0, w.h + 0.05, 0); g.add(cap);
      // broken edge blocks
      const ragged = Math.random() < 0.5;
      if (ragged){
        for (let i = 0; i < 3; i++){
          const chunk = this.box(0.4 + Math.random() * 0.5, 0.2 + Math.random() * 0.35, w.d * 0.9, M.plasterTan, 1);
          chunk.position.set(w.w / 2 - 0.3 + i * 0.3, w.h - 0.1 + Math.random() * 0.2, 0);
          chunk.rotation.z = -0.2 - Math.random() * 0.3;
          g.add(chunk);
        }
      }
      g.position.set(w.x, 0, w.z);
      g.rotation.y = w.ry;
      this.root.add(g);
      const cos = Math.abs(Math.cos(w.ry)), sin = Math.abs(Math.sin(w.ry));
      this.solid(w.x, 0, w.z, w.w * cos + w.d * sin, w.h, w.w * sin + w.d * cos, 'lowwall');
    }
  }

  buildSandbags(){
    const M = this.M;
    const lines = [
      { x: -4, z: 30, n: 8, ry: 0.1 },
      { x: 18, z: -27, n: 6, ry: -0.5 },
      { x: -24, z: -27, n: 5, ry: 0.3 },
      { x: 24, z: 23, n: 6, ry: 0.2 },
    ];
    for (const l of lines){
      for (let i = 0; i < l.n; i++){
        for (let row = 0; row < 2; row++){
          const bag = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.38, 0.58, 3, 0.14), M.sack);
          bag.position.set(l.x + Math.cos(l.ry) * (i - l.n / 2) * 0.9, 0.2 + row * 0.36, l.z + Math.sin(l.ry) * (i - l.n / 2) * 0.9 + row * 0.06);
          bag.rotation.y = l.ry + (Math.random() - 0.5) * 0.2;
          bag.castShadow = true; bag.receiveShadow = true;
          this.root.add(bag);
        }
      }
      const w = l.n * 0.9 + 0.5;
      this.solid(l.x, 0, l.z, w * Math.abs(Math.cos(l.ry)) + 0.6 * Math.abs(Math.sin(l.ry)), 0.9, w * Math.abs(Math.sin(l.ry)) + 0.6 * Math.abs(Math.cos(l.ry)), 'sandbags');
    }
  }

  /* ================= PALMS ================= */
  buildPalms(){
    const spots = [
      [-33, 20, 1.2], [-34, -12, 1.1], [33, 20, 1.15], [34, -13, 1.1],
      [-29, -29, 1.0], [28, -30, 1.05], [-13, 31, 0.95], [14, 32, 1.0],
      [-25, 2, 0.85], [26, 0, 0.9], [-39, -37, 0.75], [39, -36, 0.8],
      [-13.6, 4.4, 1.05], [-21.4, 12.6, 0.95], [21.4, 12.2, 1.0], [13.6, 5.6, 0.9],
    ];
    for (const [x, z, scale] of spots){
      const palm = this.makePalm(scale);
      palm.position.set(x, 0, z);
      palm.rotation.y = (x * 1.7 + z * 0.9) % (Math.PI * 2);
      this.root.add(palm);
      this.solid(x, 0, z, 1.0, 8 * scale, 1.0, 'palm');
      // pale sand ring instead of the desert-dark ring
      const ring = new THREE.Mesh(new THREE.CircleGeometry(1.4 * scale, 20),
        new THREE.MeshStandardMaterial({ color: 0xefd9ad, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.021, z);
      this.root.add(ring);
    }
  }

  buildProps(){
    const M = this.M;
    // wooden carts
    for (const [x, z, ry] of [[-8, 22, 0.4], [22, -14, -0.7], [-26, -2, 1.2]]){
      const cart = this.makeCart();
      cart.position.set(x, 0, z);
      cart.rotation.y = ry;
      this.root.add(cart);
      this.solid(x, 0, z, 2.6, 1.4, 1.6, 'cart');
    }
    // hay piles
    for (const [x, z] of [[-33, 28], [30, -34], [-40, -12]]){
      const hay = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), M.hay);
      hay.scale.set(1.2, 0.55, 1.0);
      hay.position.set(x, 0.6, z);
      hay.castShadow = true; hay.receiveShadow = true;
      this.root.add(hay);
      this.solid(x, 0, z, 2.8, 1.2, 2.4, 'hay');
    }
    // wooden pallets / planks
    for (let i = 0; i < 9; i++){
      const plank = this.box(2 + Math.random() * 2, 0.1, 0.35, M.woodDark);
      plank.position.set((Math.random() - 0.5) * 70, 0.06 + Math.random() * 0.1, (Math.random() - 0.5) * 60);
      plank.rotation.y = Math.random() * Math.PI;
      plank.rotation.z = (Math.random() - 0.5) * 0.12;
      this.root.add(plank);
    }
    // stone blocks / rubble — irregular silica chunks, kept clear of spawns
    const clearOf = (x, z) =>
      Math.hypot(x, z - 6) > 9.5 &&
      Math.hypot(x + 2.4, z - 20) > 6.5 &&
      Math.hypot(x + 6, z - 21.2) > 6.5;
    for (let i = 0; i < 26; i++){
      const s = 0.22 + Math.random() * 0.42;
      const geo = new THREE.DodecahedronGeometry(s, 1);
      const vp = geo.attributes.position;
      for (let k = 0; k < vp.count; k++){
        vp.setXYZ(k,
          vp.getX(k) * (0.8 + Math.random() * 0.4),
          vp.getY(k) * (0.66 + Math.random() * 0.34),
          vp.getZ(k) * (0.8 + Math.random() * 0.4));
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, M.rock);
      let tries = 0;
      do {
        rock.position.set((Math.random() - 0.5) * 76, s * 0.5, (Math.random() - 0.5) * 68);
        tries++;
      } while (!clearOf(rock.position.x, rock.position.z) && tries < 24);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.castShadow = true; rock.receiveShadow = true;
      this.root.add(rock);
    }
    // dry shrubs
    for (let i = 0; i < 20; i++){
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + Math.random() * 0.5, 1), M.shrub);
      shrub.scale.y = 0.6;
      let tries = 0;
      do {
        shrub.position.set((Math.random() - 0.5) * 78, 0.25, (Math.random() - 0.5) * 70);
        tries++;
      } while (!clearOf(shrub.position.x, shrub.position.z) && tries < 24);
      this.root.add(shrub);
    }
    // pots along walls / corners
    for (let i = 0; i < 12; i++){
      const side = i % 4;
      let x, z;
      if (side === 0){ x = -42 + Math.random() * 6; z = -36 + Math.random() * 8; }
      else if (side === 1){ x = 40 + Math.random() * 10; z = -34 + Math.random() * 10; }
      else if (side === 2){ x = -42 + Math.random() * 8; z = 30 + Math.random() * 8; }
      else { x = 26 + Math.random() * 12; z = 34 + Math.random() * 6; }
      const pot = this.makePot(0.28 + Math.random() * 0.3, M);
      pot.position.set(x, 0, z);
      this.root.add(pot);
    }
    // hanging lanterns near the gate
    for (let i = 0; i < 2; i++){
      const l = this.makeLantern();
      l.position.set(-8 + i * 16, 6.4, -27.4);
      this.root.add(l);
    }
    // flags on towers
    for (const [x, z, ry] of [[-44, -41, 0.4], [44, -41, -0.6], [-44, 41, 1.2]]){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 6), M.iron);
      pole.position.set(x, 17, z); this.root.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2, 8, 4), M.clothRed);
      flag.position.set(x + 1.2, 19, z); flag.rotation.y = ry;
      this.root.add(flag);
      this.clothMeshes.push({ mesh: flag, base: flag.geometry.attributes.position.array.slice(), amp: 0.22, speed: 1.3 });
    }
  }

  /* ================= PLAZA DRESSING ================= */
  buildPlazaDressing(){
    const M = this.M;
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: 0xff9d3c, emissiveIntensity: 1.6, roughness: 0.45,
    });

    // --- west face of the east house: shuttered windows + shade cloth ---
    const bx = 13.99, bz = 14;
    for (const wz of [12.4, 15.8]){
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.7), M.black);
      win.position.set(bx, 3.5, wz); win.rotation.y = -Math.PI / 2;
      this.root.add(win);
      const frame = this.box(0.14, 0.14, 1.6, M.woodDark);
      frame.position.set(bx - 0.04, 4.42, wz); this.root.add(frame);
      const sill = frame.clone(); sill.position.y = 2.58; this.root.add(sill);
      for (const s of [-1, 1]){
        const shutter = this.box(0.08, 1.7, 0.5, M.woodPale);
        shutter.position.set(bx - 0.06, 3.5, wz + s * 0.88);
        shutter.rotation.x = s * 0.14; this.root.add(shutter);
      }
    }
    const wallRug = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.5, 4, 8), M.clothTeal);
    wallRug.position.set(bx - 0.04, 2.15, bz);
    wallRug.rotation.y = -Math.PI / 2;
    this.root.add(wallRug);
    this.clothMeshes.push({ mesh: wallRug, base: wallRug.geometry.attributes.position.array.slice(), amp: 0.045, speed: 0.7 });
    const wallAwn = this.makeAwning(4.4, 1.9, M.clothRed, 0.28);
    wallAwn.position.set(bx - 1.0, 4.15, bz);
    wallAwn.rotation.y = Math.PI / 2;
    this.root.add(wallAwn);
    const potB = this.makePot(0.32, M);
    potB.position.set(13.4, 0, 12.0); this.root.add(potB);
    const potB2 = this.makePot(0.24, M);
    potB2.position.set(13.3, 0, 16.0); this.root.add(potB2);

    // shop counter tucked against the east wall
    const counter = this.box(0.72, 1.02, 3.8, M.woodDark);
    counter.position.set(13.55, 0.51, bz); this.root.add(counter);
    const counterTop = this.box(0.95, 0.12, 4.0, M.woodPale);
    counterTop.position.set(13.52, 1.08, bz); this.root.add(counterTop);
    for (let i = 0; i < 4; i++){
      const jar = this.makePot(0.17 + (i % 2) * 0.05, M);
      jar.position.set(13.45, 1.14, bz - 1.5 + i * 0.95);
      this.root.add(jar);
    }
    const shelf = this.box(0.34, 0.1, 3.2, M.woodDark);
    shelf.position.set(13.78, 2.1, bz); this.root.add(shelf);
    for (let i = 0; i < 3; i++){
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), M.sack);
      sack.scale.set(1, 0.82, 0.8);
      sack.position.set(13.72, 2.34, bz - 1.0 + i * 1.0);
      sack.castShadow = true; this.root.add(sack);
    }
    const shopSign = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), decalTextureMaterial(this.assets.decals.sign, 1));
    shopSign.position.set(13.9, 3.55, bz);
    shopSign.rotation.y = -Math.PI / 2;
    this.root.add(shopSign);
    // leaning ladder
    const lad = new THREE.Group();
    for (const s of [-1, 1]){
      const railL = this.box(0.08, 3.4, 0.08, M.woodPale);
      railL.position.set(0, 1.7, s * 0.24); lad.add(railL);
    }
    for (let i = 0; i < 7; i++){
      const rung = this.box(0.06, 0.06, 0.5, M.woodPale);
      rung.position.set(0, 0.35 + i * 0.44, 0); lad.add(rung);
    }
    lad.position.set(13.25, 0, bz + 2.35);
    lad.rotation.z = -0.22;
    this.root.add(lad);

    // --- carpet stall on the west edge of the plaza ---
    const stall = new THREE.Group();
    const sx = -14.5, sz = 17.5;
    const tbl = this.makeTable(4.2, 1.4);
    tbl.position.set(sx, 0, sz); stall.add(tbl);
    const awn = this.makeAwning(4.8, 2.6, M.clothTeal, 0.34);
    awn.position.set(sx, 3.0, sz + 0.5); stall.add(awn);
    for (let i = 0; i < 3; i++){
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.6, 4, 9), i % 2 ? M.clothRed : M.clothTeal);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(sx - 1.1 + i * 1.2, 1.28 + i * 0.02, sz + 0.1);
      stall.add(carpet);
    }
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), M.clothRed);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(sx + 1.6, 1.42, sz + 0.4); stall.add(roll);
    this.solid(sx, 0, sz, 4.2, 1.25, 1.5, 'stall');
    this.root.add(stall);

    // --- hanging lantern line across the plaza ---
    const poles = [[-11.5, 15.5], [11.5, 15.5]];
    const wirePts = [];
    for (const [x, z] of poles){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 6.2, 8), M.woodDark);
      pole.position.set(x, 3.1, z); pole.castShadow = true;
      this.root.add(pole);
      this.solid(x, 0, z, 0.4, 6.2, 0.4, 'pole');
    }
    for (let i = 0; i <= 24; i++){
      const t = i / 24;
      wirePts.push(new THREE.Vector3(
        THREE.MathUtils.lerp(poles[0][0], poles[1][0], t),
        5.9 - Math.sin(t * Math.PI) * 1.15,
        THREE.MathUtils.lerp(poles[0][1], poles[1][1], t)
      ));
    }
    const wireCurve = new THREE.CatmullRomCurve3(wirePts);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 28, 0.018, 4, false), M.iron);
    this.root.add(wire);
    for (let i = 1; i < 8; i++){
      const p = wireCurve.getPoint(i / 8);
      const lamp = this.makeLantern();
      lamp.position.copy(p).add(new THREE.Vector3(0, -0.45, 0));
      lamp.scale.setScalar(0.85);
      this.root.add(lamp);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), lampMat);
      bulb.position.copy(p).add(new THREE.Vector3(0, -0.28, 0));
      this.root.add(bulb);
    }

    // --- stone steps to the well + bucket ---
    for (let i = 0; i < 3; i++){
      const step = this.box(4.4 - i * 0.5, 0.14, 0.55, M.sandstoneLight, 1);
      step.position.set(0, 0.07 + i * 0.14, 11.4 - i * 0.52);
      step.receiveShadow = true; this.root.add(step);
    }
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.34, 12), M.woodDark);
    bucket.position.set(1.9, 0.18, 10.5); this.root.add(bucket);
    const bucketRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 5, 14), M.iron);
    bucketRim.rotation.x = Math.PI / 2; bucketRim.position.set(1.9, 0.35, 10.5);
    this.root.add(bucketRim);

    // --- a few extra market crumbs ---
    for (const [x, z, s] of [[9.5, 9.2, 1.0], [-9.8, 11.5, 0.85], [12.6, 20.4, 0.9]]){
      const b = this.makeBarrel(M.woodDark, M);
      b.position.set(x, 0, z); b.scale.setScalar(s); this.root.add(b);
      const p = this.makePot(0.3 * s, M);
      p.position.set(x + 0.8, 0, z + 0.3); this.root.add(p);
    }

    // --- turquoise dome over the east house corner ---
    const domeG = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.72, 1.84, 1.05, 22), M.plasterCream);
    drum.position.y = 0.52; drum.castShadow = true; domeG.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.74, 26, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.metalPaint);
    dome.position.y = 1.04; dome.castShadow = true; domeG.add(dome);
    const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.75, 8), M.brass);
    finial.position.y = 3.0; domeG.add(finial);
    const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.brass);
    finialBall.position.y = 3.42; domeG.add(finialBall);
    domeG.position.set(20.3, 5.55, 15.6);
    this.root.add(domeG);

    // --- windcatcher tower (badgir) on the long block ---
    const wc = new THREE.Group();
    const shaft = this.box(3.2, 4.4, 3.2, M.plasterOchre, 2);
    shaft.position.y = 2.2; wc.add(shaft);
    for (const [dx, dz, ry] of [[0, 1.61, 0], [0, -1.61, 0], [1.61, 0, Math.PI / 2], [-1.61, 0, Math.PI / 2]]){
      for (let i = 0; i < 3; i++){
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.6), M.black);
        slit.position.set(dx + (dz ? -0.9 + i * 0.9 : 0), 2.0, dz + (dx ? -0.9 + i * 0.9 : 0));
        slit.rotation.y = ry + (dx > 0 ? Math.PI : 0);
        wc.add(slit);
      }
    }
    const cap = this.box(3.7, 0.24, 3.7, M.sandstoneLight, 1);
    cap.position.y = 4.5; wc.add(cap);
    const cap2 = this.box(2.6, 0.2, 2.6, M.woodDark, 1);
    cap2.position.y = 4.75; wc.add(cap2);
    wc.position.set(38, 6.5, 12);
    this.root.add(wc);
  }

  /* ================= CLOTH / FLAGS ================= */
  buildCloth(){
    // long shade cloth spanning the alley between gate and plaza
    for (const cfg of [
      { x: -22, z: 2, w: 6, d: 9, h: 6.4 },
    ]){
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(cfg.w, cfg.d, 14, 8), this.M.clothShade);
      cloth.rotation.x = Math.PI / 2;
      cloth.position.set(cfg.x, cfg.h, cfg.z);
      cloth.castShadow = true;
      this.root.add(cloth);
      this.clothMeshes.push({ mesh: cloth, base: cloth.geometry.attributes.position.array.slice(), amp: 0.10, speed: 0.5 });
      // support lines
      const lineMat = new THREE.MeshBasicMaterial({ color: 0x2e2720 });
      for (const s of [-1, 1]){
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, cfg.w, 4), lineMat);
        line.rotation.z = Math.PI / 2;
        line.position.set(cfg.x, cfg.h + 0.05, cfg.z + s * cfg.d / 2);
        this.root.add(line);
      }
    }
    // hanging banners on poles
    for (const [x, z, ry, mat] of [[-13, 12, 0.3, this.M.clothTeal], [14, 5.5, -0.4, this.M.clothRed], [26, 20, 0.6, this.M.clothTeal]]){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.5, 6), this.M.woodDark);
      pole.position.set(x, 2.75, z); this.root.add(pole);
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.2, 6, 10), mat);
      banner.position.set(x + 0.8, 3.9, z);
      banner.rotation.y = ry;
      this.root.add(banner);
      this.clothMeshes.push({ mesh: banner, base: banner.geometry.attributes.position.array.slice(), amp: 0.13, speed: 0.9 });
    }
  }

  buildPowerLines(){
    const M = this.M;
    const g = new THREE.Group();
    g.name = 'PowerLines';
    this.root.add(g);
    this.powerLines = g;
    const poles = [[-10, 30], [10, 28], [-26, 6], [22, 6], [34, -26]];
    for (const [x, z] of poles){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 8.5, 8), M.woodDark);
      pole.position.set(x, 4.25, z); pole.castShadow = true; g.add(pole);
      this.solid(x, 0, z, 0.5, 8.5, 0.5, 'pole');
      const cross = this.box(2.2, 0.12, 0.12, M.woodDark);
      cross.position.set(x, 7.4, z); g.add(cross);
      for (const s of [-1, 1]){
        const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.25, 6), M.iron);
        ins.position.set(x + s * 1.0, 7.58, z); g.add(ins);
      }
    }
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x211d18 });
    const pairs = [[0, 1], [1, 3], [2, 3], [3, 4], [0, 2]];
    for (const [a, b] of pairs){
      const p1 = new THREE.Vector3(poles[a][0], 7.55, poles[a][1]);
      const p2 = new THREE.Vector3(poles[b][0], 7.55, poles[b][1]);
      const mid = p1.clone().add(p2).multiplyScalar(0.5);
      mid.y -= p1.distanceTo(p2) * 0.05;
      const curve = new THREE.CatmullRomCurve3([p1, mid, p2]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.022, 4, false), wireMat);
      g.add(tube);
    }
  }

  buildWallDecals(){
    const d = this.assets.decals;
    const posters = [
      { x: -7.2, y: 3.0, z: -27.55, ry: 0, tex: d.poster1, scale: 1.1 },
      { x: 33.2, y: 3.2, z: -16.8, ry: -Math.PI / 2, tex: d.poster1, scale: 1.0 },
      { x: -21.5, y: 2.8, z: -14.9, ry: 0, tex: d.graffiti, scale: 1.8, noColor: true },
      { x: 43.18, y: 4.2, z: 12, ry: -Math.PI / 2, tex: d.graffiti, scale: 2.2, noColor: true },
      { x: 14, y: 0.02, z: 8, ry: 0, tex: d.tracks, scale: 4, flat: true, noColor: true, opacity: 0.45 },
      { x: -20, y: 0.02, z: 20, ry: 0.4, tex: d.tracks, scale: 4, flat: true, noColor: true, opacity: 0.45 },
    ];
    for (const p of posters){
      const mat = decalTextureMaterial(p.tex, p.opacity ?? 0.9, p.noColor ? 0xffffff : 0xffffff);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.scale * (p.flat ? 4 : 1.4), p.scale * (p.flat ? 4 : 2)), mat);
      if (p.flat){
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, 0.035, p.z);
      } else {
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.y = p.ry;
      }
      this.root.add(mesh);
    }
    // hazard stripes on the water tower legs and gate
    for (const [x, y, z, ry] of [[-34.8, 0.25, -8.3, 0], [12, 0.15, -20, 0.4]]){
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), decalTextureMaterial(d.hazard, 0.9));
      hz.rotation.x = -Math.PI / 2;
      hz.position.set(x, y, z);
      hz.rotation.z = ry;
      this.root.add(hz);
    }
  }

  buildGroundDetails(){
    // scattered pebbles via instancing
    const count = 180;
    const geo = new THREE.IcosahedronGeometry(0.07, 0);
    const inst = new THREE.InstancedMesh(geo, this.M.rock, count);
    inst.castShadow = false; inst.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++){
      dummy.position.set((Math.random() - 0.5) * 84, 0.04, (Math.random() - 0.5) * 76);
      dummy.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      dummy.scale.setScalar(0.4 + Math.random() * 1.4);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    this.root.add(inst);

    // sand drifts / stains
    for (let i = 0; i < 10; i++){
      const mat = this.M.decalSplash.clone();
      mat.opacity = 0.05 + Math.random() * 0.06;
      mat.color.set(0x8b6f48);
      const patch = new THREE.Mesh(new THREE.CircleGeometry(2 + Math.random() * 5, 20), mat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set((Math.random() - 0.5) * 66, 0.026, (Math.random() - 0.5) * 58);
      this.root.add(patch);
    }

    // dead grass tufts
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x8d8346, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 30; i++){
      const g = new THREE.Group();
      for (let j = 0; j < 5; j++){
        const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.5), tuftMat);
        blade.position.y = 0.25;
        blade.rotation.y = j / 5 * Math.PI;
        blade.rotation.z = (Math.random() - 0.5) * 0.3;
        g.add(blade);
      }
      g.position.set((Math.random() - 0.5) * 78, 0, (Math.random() - 0.5) * 68);
      this.root.add(g);
    }
  }

  /* ================= cute dressing ================= */
  buildBunting(){
    const M = this.M;
    const flagGeo = new THREE.BufferGeometry();
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.18, 0.22, 0, 0.18, 0.22, 0, 0, -0.28, 0,
    ], 3));
    flagGeo.computeVertexNormals();
    const colors = [0xff8fb4, 0xffd257, 0x7fd8ff, 0x9be08a, 0xc9a2ff];
    const mats = colors.map((c) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    }));

    const lines = [
      [-15.5, 6.8, 18.5, 15.5, 6.3, 18.5],
      [-14.5, 6.5, -12.0, 14.5, 6.9, -12.0],
    ];
    for (const [x1, y1, z1, x2, y2, z2] of lines){
      // poles
      for (const [px, py, pz] of [[x1, y1, z1], [x2, y2, z2]]){
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, py + 0.5, 8), M.woodDark);
        pole.position.set(px, (py + 0.5) / 2, pz);
        pole.castShadow = true;
        this.root.add(pole);
        this.solid(px, 0, pz, 0.3, py + 0.5, 0.3, 'prop');
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.brass);
        knob.position.set(px, py + 0.55, pz);
        this.root.add(knob);
      }
      const pts = [];
      for (let i = 0; i <= 14; i++){
        const t = i / 14;
        const x = THREE.MathUtils.lerp(x1, x2, t);
        const y = THREE.MathUtils.lerp(y1, y2, t) - Math.sin(t * Math.PI) * 0.85;
        const z = THREE.MathUtils.lerp(z1, z2, t);
        pts.push(new THREE.Vector3(x, y, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.014, 4, false), M.rubber);
      this.root.add(cord);
      const n = 14;
      for (let i = 1; i < n; i++){
        const t = i / n;
        const p = curve.getPoint(t);
        const flag = new THREE.Mesh(flagGeo, mats[i % mats.length]);
        flag.position.copy(p);
        flag.position.y -= 0.26;
        flag.rotation.z = (Math.random() - 0.5) * 0.18;
        flag.castShadow = true;
        this.root.add(flag);
      }
    }
  }

  buildFlowers(){
    const bushMats = [0x6fbf6a, 0x8fd47f, 0x5fae63].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }));
    const bloomMats = [0xff8fb4, 0xffd257, 0xfff2b0, 0xff9ec2].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 }));
    const spots = [
      [-16, 22], [16, 22], [-20, 3], [20, 2],
      [-24, -10], [24, -10], [-13, 26], [13, 26],
      [-30, 6], [30, 5], [-33, -20], [33, -20],
    ];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [x, z] of spots){
      const bush = new THREE.Group();
      const base = this.box(0.9, 0.28, 0.9, this.M.sandstone, 1);
      base.position.y = 0.14;
      bush.add(base);
      const blobs = 1 + (rnd() * 2 | 0);
      for (let i = 0; i < blobs; i++){
        const r = 0.42 + rnd() * 0.2;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), bushMats[(rnd() * 3) | 0]);
        b.position.set((rnd() - 0.5) * 0.4, 0.45 + rnd() * 0.22, (rnd() - 0.5) * 0.4);
        b.scale.y = 0.85;
        b.castShadow = true;
        b.receiveShadow = true;
        bush.add(b);
        for (let k = 0; k < 5; k++){
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.055 + rnd() * 0.025, 6, 5), bloomMats[(rnd() * bloomMats.length) | 0]);
          f.position.set(b.position.x + (rnd() - 0.5) * r * 1.5, b.position.y + 0.22 + rnd() * 0.16, b.position.z + (rnd() - 0.5) * r * 1.5);
          bush.add(f);
        }
      }
      bush.position.set(x, 0, z);
      this.root.add(bush);
    }
  }

  buildBalloons(){
    this.balloons = [];
    const colors = [0xff9ec2, 0xffd257, 0x7fd8ff, 0x9be08a, 0xc9a2ff];
    const spots = [[-11.5, 15.5], [11.5, 10.0], [8.5, 2.5]];
    let k = 0;
    for (const [x, z] of spots){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.4, 6), this.M.woodDark);
      pole.position.set(x, 1.2, z);
      this.root.add(pole);
      this.solid(x, 0, z, 0.16, 2.4, 0.16, 'prop');
      for (let i = 0; i < 4; i++){
        const col = colors[(k++) % colors.length];
        const g = new THREE.Group();
        const bx = (Math.random() - 0.5) * 0.7;
        const bz = (Math.random() - 0.5) * 0.7;
        const by = 2.3 + Math.random() * 0.5;
        const balloon = new THREE.Mesh(
          new THREE.SphereGeometry(0.24 + Math.random() * 0.05, 14, 12),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.05 })
        );
        balloon.scale.y = 1.18;
        balloon.position.set(bx, by, bz);
        balloon.castShadow = true;
        g.add(balloon);
        const knot = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 6), balloon.material);
        knot.position.set(bx, by - 0.29, bz);
        knot.rotation.x = Math.PI;
        g.add(knot);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, by, 4),
          new THREE.MeshBasicMaterial({ color: 0xfff6e0 }));
        str.position.set(bx * 0.5, by * 0.5, bz * 0.5);
        str.rotation.z = -bx * 0.1;
        g.add(str);
        g.position.set(x, 0, z);
        this.root.add(g);
        this.balloons.push({ mesh: balloon, base: by, phase: Math.random() * 6.28, sway: bx });
      }
    }
  }

  buildWaterPark(){
    const mat = (c, r = 0.6, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const blue = mat(0x36aef4, 0.3);
    const sky = mat(0x8fe6ff, 0.35);
    const yellow = mat(0xffd23f, 0.45);
    const pink = mat(0xff9ec2, 0.5);
    const cream = mat(0xfff2d8, 0.9);
    const white = mat(0xffffff, 0.5);

    // ---- splash pool ----
    const pool = new THREE.Group();
    pool.position.set(12.6, 0, 4.2);
    this.root.add(pool);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(2.75, 2.95, 0.5, 30), cream);
    rim.position.y = 0.25;
    rim.castShadow = true; rim.receiveShadow = true;
    pool.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.5, 36),
      new THREE.MeshPhysicalMaterial({ color: 0x58d6ff, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.88, clearcoat: 1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.52;
    pool.add(water);
    const tile = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.72, 36), blue);
    tile.rotation.x = -Math.PI / 2;
    tile.position.y = 0.515;
    pool.add(tile);

    // ---- slide tower ----
    const tx = 20.5, tz = -12.5;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 7.6, 8), blue);
      post.position.set(tx + sx * 1.55, 3.8, tz + sz * 1.55);
      post.castShadow = true;
      this.root.add(post);
    }
    const deck = this.box(4.4, 0.32, 4.4, yellow, 1);
    deck.position.set(tx, 7.5, tz);
    this.root.add(deck);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.5, 8), pink);
    roof.position.set(tx, 9.4, tz);
    roof.castShadow = true;
    this.root.add(roof);
    const roofTip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), white);
    roofTip.position.set(tx, 10.25, tz);
    this.root.add(roofTip);
    for (let i = 0; i < 8; i++){
      const a = i / 8 * Math.PI * 2;
      const railPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), white);
      railPost.position.set(tx + Math.cos(a) * 2.0, 8.1, tz + Math.sin(a) * 2.0);
      this.root.add(railPost);
    }
    // ladder
    for (const off of [-0.3, 0.3]){
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7.4, 5), white);
      rail.position.set(tx - 2.1, 3.7, tz + off);
      this.root.add(rail);
    }
    // two candy slides
    const slide = (side, color) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(tx + side * 0.8, 7.35, tz + 1.9),
        new THREE.Vector3(tx + side * 0.7, 6.0, tz + 4.6),
        new THREE.Vector3(tx - 1.6 + side * 0.5, 3.6, tz + 9.0),
        new THREE.Vector3(tx - 5.4 + side * 0.35, 1.7, tz + 13.4),
        new THREE.Vector3(tx - 7.6 + side * 0.3, 0.95, tz + 16.2),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.6, 12, false), color);
      tube.castShadow = true;
      this.root.add(tube);
      const end = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 18), white);
      const p = curve.getPoint(1);
      const t = curve.getTangent(1);
      end.position.copy(p);
      end.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.clone().normalize());
      this.root.add(end);
      for (const tt of [0.35, 0.62]){
        const pp = curve.getPoint(tt);
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, pp.y, 6), white);
        strut.position.set(pp.x, pp.y / 2, pp.z);
        this.root.add(strut);
      }
    };
    slide(-1, blue);
    slide(1, yellow);

    // ---- inflatable rings ----
    const ring = (x, y, z, r, color) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.32, 10, 22), color);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      m.castShadow = true;
      this.root.add(m);
    };
    ring(12.6, 0.62, 4.2, 0.85, pink);
    ring(10.9, 0.62, 5.4, 0.55, yellow);
    ring(13.8, 0.62, 5.2, 0.45, sky);
    ring(1.1, 1.95, 7.6, 0.5, pink);
    ring(-7.2, 0.3, 12.4, 0.6, sky);

    // ---- rubber duck in the fountain ----
    const duck = new THREE.Group();
    duck.position.set(0, 1.62, 7.6);
    const bodyDuck = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), yellow);
    bodyDuck.scale.set(1.25, 0.85, 1);
    const headDuck = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), yellow);
    headDuck.position.set(0, 0.42, 0.18);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 10), mat(0xff8a2f, 0.5));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.38, 0.45);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat(0x241408, 0.4));
    eyeL.position.set(-0.12, 0.5, 0.38);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.12;
    duck.add(bodyDuck, headDuck, beak, eyeL, eyeR);
    duck.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.root.add(duck);
    this.duck = duck;

    // ---- beach umbrellas ----
    const umbrella = (x, z, c1, c2) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.9, 6), white);
      pole.position.set(x, 1.45, z);
      this.root.add(pole);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.85, 0.75, 10), c1);
      canopy.position.set(x, 2.85, z);
      canopy.castShadow = true;
      this.root.add(canopy);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.1, 8, 20), c2);
      trim.rotation.x = Math.PI / 2;
      trim.position.set(x, 2.52, z);
      this.root.add(trim);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), c2);
      tip.position.set(x, 3.28, z);
      this.root.add(tip);
      // little towel
      const towel = this.box(1.0, 0.04, 1.8, c2, 1);
      towel.position.set(x + 1.6, 0.03, z + 1.0);
      towel.rotation.y = 0.3;
      towel.receiveShadow = true;
      this.root.add(towel);
    };
    umbrella(-9.6, 14.8, pink, white);
    umbrella(9.4, 15.2, blue, yellow);

    // ---- beach balls ----
    const ball = (x, z, c) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), c);
      b.position.set(x, 0.3, z);
      b.castShadow = true;
      this.root.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.055, 6, 16), white);
      band.position.set(x, 0.3, z);
      band.rotation.x = Math.PI / 2;
      this.root.add(band);
    };
    ball(-7.6, 18.0, pink);
    ball(2.4, 14.8, sky);
    ball(13.9, 8.4, yellow);
  }

  /* ================= WATER PARK ================= */
  parkMaterials(){
    if (this.PM) return this.PM;
    const rockNormal = this.M.rock.normalMap;
    const std = (c, r = 0.62, extra = {}) => new THREE.MeshStandardMaterial({
      color: c, roughness: r, metalness: 0, ...extra,
    });
    const rock = (c, ns) => new THREE.MeshStandardMaterial({
      color: c, roughness: 0.96, metalness: 0,
      map: this.rockStrataTexture(), flatShading: true,
      normalMap: rockNormal, normalScale: new THREE.Vector2(ns, ns),
    });
    const PM = {
      wood: this.M.wood,
      woodDark: this.M.woodDark,
      woodPale: this.M.woodPale,
      blue: std(0x2c9ce6, 0.42),
      blueDeep: std(0x1a6fb5, 0.5),
      sky: std(0x9fe0ff, 0.5),
      white: std(0xfff8ec, 0.55),
      cream: std(0xfff0d2, 0.82),
      yellow: std(0xffcf36, 0.5),
      pink: std(0xff8fc0, 0.55),
      red: std(0xf4555c, 0.55),
      orange: std(0xff9a3c, 0.55),
      straw: std(0xe4c17a, 0.95),
      moss: std(0x7fbf5f, 0.95),
      leaf: std(0x4f9a55, 1),
      leafLight: std(0x6dbf62, 1),
      leafDark: std(0x3f7f4a, 1),
      rock: rock(0xcbb08a, 0.95),
      rockLight: rock(0xdfcaa8, 0.8),
      rockDark: rock(0xa88d68, 1.05),
    };
    PM.water = new THREE.MeshBasicMaterial({ color: 0xffffff, map: this.waterTexture(), toneMapped: false });
    PM.waterLight = new THREE.MeshBasicMaterial({
      color: 0x9beeff, transparent: true, opacity: 0.42, toneMapped: false, depthWrite: false,
    });
    PM.foam = new THREE.MeshBasicMaterial({
      color: 0xe8ffff, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false,
    });
    this.PM = PM;
    return PM;
  }

  makeBannerTexture(bg){
    this._bannerTex = this._bannerTex || {};
    if (this._bannerTex[bg]) return this._bannerTex[bg];
    const tex = this.assets.canvasTexture(128, 192, (ctx, w, h) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      for (let i = 0; i < 5; i++) ctx.fillRect(0, 12 + i * 44, w, 7);
      // white water-drop mark
      const cx = w / 2, cy = 86, r = 25;
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 50);
      ctx.bezierCurveTo(cx + 9, cy - 20, cx + r, cy + 2, cx + r, cy + 18);
      ctx.arc(cx, cy + 18, r, 0, Math.PI);
      ctx.bezierCurveTo(cx - r, cy + 2, cx - 9, cy - 20, cx, cy - 50);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.62)';
      ctx.lineWidth = 5;
      ctx.strokeRect(5, 5, w - 10, h - 10);
    });
    this._bannerTex[bg] = tex;
    return tex;
  }

  makeBanner(bg, w = 1.45, h = 2.1){
    const mat = new THREE.MeshStandardMaterial({
      map: this.makeBannerTexture(bg), side: THREE.DoubleSide,
      roughness: 0.9, metalness: 0,
      emissive: new THREE.Color(bg), emissiveIntensity: 0.22,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.receiveShadow = true;
    return m;
  }

  makeWaterfallTexture(){
    if (this._wfTex) return this._wfTex;
    const tex = this.assets.canvasTexture(256, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // mostly transparent sheet with a bright crest and foam wash at the foot
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(226,250,255,.5)');
      grd.addColorStop(0.22, 'rgba(196,240,252,.3)');
      grd.addColorStop(0.62, 'rgba(205,246,255,.24)');
      grd.addColorStop(0.88, 'rgba(233,253,255,.36)');
      grd.addColorStop(1, 'rgba(255,255,255,.6)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      let seed = 23;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      // falling strands of water
      for (let i = 0; i < 46; i++){
        const x = rnd() * w;
        const lw = 1.2 + rnd() * 4.6;
        ctx.strokeStyle = `rgba(255,255,255,${0.05 + rnd() * 0.26})`;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x, -20);
        ctx.bezierCurveTo(x + (rnd() - 0.5) * 16, h * 0.34, x + (rnd() - 0.5) * 14, h * 0.7, x + (rnd() - 0.5) * 8, h + 10);
        ctx.stroke();
      }
      // soft white gush under the lip
      const gush = ctx.createLinearGradient(0, 0, 0, h * 0.16);
      gush.addColorStop(0, 'rgba(255,255,255,.5)');
      gush.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gush; ctx.fillRect(0, 0, w, h * 0.16);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++){
        ctx.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.3})`;
        ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 1 + rnd() * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      // churned foam at the base
      for (let i = 0; i < 30; i++){
        ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.45})`;
        ctx.beginPath();
        ctx.ellipse(rnd() * w, h - 8 - rnd() * 46, 5 + rnd() * 12, 3 + rnd() * 8, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // soften the sheet edges so it does not read as a glass panel
      ctx.globalCompositeOperation = 'destination-in';
      const side = ctx.createLinearGradient(0, 0, w, 0);
      side.addColorStop(0, 'rgba(0,0,0,0)');
      side.addColorStop(0.12, 'rgba(0,0,0,1)');
      side.addColorStop(0.88, 'rgba(0,0,0,1)');
      side.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, w, h);
      // fade the crest out so the sheet has no hard rectangular top edge
      ctx.globalCompositeOperation = 'destination-out';
      const topFade = ctx.createLinearGradient(0, 0, 0, 74);
      topFade.addColorStop(0, 'rgba(0,0,0,1)');
      topFade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = topFade;
      ctx.fillRect(0, 0, w, 74);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._wfTex = tex;
    return tex;
  }

  /* ---------- organic rock ---------- */
  waterTexture(){
    if (this._waterTex) return this._waterTex;
    const tex = this.assets.canvasTexture(512, 512, (ctx, w, h) => {
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, '#3ad2f5');
      base.addColorStop(0.5, '#2fc9f2');
      base.addColorStop(1, '#28bde9');
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      let seed = 991;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      // soft caustic rings + ripples
      for (let i = 0; i < 260; i++){
        const cx = rnd() * w, cy = rnd() * h;
        const rx = 14 + rnd() * 46, ry = rx * (0.4 + rnd() * 0.5);
        ctx.strokeStyle = `rgba(190,248,255,${0.05 + rnd() * 0.16})`;
        ctx.lineWidth = 1 + rnd() * 3.4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < 70; i++){
        ctx.fillStyle = `rgba(220,252,255,${0.04 + rnd() * 0.1})`;
        ctx.beginPath();
        ctx.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 34, 6 + rnd() * 18, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      // tile-free depth mottling
      for (let i = 0; i < 24; i++){
        const g = ctx.createRadialGradient(rnd() * w, rnd() * h, 0, rnd() * w, rnd() * h, 90 + rnd() * 90);
        g.addColorStop(0, 'rgba(22,150,200,.10)');
        g.addColorStop(1, 'rgba(22,150,200,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.2, 2.2);
    this._waterTex = tex;
    return tex;
  }

  rockStrataTexture(){
    if (this._rockTex) return this._rockTex;
    const tex = this.assets.canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
      let seed = 7717;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      // horizontal sedimentary bands
      let y = 0;
      while (y < h){
        const bh = 6 + rnd() * 34;
        const tone = 0.93 + rnd() * 0.09;
        ctx.fillStyle = `rgba(${Math.round(255 * tone)},${Math.round(243 * tone)},${Math.round(222 * tone)},1)`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 16){
          ctx.lineTo(x, y + Math.sin(x * 0.021 + y * 0.05) * 3.4 + Math.sin(x * 0.006) * 4);
        }
        ctx.lineTo(w, y + bh); ctx.lineTo(0, y + bh); ctx.closePath(); ctx.fill();
        y += bh;
      }
      // speckle + cracks
      for (let i = 0; i < 1400; i++){
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,252,240' : '168,140,102'},${0.06 + rnd() * 0.16})`;
        ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 2.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(150,120,84,.22)';
      for (let i = 0; i < 30; i++){
        ctx.lineWidth = 0.6 + rnd() * 1.4;
        let cx = rnd() * w, cy = rnd() * h;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let k = 0; k < 4; k++){ cx += (rnd() - 0.5) * 46; cy += rnd() * 26; ctx.lineTo(cx, cy); }
        ctx.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._rockTex = tex;
    return tex;
  }

  // organic rock block: rounded, weathered and slightly tapered towards the top
  rockGeometry(w, h, d, seed = 1){
    const geo = new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * 0.2);
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    const v = new THREE.Vector3();
    const s = seed * 7.31;
    const n3 = (x, y, z) =>
      Math.sin(x * 1.63 + s) * Math.cos(y * 1.27 - s * 0.6) * 0.55 +
      Math.sin(y * 2.71 + s * 1.4) * Math.cos(z * 2.03 + s * 0.3) * 0.3 +
      Math.sin(z * 4.13 - s * 0.8) * Math.cos(x * 3.51 + s) * 0.15;
    const amp = Math.min(w, d) * 0.085;
    const orig = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++){
      orig[i * 3] = pos.getX(i); orig[i * 3 + 1] = pos.getY(i); orig[i * 3 + 2] = pos.getZ(i);
    }
    for (let i = 0; i < pos.count; i++){
      v.set(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
      const nyN = v.y / (h * 0.5);
      // weathered taper: shoulders pull in, base stays wide
      const taper = 1 - 0.17 * Math.max(0, nyN) * Math.max(0, nyN);
      v.x *= taper; v.z *= taper;
      const n = n3(v.x * 0.62, v.y * 0.62, v.z * 0.62);
      v.x += n * amp; v.y += n * amp * 0.55; v.z += n * amp;
      pos.setXYZ(i, v.x, v.y, v.z);

      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
      let u, vv;
      if (nx > ny && nx > nz){ u = orig[i * 3 + 2]; vv = orig[i * 3 + 1]; }
      else if (nz > ny && nz > nx){ u = orig[i * 3]; vv = orig[i * 3 + 1]; }
      else { u = orig[i * 3]; vv = orig[i * 3 + 2]; }
      uv.setXY(i, u / 3.4 + 0.5, vv / 3.4 + 0.5);
    }
    uv.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  makeRock(w, h, d, seed, mat){
    const m = new THREE.Mesh(this.rockGeometry(w, h, d, seed), mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // weathered boulder blob built from a deformed sphere
  blobGeometry(rx, ry, rz, seed = 1){
    const geo = new THREE.SphereGeometry(1, 18, 13);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const s = seed * 5.17;
    for (let i = 0; i < pos.count; i++){
      v.fromBufferAttribute(pos, i);
      const n =
        Math.sin(v.x * 3.1 + s) * Math.cos(v.y * 2.7 - s * 0.5) * 0.5 +
        Math.sin(v.y * 5.3 + s * 1.2) * Math.cos(v.z * 4.1 + s) * 0.3 +
        Math.sin(v.z * 7.9 - s) * Math.cos(v.x * 6.3) * 0.2;
      const k = 1 + n * 0.16;
      pos.setXYZ(i, v.x * rx * k, v.y * ry * k * (v.y > 0 ? 1 : 0.92), v.z * rz * k);
    }
    geo.computeVertexNormals();
    return geo;
  }

  makeLifebuoy(r = 0.5){
    const PM = this.PM;
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.32, 8, 22), PM.white);
    ring.castShadow = true;
    g.add(ring);
    const bandGeo = new THREE.TorusGeometry(r, r * 0.345, 6, 7, Math.PI * 0.34);
    for (let i = 0; i < 4; i++){
      const b = new THREE.Mesh(bandGeo, PM.red);
      b.rotation.z = i * Math.PI / 2 + Math.PI / 4;
      g.add(b);
    }
    return g;
  }

  makeParkDuck(scale = 1){
    const PM = this.PM;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), PM.yellow);
    body.scale.set(1.3, 0.82, 1);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 9), PM.yellow);
    head.position.set(0, 0.24, 0.12);
    g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 8), PM.orange);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.23, 0.36);
    g.add(beak);
    for (const s of [-1, 1]){
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 5), PM.blueDeep);
      eye.position.set(s * 0.075, 0.3, 0.25);
      g.add(eye);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(scale);
    return g;
  }

  makeUmbrella(c1, c2){
    const PM = this.PM;
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.9, 6), PM.white);
    pole.position.y = 1.45; pole.castShadow = true; g.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.85, 0.75, 12), c1);
    canopy.position.y = 2.85; canopy.castShadow = true; g.add(canopy);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.09, 6, 22), c2);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 2.52;
    g.add(trim);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), c2);
    tip.position.y = 3.28; g.add(tip);
    return g;
  }

  makeLoungeChair(color){
    const PM = this.PM;
    const g = new THREE.Group();
    const seat = this.box(0.75, 0.1, 1.75, color);
    seat.position.y = 0.42; g.add(seat);
    const back = this.box(0.75, 0.1, 0.8, color);
    back.position.set(0, 0.7, -0.92);
    back.rotation.x = -0.62; g.add(back);
    for (const sx of [-0.3, 0.3]){
      for (const sz of [-0.7, 0.7]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 5), PM.woodDark);
        leg.position.set(sx, 0.19, sz);
        g.add(leg);
      }
    }
    const towel = this.box(0.6, 0.05, 1.2, PM.white);
    towel.position.set(0, 0.49, 0.18);
    g.add(towel);
    return g;
  }

  /* ---------- ground ---------- */
  buildParkGround(){
    const M = this.M;
    const PM = this.parkMaterials();
    M.sand.color.set(0xf7e6c6);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240, 80, 80), M.sand);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++){
      const x = pos.getX(i), y = pos.getY(i);
      const d = Math.hypot(x, y);
      const t = Math.max(0, (d - 55) / 60);
      pos.setZ(i, (Math.sin(x * 0.075) * Math.cos(y * 0.06) * 1.4 + Math.sin(x * 0.19 + y * 0.11) * 0.5) * t);
    }
    ground.geometry.computeVertexNormals();
    this.root.add(ground);

    // warm cream paving for the plaza, promenade and side paths
    const paveMat = M.sand.clone();
    paveMat.color.set(0xf1ddb5);
    paveMat.roughness = 0.95;
    paveMat.normalScale = new THREE.Vector2(0.85, 0.85);
    this.pavingMats.push(paveMat);

    const flat = (geo, mat, x, z, y) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.root.add(m);
      return m;
    };

    flat(new THREE.CircleGeometry(9.2, 56), paveMat, 0, 7, 0.016);
    flat(new THREE.PlaneGeometry(7.4, 15.5), paveMat, 0, 19.2, 0.019);
    flat(new THREE.PlaneGeometry(5.6, 11), paveMat, -8.2, 15.4, 0.022).rotation.z = -0.3;
    flat(new THREE.PlaneGeometry(5.6, 10), paveMat, 12.0, 7.6, 0.022).rotation.z = 0.22;
    flat(new THREE.CircleGeometry(4.6, 40), paveMat, -16, 2.2, 0.014);
    flat(new THREE.PlaneGeometry(5.4, 8), paveMat, -21, 4.6, 0.017).rotation.z = 0.5;

    // paving inlay rings around the water-source plaza
    const inlayMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.9, metalness: 0 });
    for (const [r0, r1] of [[5.0, 5.14], [8.5, 8.64]]){
      flat(new THREE.RingGeometry(r0, r1, 64), inlayMat, 0, 7, 0.023);
    }
    flat(new THREE.CircleGeometry(3.9, 48), inlayMat, 0, 7, 0.021);

    // soft large colour-variation patches, kept away from the objective
    const patchMats = [0xfaeac9, 0xf3ddb4, 0xfff2d8, 0xefd8ad].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 1, metalness: 0 }));
    const patches = [
      [-27, 30, 9, 0], [26, 31, 10, 1], [-34, 9, 7, 2], [34, 10, 8, 3],
      [-22, -2, 5, 1], [22, -1, 6, 0], [-9, -22, 6, 3], [10, -23, 7, 2],
      [-31, -17, 6, 0], [32, -18, 7, 1], [0, 31, 6, 3],
    ];
    for (const [x, z, r, mi] of patches){
      flat(new THREE.CircleGeometry(r, 32), patchMats[mi], x, z, 0.009);
    }

    // damp band that frames the lagoon shoreline
    const wet = new THREE.MeshStandardMaterial({ color: 0xe8d0a3, roughness: 1, metalness: 0 });
    const shore = flat(new THREE.CircleGeometry(1, 56), wet, 0, -8, 0.011);
    shore.scale.set(14.0, 8.0, 1);
  }

  /* ---------- resort boundary ---------- */
  buildParkBoundary(){
    const PM = this.parkMaterials();
    const hedgeGeo = new RoundedBoxGeometry(5.2, 2.8, 2.3, 3, 0.55);
    const hedgeMats = [PM.leaf, PM.leafLight, PM.leafDark];
    let k = 0;
    const hedge = (x, z, ry = 0) => {
      const h = 0.85 + (k % 5) * 0.09;
      const m = new THREE.Mesh(hedgeGeo, hedgeMats[k % 3]);
      m.scale.set(1, h, 1);
      m.position.set(x, 1.4 * h, z);
      m.rotation.y = ry;
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
      k++;
    };
    for (let z = -36; z <= 36; z += 5.15){
      hedge(-43.2, z, Math.PI / 2);
      hedge(43.2, z, Math.PI / 2);
    }
    for (let x = -38; x <= 38; x += 5.15){
      hedge(x, -39.2);
      hedge(x, 39.2);
    }

    // invisible resort walls (never battlements)
    this.solid(0, 0, -39.1, 90, 8, 2, 'wall');
    this.solid(0, 0, 39.1, 90, 8, 2, 'wall');
    this.solid(-43.1, 0, 0, 2, 8, 80, 'wall');
    this.solid(43.1, 0, 0, 2, 8, 80, 'wall');

    // banner poles along the boundary
    const bannerPole = (x, z, ry, bg) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 5.4, 7), PM.white);
      pole.position.y = 2.7; pole.castShadow = true; g.add(pole);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), PM.yellow);
      knob.position.y = 5.45; g.add(knob);
      const banner = this.makeBanner(bg, 1.45, 2.1);
      banner.position.set(0.82, 3.95, 0);
      g.add(banner);
      this.root.add(g);
      this.solid(x, 0, z, 0.35, 5.4, 0.35, 'prop');
    };
    bannerPole(-33, 38.6, Math.PI, 0x2a8fd8);
    bannerPole(-11, 38.6, Math.PI, 0xf07ba8);
    bannerPole(11, 38.6, Math.PI, 0x2a8fd8);
    bannerPole(33, 38.6, Math.PI, 0xf07ba8);
    bannerPole(-42.6, 9, Math.PI / 2, 0x2a8fd8);
    bannerPole(-42.6, -18, Math.PI / 2, 0xf07ba8);
    bannerPole(42.6, 9, -Math.PI / 2, 0xf07ba8);
    bannerPole(42.6, -18, -Math.PI / 2, 0x2a8fd8);
  }

  /* ---------- the park itself ---------- */
  buildWaterParkWorld(){
    const PM = this.parkMaterials();

    /* ===== lagoon ===== */
    const waterBody = (x, z, rx, rz, y, rimTop) => {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.03, rimTop, 56, 1, true), PM.cream);
      wall.scale.set(rx + 0.32, 1, rz + 0.32);
      wall.position.set(x, rimTop / 2, z);
      wall.castShadow = true; wall.receiveShadow = true;
      this.root.add(wall);
      const cap = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.012, 56), PM.cream);
      cap.rotation.x = -Math.PI / 2;
      cap.scale.set(rx + 0.34, rz + 0.34, 1);
      cap.position.set(x, rimTop, z);
      cap.receiveShadow = true;
      this.root.add(cap);
      const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64), PM.water);
      water.rotation.x = -Math.PI / 2;
      water.scale.set(rx, rz, 1);
      water.position.set(x, y, z);
      this.root.add(water);
      return water;
    };

    waterBody(0, -8, 12.9, 6.9, 0.105, 0.16);

    // shoreline ripple rings that slowly expand and fade
    this.ripples = [];
    const ringGeo = new THREE.RingGeometry(0.58, 0.72, 26);
    for (let i = 0; i < 10; i++){
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const rx = 11.4 + (i % 2) * 0.9;
      const rz = 5.9 + (i % 2) * 0.5;
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.26,
        depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(Math.cos(a) * rx, 0.127, -8 + Math.sin(a) * rz);
      this.root.add(m);
      this.ripples.push({ m, phase: i * 0.73 });
    }

    // foam blobs marking the lagoon waterline (single instanced draw call)
    const foamGeo = new THREE.CircleGeometry(0.5, 10);
    const foamMesh = new THREE.InstancedMesh(foamGeo, PM.foam, 44);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const sc = new THREE.Vector3();
    for (let i = 0; i < 44; i++){
      const a = (i / 44) * Math.PI * 2 + (i % 3) * 0.03;
      const rx = 12.55 + Math.sin(i * 2.3) * 0.22;
      const rz = 6.55 + Math.cos(i * 1.7) * 0.18;
      const s = 0.45 + ((i * 37) % 10) / 14;
      sc.set(s * 1.6, s, 1);
      mtx.compose(
        new THREE.Vector3(Math.cos(a) * rx, 0.118, -8 + Math.sin(a) * rz),
        q,
        sc
      );
      foamMesh.setMatrixAt(i, mtx);
    }
    foamMesh.instanceMatrix.needsUpdate = true;
    this.root.add(foamMesh);

    const shallow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), PM.waterLight);
    shallow.rotation.x = -Math.PI / 2;
    shallow.scale.set(6.4, 3.1, 1);
    shallow.position.set(-2.2, 0.112, -8.6);
    this.root.add(shallow);
    const shallow2 = shallow.clone();
    shallow2.scale.set(4.0, 1.8, 1);
    shallow2.position.set(4.4, 0.112, -6.8);
    this.root.add(shallow2);

    const floater = (mesh, base) => {
      this.root.add(mesh);
      this.parkFloaters.push({ mesh, base, phase: mesh.position.x * 0.7 + mesh.position.z * 0.5 });
    };
    const floatRing = (x, z, r, c) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.34, 8, 18), c);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, 0.2, z);
      m.castShadow = true;
      floater(m, 0.2);
    };
    floatRing(-5.6, -9.0, 0.95, PM.pink);
    floatRing(-3.6, -8.2, 0.55, PM.yellow);
    floatRing(4.2, -7.0, 0.82, PM.sky);
    floatRing(7.4, -10.4, 0.62, PM.white);

    const duck = this.makeParkDuck(1.0);
    duck.position.set(-7.4, 0.16, -5.6);
    duck.rotation.y = 0.7;
    floater(duck, 0.16);
    const duck2 = this.makeParkDuck(0.75);
    duck2.position.set(2.6, 0.14, -10.2);
    duck2.rotation.y = -0.9;
    floater(duck2, 0.14);

    const ball = (x, z, c) => {
      const g = new THREE.Group();
      g.position.set(x, 0.22, z);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), c);
      b.castShadow = true;
      g.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 6, 16), PM.white);
      band.rotation.x = Math.PI / 2;
      g.add(band);
      this.root.add(g);
      this.parkFloaters.push({ mesh: g, base: 0.22, phase: x * 1.3 + z });
    };
    ball(-1.0, -6.0, PM.pink);
    ball(8.2, -5.4, PM.sky);
    ball(-9.0, -10.4, PM.yellow);

    // beach balls on the sand
    const sandBall = (x, z, c) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), c);
      b.position.set(x, 0.34, z);
      b.castShadow = true;
      this.root.add(b);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 16), PM.white);
      band.position.copy(b.position);
      band.rotation.x = Math.PI / 2;
      this.root.add(band);
    };
    sandBall(-11.4, 4.4, PM.pink);
    sandBall(15.8, 17.2, PM.yellow);

    /* ===== splash pad (south-east) ===== */
    waterBody(12.8, 14.6, 2.45, 2.45, 0.08, 0.13);
    const padJet = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 8), PM.white);
    padJet.position.set(12.8, 0.3, 14.6);
    this.root.add(padJet);
    this.makeWaterJet(12.8, 0.5, 14.6, 18, 0.8);

    /* ===== cliff + waterfall (north) ===== */
    const cliffBlock = (x, y, z, w, h, d, mat, ry = 0) => {
      const b = this.makeRock(w, h, d, x * 13.7 + z * 7.1 + y * 3.3, mat);
      b.position.set(x, y, z);
      b.rotation.y = ry;
      this.root.add(b);
      return b;
    };
    const capGeo = new THREE.SphereGeometry(1, 14, 10);
    const cap = (x, y, z, r, mat, sy = 0.44) => {
      const c = new THREE.Mesh(capGeo, mat);
      c.scale.set(r, r * sy, r * 0.72);
      c.position.set(x, y, z);
      c.castShadow = true; c.receiveShadow = true;
      this.root.add(c);
    };
    const mossGeo = new THREE.SphereGeometry(1, 10, 7);
    const moss = (x, y, z, r) => {
      const m = new THREE.Mesh(mossGeo, PM.moss);
      m.scale.set(r, r * 0.32, r * 0.8);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.root.add(m);
    };

    // left massif
    cliffBlock(-17.4, 2.6, -19.9, 15.6, 5.2, 5.3, PM.rock, 0.02);
    cliffBlock(-17.6, 6.9, -20.1, 12.4, 3.6, 4.9, PM.rockLight, -0.03);
    cliffBlock(-22.2, 8.4, -19.4, 5.6, 4.4, 4.0, PM.rockDark, 0.05);
    cliffBlock(-12.6, 9.0, -20.3, 5.2, 5.4, 3.8, PM.rock, -0.04);
    cliffBlock(-17.4, 3.7, -17.16, 14.8, 0.5, 0.4, PM.rockDark, 0.02);
    cliffBlock(-17.4, 5.5, -17.16, 13.6, 0.4, 0.4, PM.rockDark, 0.02);
    this.solid(-17.4, 0, -19.8, 15.4, 8.6, 5.0, 'cliff');
    cap(-22.6, 10.4, -19.4, 2.5, PM.rockLight);
    cap(-17.8, 8.9, -20.2, 3.3, PM.rockLight);
    cap(-12.6, 11.4, -20.3, 2.6, PM.rock);
    moss(-21.9, 11.5, -18.8, 1.8);
    moss(-17.0, 10.6, -19.2, 1.5);
    moss(-12.6, 12.4, -19.5, 1.3);
    moss(-24.6, 5.2, -17.3, 1.1);
    // broken outcrops so the face does not read as a flat wall
    cliffBlock(-21.6, 2.2, -17.0, 3.4, 1.7, 1.0, PM.rockDark, 0.03);
    cliffBlock(-13.4, 1.8, -16.9, 2.8, 1.5, 0.9, PM.rockDark, -0.04);
    cliffBlock(-17.6, 6.2, -17.0, 3.0, 1.2, 0.8, PM.rockDark, 0.02);

    // right massif
    cliffBlock(17.4, 2.4, -19.9, 15.6, 4.8, 5.0, PM.rock, -0.02);
    cliffBlock(17.6, 6.4, -20.1, 12.2, 3.4, 4.6, PM.rockLight, 0.03);
    cliffBlock(22.4, 7.8, -19.5, 5.0, 4.0, 3.8, PM.rock, 0.04);
    cliffBlock(12.7, 8.4, -20.2, 5.0, 5.0, 3.6, PM.rockDark, -0.03);
    cliffBlock(17.4, 3.5, -17.23, 14.8, 0.5, 0.4, PM.rockDark, -0.02);
    cliffBlock(17.4, 5.3, -17.23, 13.4, 0.4, 0.4, PM.rockDark, -0.02);
    this.solid(17.4, 0, -19.8, 15.4, 8.0, 4.8, 'cliff');
    cap(22.8, 9.7, -19.5, 2.3, PM.rockLight);
    cap(17.8, 8.1, -20.1, 3.2, PM.rockLight);
    cap(12.7, 10.7, -20.2, 2.4, PM.rock);
    moss(22.1, 10.6, -18.9, 1.6);
    moss(17.2, 9.8, -19.1, 1.4);
    moss(12.9, 11.6, -19.4, 1.2);
    moss(24.7, 4.8, -17.2, 1.0);
    cliffBlock(21.8, 2.0, -17.0, 3.2, 1.6, 1.0, PM.rockDark, -0.03);
    cliffBlock(13.6, 1.6, -16.9, 2.6, 1.4, 0.9, PM.rockDark, 0.04);
    cliffBlock(17.6, 5.6, -17.0, 2.8, 1.1, 0.8, PM.rockDark, -0.02);

    // rock arch over the waterfall gap, with a forward lip the water spills from
    cliffBlock(-9.2, 4.2, -19.6, 2.8, 8.4, 4.6, PM.rockLight, 0.06);
    cliffBlock(9.2, 4.2, -19.6, 2.8, 8.4, 4.6, PM.rockLight, -0.06);
    // stepped rock terraces over the waterfall gap (reads as a mountain,
    // not a single 20 m wall)
    cliffBlock(0, 7.9, -19.4, 20.2, 1.8, 5.6, PM.rock, 0.01);
    cliffBlock(-0.5, 9.35, -19.9, 16.4, 1.4, 4.9, PM.rockLight, -0.03);
    cliffBlock(0.6, 10.75, -20.4, 12.2, 1.4, 4.2, PM.rock, 0.025);
    cliffBlock(-0.4, 11.85, -20.8, 8.0, 1.1, 3.4, PM.rockDark, -0.04);
    this.solid(-9.2, 0, -19.6, 2.8, 8.4, 4.4, 'cliff');
    this.solid(9.2, 0, -19.6, 2.8, 8.4, 4.4, 'cliff');
    this.solid(0, 7.0, -19.4, 20.2, 1.8, 5.6, 'cliff');
    cap(-6.6, 11.55, -20.4, 2.5, PM.rockLight);
    cap(0.4, 11.9, -20.8, 2.7, PM.rock);
    cap(6.8, 11.55, -20.4, 2.5, PM.rockLight);
    cap(-9.6, 10.05, -19.9, 2.1, PM.rockLight);
    cap(9.7, 10.05, -19.9, 2.1, PM.rockLight);
    moss(-3.9, 12.3, -20.2, 1.4);
    moss(4.1, 12.35, -20.2, 1.5);
    moss(-9.0, 10.9, -19.5, 1.15);
    moss(9.1, 10.9, -19.5, 1.15);
    moss(-11.6, 8.9, -17.9, 1.0);
    moss(11.7, 8.9, -17.9, 1.0);

    // cliff-top scrub and hanging vines
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x5cbb58, roughness: 0.92, metalness: 0 });
    const shrubMat2 = new THREE.MeshStandardMaterial({ color: 0x3f9e58, roughness: 0.92, metalness: 0 });
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x4fae4f, roughness: 0.9, metalness: 0 });
    const shrubGeo = this.blobGeometry(1, 0.7, 0.9, 3.3);
    const shrub = (x, y, z, s, mat) => {
      for (let k = 0; k < 2; k++){
        const b = new THREE.Mesh(shrubGeo, mat);
        b.scale.setScalar(s * (0.8 + k * 0.24));
        b.position.set(x + (k - 0.5) * s * 0.9, y + k * s * 0.12, z + (k % 2 ? s * 0.18 : -s * 0.16));
        b.castShadow = true;
        this.root.add(b);
      }
    };
    shrub(-21.0, 9.2, -18.6, 1.05, shrubMat2);
    shrub(-7.6, 11.5, -20.3, 0.95, shrubMat2);
    shrub(0.6, 11.6, -20.4, 1.0, shrubMat);
    shrub(7.9, 11.5, -20.3, 0.95, shrubMat2);
    shrub(15.4, 9.0, -18.4, 0.92, shrubMat);
    shrub(21.2, 10.6, -18.4, 1.05, shrubMat2);
    shrub(-26.0, 6.6, -18.8, 0.85, shrubMat);
    shrub(26.2, 6.5, -18.8, 0.85, shrubMat2);

    for (let i = 0; i < 9; i++){
      const x = -22.8 + i * 5.7 + (i % 2 ? 0.5 : -0.45);
      const len = 1.3 + (i % 3) * 0.75;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, 7.62, -16.72),
        new THREE.Vector3(x + 0.16, 7.62 - len * 0.5, -16.78),
        new THREE.Vector3(x - 0.12, 7.62 - len, -16.84),
      ]);
      const vine = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.05, 5, false), vineMat);
      this.root.add(vine);
      for (let k = 0; k < 2; k++){
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), k % 2 ? shrubMat : shrubMat2);
        leaf.scale.set(1.3, 0.22, 0.8);
        leaf.position.set(x + (k - 0.5) * 0.16, 7.5 - len * (0.35 + k * 0.3), -16.8);
        this.root.add(leaf);
      }
    }

    // rounded boulders breaking up the block silhouettes
    const boulder = (x, y, z, rx, ry, rz, mat, rot = 0, mossy = false) => {
      const b = new THREE.Mesh(this.blobGeometry(rx, ry, rz, x * 3.1 + z * 1.7 + y), mat);
      b.position.set(x, y, z);
      b.rotation.y = rot;
      b.castShadow = true; b.receiveShadow = true;
      this.root.add(b);
      if (mossy){
        const m = new THREE.Mesh(mossGeo, PM.moss);
        m.scale.set(rx * 0.9, rx * 0.3, rz * 0.85);
        m.position.set(x, y + ry * 0.72, z);
        this.root.add(m);
      }
    };
    boulder(-24.2, 3.2, -17.9, 2.6, 2.9, 1.6, PM.rockDark, 0.3, true);
    boulder(-20.6, 5.4, -17.6, 2.1, 2.4, 1.4, PM.rock, -0.2, true);
    boulder(-14.4, 4.6, -17.6, 2.4, 2.7, 1.5, PM.rockLight, 0.15, true);
    boulder(-10.6, 3.0, -17.4, 1.9, 2.2, 1.2, PM.rock, 0.5, true);
    boulder(-18.8, 9.4, -18.6, 2.8, 1.7, 1.9, PM.rockLight, -0.4, true);
    boulder(24.2, 3.0, -17.9, 2.5, 2.8, 1.6, PM.rockDark, -0.3, true);
    boulder(20.6, 5.2, -17.6, 2.0, 2.3, 1.4, PM.rock, 0.2, true);
    boulder(14.4, 4.4, -17.6, 2.3, 2.6, 1.5, PM.rockLight, -0.15, true);
    boulder(10.6, 2.9, -17.4, 1.8, 2.1, 1.2, PM.rock, -0.5, true);
    boulder(18.8, 9.2, -18.6, 2.7, 1.6, 1.9, PM.rockLight, 0.4, true);
    boulder(-6.2, 8.2, -18.4, 2.2, 1.5, 1.4, PM.rock, 0.25, true);
    boulder(6.2, 8.2, -18.4, 2.2, 1.5, 1.4, PM.rock, -0.25, true);
    boulder(-2.6, 10.9, -19.2, 2.4, 1.3, 1.5, PM.rockLight, 0.1, true);
    boulder(2.6, 10.9, -19.2, 2.4, 1.3, 1.5, PM.rockLight, -0.1, true);

    // protruding rock shelves so the cliff faces never read as flat slabs
    const shelf = (x, y, z, w, d, mat) => {
      const s = this.makeRock(w, 0.85, d, x * 2.7 + y * 5.1);
      s.position.set(x, y, z);
      this.root.add(s);
      const m = new THREE.Mesh(mossGeo, PM.moss);
      m.scale.set(w * 0.34, 0.16, d * 0.34);
      m.position.set(x, y + 0.44, z - d * 0.1);
      this.root.add(m);
    };
    shelf(-20.6, 4.3, -16.62, 6.2, 1.9, PM.rock);
    shelf(-13.6, 6.0, -16.66, 4.6, 1.7, PM.rockDark);
    shelf(-17.6, 8.0, -16.7, 5.0, 1.6, PM.rock);
    shelf(20.4, 4.1, -16.62, 6.0, 1.9, PM.rock);
    shelf(13.6, 5.8, -16.66, 4.4, 1.7, PM.rockDark);
    shelf(17.8, 7.8, -16.7, 4.8, 1.6, PM.rock);

    // end-cap outcrops so the massifs' side faces never read as flat walls
    const endRock = (x, y, z, w, h, d, seed, mat, ry = 0) => {
      const r = this.makeRock(w, h, d, seed, mat);
      r.position.set(x, y, z);
      r.rotation.y = ry;
      this.root.add(r);
    };
    endRock(-26.4, 2.9, -19.4, 6.4, 5.8, 4.8, 7.7, PM.rock, 0.2);
    endRock(-27.6, 4.0, -17.2, 4.4, 7.4, 3.6, 9.1, PM.rockLight, -0.35);
    endRock(-25.2, 6.4, -18.2, 3.2, 4.6, 3.0, 12.3, PM.rockDark, 0.5);
    endRock(26.4, 2.8, -19.4, 6.2, 5.6, 4.8, 8.1, PM.rock, -0.2);
    endRock(27.6, 3.8, -17.2, 4.2, 7.0, 3.6, 10.4, PM.rockLight, 0.35);
    endRock(25.2, 6.2, -18.2, 3.2, 4.4, 3.0, 13.7, PM.rockDark, -0.5);

    // layered outcrops standing in front of the massif faces
    const outcrop = (x, y, z, w, h, d, seed, mat, ry = 0) => {
      const r = this.makeRock(w, h, d, seed, mat);
      r.position.set(x, y, z);
      r.rotation.y = ry;
      this.root.add(r);
    };
    outcrop(-21.6, 2.0, -16.9, 4.4, 4.0, 1.9, 41.2, PM.rock, 0.12);
    outcrop(-16.2, 4.7, -16.95, 3.8, 3.6, 1.7, 43.8, PM.rockLight, -0.2);
    outcrop(-11.4, 1.9, -16.9, 3.0, 3.8, 1.6, 47.1, PM.rock, 0.3);
    outcrop(-24.2, 5.4, -17.0, 3.2, 2.8, 1.6, 49.6, PM.rockDark, 0.1);
    outcrop(21.6, 2.0, -16.9, 4.2, 4.0, 1.9, 51.3, PM.rock, -0.12);
    outcrop(16.2, 4.6, -16.95, 3.6, 3.4, 1.7, 53.9, PM.rockLight, 0.2);
    outcrop(11.4, 1.8, -16.9, 2.9, 3.6, 1.6, 57.2, PM.rock, -0.3);
    outcrop(24.2, 5.2, -17.0, 3.0, 2.7, 1.6, 59.4, PM.rockDark, -0.1);

    // low ridge behind the enemy spawns (closes the horizon)
    for (let i = 0; i < 6; i++){
      const x = -26 + i * 10.4;
      const h = 3.6 + (i % 3) * 0.9;
      cliffBlock(x, h / 2, -36.6, 10.8, h, 3.0, i % 2 ? PM.rockDark : PM.rock, (i % 2 ? 0.02 : -0.02));
      cap(x, h, -36.6, 5.2, i % 2 ? PM.rockLight : PM.rock, 0.4);
      this.solid(x, 0, -36.6, 10.4, h, 2.8, 'cliff');
    }

    // tropical greenery crowning the cliffs
    const cliffPalmA = this.makePalm(0.6);
    cliffPalmA.position.set(-22.2, 11.0, -20.3);
    cliffPalmA.rotation.y = 1.1;
    this.root.add(cliffPalmA);
    const cliffPalmB = this.makePalm(0.55);
    cliffPalmB.position.set(22.3, 10.2, -20.2);
    cliffPalmB.rotation.y = 2.4;
    this.root.add(cliffPalmB);

    // shaded grotto wall behind the falls so the water reads bright against it
    const grotto = this.makeRock(15.6, 7.8, 1.8, 4.2, PM.rockDark);
    grotto.position.set(0, 3.9, -18.85);
    this.root.add(grotto);
    // wet rock wall right behind the falls (textured, not a flat panel)
    const wetRock = this.makeRock(17.6, 8.6, 1.3, 6.9, PM.rockDark);
    wetRock.position.set(0, 4.0, -17.7);
    this.root.add(wetRock);

    // waterfall sheets (never colliders) — tight to the rock face, two
    // offset layers so the strands do not line up into a glass sheet
    const wfTex = this.makeWaterfallTexture();
    const wfMat = new THREE.MeshBasicMaterial({
      map: wfTex, transparent: true, opacity: 0.82,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: 0xdff8ff,
    });
    const wfTexB = wfTex.clone();
    wfTexB.needsUpdate = true;
    wfTexB.repeat.set(1.18, 1);
    const wfMatB = wfMat.clone();
    wfMatB.map = wfTexB;
    wfMatB.opacity = 0.6;
    this.waterfallMats.push(wfMat, wfMatB);
    const wfGeo = new THREE.PlaneGeometry(5.2, 7.9);
    for (let i = 0; i < 2; i++){
      const fall = new THREE.Mesh(wfGeo, i % 2 ? wfMatB : wfMat);
      fall.position.set(-3.5 + i * 7.0, 3.96, -17.02 + (i % 2 ? 0.03 : 0));
      this.root.add(fall);
    }
    // rock nose splitting the cascade into two streams
    const nose = this.makeRock(1.7, 8.0, 1.5, 17.4, PM.rock);
    nose.position.set(0, 4.0, -16.86);
    this.root.add(nose);
    // splash pool where the falls land, touching the lagoon
    waterBody(0, -16.2, 7.0, 2.8, 0.09, 0.14);
    this.makeWaterJet(0, 0.35, -14.6, 82, 2.6);
    this.makeWaterJet(-4.4, 0.3, -14.9, 46, 1.8);
    this.makeWaterJet(4.4, 0.3, -14.9, 46, 1.8);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 32), PM.foam);
    foam.rotation.x = -Math.PI / 2;
    foam.scale.set(5.4, 1.5, 1);
    foam.position.set(0, 0.12, -17.2);
    this.root.add(foam);

    // drifting spray at the foot of the falls
    this.fallMist = [];
    for (let i = 0; i < 6; i++){
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.assets.sprites.smoke, transparent: true,
        opacity: 0.16, depthWrite: false, color: 0xf4feff,
      }));
      const x = -7.2 + i * 2.9;
      sp.position.set(x, 0.9 + (i % 3) * 0.5, -16.4 + (i % 2) * 0.3);
      sp.scale.set(4.4, 3.0, 1);
      this.root.add(sp);
      this.fallMist.push({ sp, phase: i * 1.3, baseY: sp.position.y, baseS: 4.4 });
    }

    // scattered wet boulders at the cliff foot
    for (const [bx, bz, br] of [[-23.5, -15.8, 1.4], [-11.4, -15.4, 1.0], [22.8, -15.6, 1.3], [11.2, -15.2, 0.9]]){
      const b = new THREE.Mesh(new THREE.SphereGeometry(br, 12, 8), PM.rock);
      b.scale.set(1.2, 0.6, 1);
      b.position.set(bx, br * 0.3, bz);
      b.castShadow = true; b.receiveShadow = true;
      this.root.add(b);
      this.solid(bx, 0, bz, br * 1.9, br * 0.9, br * 1.5, 'rock');
    }

    /* ===== slide tower (west) ===== */
    const tx = -16, tz = 0;
    const UP = new THREE.Vector3(0, 1, 0);

    // chunky fiberglass columns: white shafts, blue feet and caps, candy collars
    const colShaftGeo = new THREE.CylinderGeometry(0.3, 0.38, 8.0, 12);
    const colCapGeo = new THREE.SphereGeometry(0.31, 12, 8);
    const colFootGeo = new THREE.CylinderGeometry(0.46, 0.54, 0.5, 12);
    const collarGeo = new THREE.TorusGeometry(0.345, 0.085, 6, 16);
    const colDummy = new THREE.Object3D();
    const shafts = new THREE.InstancedMesh(colShaftGeo, PM.white, 4);
    const colCaps = new THREE.InstancedMesh(colCapGeo, PM.blue, 4);
    const colFeet = new THREE.InstancedMesh(colFootGeo, PM.blue, 4);
    const colBandA = new THREE.InstancedMesh(collarGeo, PM.yellow, 4);
    const colBandB = new THREE.InstancedMesh(collarGeo, PM.pink, 4);
    [[-1.55, -1.55], [1.55, -1.55], [-1.55, 1.55], [1.55, 1.55]].forEach(([sx, sz], i) => {
      const px = tx + sx, pz = tz + sz;
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(px, 4.0, pz);
      colDummy.updateMatrix(); shafts.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 8.0, pz);
      colDummy.updateMatrix(); colCaps.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 0.25, pz);
      colDummy.updateMatrix(); colFeet.setMatrixAt(i, colDummy.matrix);
      colDummy.rotation.set(Math.PI / 2, 0, 0);
      colDummy.position.set(px, 2.45, pz);
      colDummy.updateMatrix(); colBandA.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 5.95, pz);
      colDummy.updateMatrix(); colBandB.setMatrixAt(i, colDummy.matrix);
      this.solid(px, 0, pz, 0.92, 8.0, 0.92, 'prop');
    });
    for (const m of [shafts, colCaps, colFeet, colBandA, colBandB]){
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
    }

    // light X-bracing and tie beams between the columns
    const braceGeo = new THREE.BoxGeometry(7.0, 0.13, 0.13);
    const braces = new THREE.InstancedMesh(braceGeo, PM.sky, 4);
    let braceIdx = 0;
    for (const sz of [-1.55, 1.55]){
      for (const s of [-1, 1]){
        colDummy.rotation.set(0, 0, s * 1.13);
        colDummy.position.set(tx, 4.05, tz + sz);
        colDummy.updateMatrix();
        braces.setMatrixAt(braceIdx++, colDummy.matrix);
      }
    }
    braces.instanceMatrix.needsUpdate = true;
    braces.castShadow = true;
    this.root.add(braces);
    const tieGeo = new THREE.BoxGeometry(3.24, 0.13, 0.13);
    const ties = new THREE.InstancedMesh(tieGeo, PM.sky, 4);
    let tieIdx = 0;
    for (const s of [-1.55, 1.55]){
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(tx, 4.05, tz + s);
      colDummy.updateMatrix();
      ties.setMatrixAt(tieIdx++, colDummy.matrix);
      colDummy.rotation.set(0, Math.PI / 2, 0);
      colDummy.position.set(tx + s, 4.05, tz);
      colDummy.updateMatrix();
      ties.setMatrixAt(tieIdx++, colDummy.matrix);
    }
    ties.instanceMatrix.needsUpdate = true;
    this.root.add(ties);

    // deck with a sturdy blue fascia
    const deck = this.box(4.9, 0.34, 4.9, PM.cream, 1.3);
    deck.position.set(tx, 7.72, tz);
    this.root.add(deck);
    this.solid(tx, 7.55, tz, 4.9, 0.34, 4.9, 'prop');
    const deckSkirt = this.box(5.06, 0.2, 5.06, PM.blue, 1.3);
    deckSkirt.position.set(tx, 7.49, tz);
    this.root.add(deckSkirt);

    // thatched/pink roof with a flag on the finial
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.9, 10), PM.pink);
    roof.position.set(tx, 9.35, tz);
    roof.castShadow = true;
    this.root.add(roof);
    const fringe = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.16, 6, 26), PM.straw);
    fringe.rotation.x = Math.PI / 2;
    fringe.position.set(tx, 8.44, tz);
    this.root.add(fringe);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), PM.yellow);
    finial.position.set(tx, 10.34, tz);
    this.root.add(finial);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6), PM.white);
    flagPole.position.set(tx, 11.15, tz);
    this.root.add(flagPole);
    const roofFlag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x2c9ce6, roughness: 0.85, side: THREE.DoubleSide }));
    roofFlag.position.set(tx + 0.5, 11.48, tz);
    this.root.add(roofFlag);

    // railing
    const railPostGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6);
    const railPosts = new THREE.InstancedMesh(railPostGeo, PM.white, 7);
    let railIdx = 0;
    for (let i = 0; i < 8; i++){
      if (i === 4) continue; // gap for the stair
      const a = i / 8 * Math.PI * 2;
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(tx + Math.cos(a) * 2.12, 8.2, tz + Math.sin(a) * 2.12);
      colDummy.updateMatrix();
      railPosts.setMatrixAt(railIdx++, colDummy.matrix);
    }
    railPosts.instanceMatrix.needsUpdate = true;
    this.root.add(railPosts);
    const railTop = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.06, 5, 28), PM.blue);
    railTop.rotation.x = Math.PI / 2;
    railTop.position.set(tx, 8.68, tz);
    this.root.add(railTop);

    // enclosed stair: stringers, treads, balusters and handrails
    const stairTopX = tx - 2.35, stairBotX = tx - 9.1;
    const stairTopY = 7.55, stairBotY = 0.1;
    const stairRun = stairTopX - stairBotX, stairRise = stairTopY - stairBotY;
    const stairAngle = Math.atan2(stairRise, stairRun);
    const stairLen = Math.hypot(stairRun, stairRise);
    const stringerGeo = new THREE.BoxGeometry(stairLen + 0.25, 0.42, 0.16);
    for (const sz of [-0.72, 0.72]){
      const st = new THREE.Mesh(stringerGeo, PM.white);
      st.position.set((stairTopX + stairBotX) / 2, (stairTopY + stairBotY) / 2 - 0.14, tz + sz);
      st.rotation.z = stairAngle;
      st.castShadow = true; st.receiveShadow = true;
      this.root.add(st);
    }
    const stairDummy = new THREE.Object3D();
    const stepCount = 15;
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.14, 1.5), PM.blue, stepCount);
    for (let i = 0; i < stepCount; i++){
      const t = (i + 0.5) / stepCount;
      stairDummy.position.set(stairBotX + stairRun * t, stairBotY + stairRise * t - 0.05, tz);
      stairDummy.updateMatrix();
      steps.setMatrixAt(i, stairDummy.matrix);
    }
    steps.instanceMatrix.needsUpdate = true;
    steps.castShadow = true; steps.receiveShadow = true;
    this.root.add(steps);
    const handRailGeo = new THREE.BoxGeometry(stairLen + 0.25, 0.1, 0.1);
    for (const sz of [-0.72, 0.72]){
      const hr = new THREE.Mesh(handRailGeo, PM.blue);
      hr.position.set((stairTopX + stairBotX) / 2, (stairTopY + stairBotY) / 2 + 0.86, tz + sz);
      hr.rotation.z = stairAngle;
      this.root.add(hr);
    }
    const balusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 5), PM.white, 12);
    for (let i = 0; i < 12; i++){
      const side = i < 6 ? -0.72 : 0.72;
      const t = ((i % 6) + 0.5) / 6;
      stairDummy.position.set(stairBotX + stairRun * t, stairBotY + stairRise * t + 0.42, tz + side);
      stairDummy.updateMatrix();
      balusters.setMatrixAt(i, stairDummy.matrix);
    }
    balusters.instanceMatrix.needsUpdate = true;
    this.root.add(balusters);

    // slide chutes curving to the plaza
    const troughMat = PM.white.clone();
    troughMat.side = THREE.DoubleSide;
    const troughGeo = new THREE.CylinderGeometry(0.72, 0.72, 1.5, 16, 1, true, -Math.PI / 2, Math.PI);
    const foamRingGeo = new THREE.TorusGeometry(0.66, 0.1, 6, 20);
    const lobeGeo = new THREE.SphereGeometry(0.17, 8, 6);
    const chute = (pts, mat, ribMat, ringMat) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.62, 12, false), mat);
      tube.castShadow = true;
      this.root.add(tube);
      const ribGeo = new THREE.TorusGeometry(0.655, 0.085, 6, 16);
      for (const t of [0.34, 0.64]){
        const p = curve.getPoint(t), tan = curve.getTangent(t).normalize();
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.copy(p);
        rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        rib.castShadow = true;
        this.root.add(rib);
      }
      // colorful play-mouth ring with clover lobes around the chute start
      const mp = curve.getPoint(0.015), mt = curve.getTangent(0.015).normalize();
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.13, 8, 22), ringMat);
      mouth.position.copy(mp);
      mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mt);
      mouth.castShadow = true;
      this.root.add(mouth);
      const ax = new THREE.Vector3().crossVectors(mt, UP).normalize();
      const ay = new THREE.Vector3().crossVectors(mt, ax).normalize();
      const lobeCols = [PM.yellow, PM.sky, PM.pink];
      for (let i = 0; i < 3; i++){
        const a = i * Math.PI * 2 / 3 + 0.5;
        const lobe = new THREE.Mesh(lobeGeo, lobeCols[i]);
        lobe.position.copy(mp).addScaledVector(ax, Math.cos(a) * 0.84).addScaledVector(ay, Math.sin(a) * 0.84);
        this.root.add(lobe);
      }
      const end = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 6, 16), PM.white);
      end.position.copy(curve.getPoint(1));
      end.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(1).normalize());
      this.root.add(end);
      // splash exit: white half-pipe trough + foam ring + droplets
      const ep = curve.getPoint(0.96);
      const et = curve.getTangent(0.96).setY(0).normalize();
      const trough = new THREE.Mesh(troughGeo, troughMat);
      trough.position.set(ep.x + et.x * 0.5, 0.7, ep.z + et.z * 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, et);
      const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const DOWN = new THREE.Vector3(0, -1, 0);
      let roll = localZ.angleTo(DOWN);
      if (new THREE.Vector3().crossVectors(localZ, DOWN).dot(et) < 0) roll = -roll;
      trough.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
      trough.castShadow = true; trough.receiveShadow = true;
      this.root.add(trough);
      const froth = new THREE.Mesh(foamRingGeo, PM.foam);
      froth.rotation.x = -Math.PI / 2;
      froth.scale.set(1.15, 0.85, 1);
      froth.position.set(ep.x + et.x * 1.0, 0.22, ep.z + et.z * 1.0);
      this.root.add(froth);
      const splash = new THREE.Mesh(lobeGeo, PM.white);
      splash.position.set(ep.x - et.x * 0.4, 0.45, ep.z - et.z * 0.4);
      this.root.add(splash);
    };
    chute([[-16.4, 7.35, 1.8], [-16.0, 6.1, 3.6], [-14.9, 4.1, 6.0], [-13.2, 2.0, 8.0], [-11.9, 0.95, 9.2]], PM.white, PM.blue, PM.pink);
    chute([[-15.3, 7.35, 1.9], [-14.6, 5.8, 3.9], [-13.4, 3.6, 6.3], [-12.2, 1.7, 8.4], [-11.0, 0.85, 9.7]], PM.yellow, PM.yellow, PM.sky);

    // landing pool at the slide mouths
    waterBody(-10.6, 9.6, 2.3, 2.3, 0.08, 0.13);

    // lifebuoy + banner rope + painted water-drop sign
    const buoy = this.makeLifebuoy(0.56);
    buoy.position.set(tx + 1.55, 5.2, tz + 1.95);
    this.root.add(buoy);
    const bannerBar = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.08), PM.white);
    bannerBar.position.set(tx, 7.42, tz + 2.02);
    this.root.add(bannerBar);
    for (let i = 0; i < 3; i++){
      const b = this.makeBanner(i % 2 ? 0xf07ba8 : 0x2a8fd8, 1.0, 1.6);
      b.position.set(tx - 1.0 + i * 1.0, 6.55, tz + 2.06);
      this.root.add(b);
    }
    if (!this._dropSignTex){
      this._dropSignTex = this.assets.canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#2c9ce6';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff6e2';
        ctx.fillRect(10, 10, w - 20, h - 20);
        ctx.fillStyle = '#2c9ce6';
        ctx.beginPath();
        ctx.moveTo(w / 2, 40);
        ctx.bezierCurveTo(w / 2 + 16, 84, w / 2 + 54, 116, w / 2 + 54, 150);
        ctx.arc(w / 2, 150, 54, 0, Math.PI, false);
        ctx.bezierCurveTo(w / 2 - 54, 116, w / 2 - 16, 84, w / 2, 40);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.82)';
        ctx.beginPath();
        ctx.ellipse(w / 2 - 19, 138, 9, 17, -0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8fe0ff';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(56, 220);
        ctx.quadraticCurveTo(92, 200, 128, 220);
        ctx.quadraticCurveTo(164, 240, 200, 220);
        ctx.stroke();
      });
      this._dropSignMat = new THREE.MeshStandardMaterial({ map: this._dropSignTex, roughness: 0.72, metalness: 0 });
    }
    const dropSign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), this._dropSignMat);
    dropSign.position.set(tx - 1.55, 4.85, tz + 1.97);
    this.root.add(dropSign);

    /* ===== giant inflatable arches ===== */
    const arch = (cx, cz, cols) => {
      const segs = 8, r = 3.0, arc = Math.PI / segs;
      const geo = new THREE.TorusGeometry(r, 0.58, 10, 20, arc + 0.025);
      for (let i = 0; i < segs; i++){
        const m = new THREE.Mesh(geo, cols[i % cols.length]);
        m.rotation.z = i * arc;
        m.position.set(cx, 0.18, cz);
        m.castShadow = true; m.receiveShadow = true;
        this.root.add(m);
      }
      const valve = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), cols[0]);
      valve.position.set(cx, r + 0.2, cz);
      this.root.add(valve);
      this.solid(cx - r, 0, cz, 1.2, 2.2, 1.5, 'prop');
      this.solid(cx + r, 0, cz, 1.2, 2.2, 1.5, 'prop');
    };
    arch(-18, 12, [PM.blue, PM.yellow]);
    arch(18, 12, [PM.pink, PM.yellow]);

    /* ===== cabanas ===== */
    const cabana = (x, z, trimMat) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.root.add(g);
      const deck = this.box(3.7, 0.16, 3.7, PM.cream, 1.2);
      deck.position.y = 0.08;
      g.add(deck);
      for (const [sx, sz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]){
        const p = this.box(0.16, 3.0, 0.16, PM.white);
        p.position.set(sx, 1.58, sz);
        g.add(p);
        this.solid(x + sx, 0, z + sz, 0.36, 3.0, 0.36, 'prop');
      }
      const roofMat = new THREE.MeshStandardMaterial({ color: 0xf1dcae, roughness: 0.95, metalness: 0 });
      const strawRoof = new THREE.Mesh(new THREE.ConeGeometry(2.95, 1.4, 4), roofMat);
      strawRoof.position.y = 3.75;
      strawRoof.rotation.y = Math.PI / 4;
      strawRoof.castShadow = true;
      g.add(strawRoof);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.11, 6, 4), trimMat);
      trim.rotation.x = Math.PI / 2;
      trim.rotation.z = Math.PI / 4;
      trim.position.y = 3.08;
      g.add(trim);
      for (let i = 0; i < 5; i++){
        const slat = this.box(0.5, 1.65, 0.08, i % 2 ? PM.white : PM.sky);
        slat.position.set(-1.4 + i * 0.7, 1.05, -1.55);
        g.add(slat);
      }
      this.solid(x, 0, z - 1.55, 3.3, 1.75, 0.3, 'prop');
      const buoy = this.makeLifebuoy(0.46);
      buoy.position.set(1.95, 1.6, 1.1);
      buoy.rotation.y = 0.35;
      g.add(buoy);
    };
    cabana(-20, 8, PM.pink);
    cabana(20, 6, PM.blue);

    /* ===== lifeguard chair ===== */
    {
      const lx = 11.6, lz = -3.4;
      const g = new THREE.Group();
      g.position.set(lx, 0, lz);
      g.rotation.y = Math.atan2(-lx, -lz - 8);
      this.root.add(g);
      const legMat = PM.white;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.1, 8), legMat);
        leg.position.set(sx * 0.55, 1.05, sz * 0.45);
        leg.rotation.z = -sx * 0.09;
        leg.rotation.x = sz * 0.08;
        leg.castShadow = true;
        g.add(leg);
      }
      const deck = this.box(1.5, 0.14, 1.2, PM.white, 1.2);
      deck.position.y = 2.05;
      g.add(deck);
      const seat = this.box(1.25, 0.16, 0.95, PM.red, 1.2);
      seat.position.set(0, 2.18, 0.05);
      g.add(seat);
      const back = this.box(1.25, 0.95, 0.14, PM.white, 1.2);
      back.position.set(0, 2.68, -0.44);
      back.rotation.x = -0.12;
      g.add(back);
      const rail = this.box(1.5, 0.1, 0.1, PM.white);
      rail.position.set(0, 2.95, 0.55);
      g.add(rail);
      for (const sx of [-0.7, 0.7]){
        const post = this.box(0.1, 0.85, 0.1, PM.white);
        post.position.set(sx, 2.5, 0.55);
        g.add(post);
      }
      const buoy = this.makeLifebuoy(0.34);
      buoy.position.set(0, 2.62, -0.56);
      g.add(buoy);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.42, 8), PM.yellow);
      shade.position.set(0, 3.42, 0);
      shade.castShadow = true;
      g.add(shade);
      const shadePole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), PM.white);
      shadePole.position.set(0, 3.0, -0.2);
      g.add(shadePole);
      // ladder rungs on the back
      for (let i = 0; i < 5; i++){
        const rung = this.box(0.62, 0.07, 0.16, PM.white);
        rung.position.set(0, 0.4 + i * 0.4, -0.62);
        g.add(rung);
      }
      this.solid(lx, 0, lz, 1.7, 2.2, 1.5, 'prop');
    }

    /* ===== drink stand ===== */
    {
      const dx = -12.8, dz = 14.4;
      const g = new THREE.Group();
      g.position.set(dx, 0, dz);
      g.rotation.y = 0.18;
      this.root.add(g);
      const counter = this.box(2.9, 1.05, 1.0, PM.white, 1.2);
      counter.position.set(0, 0.52, 0);
      g.add(counter);
      const bandA = this.box(2.94, 0.22, 1.04, PM.blue);
      bandA.position.set(0, 0.72, 0);
      g.add(bandA);
      const backWall = this.box(2.9, 1.8, 0.16, PM.blueDeep);
      backWall.position.set(0, 1.85, -0.46);
      g.add(backWall);
      // striped awning
      for (let i = 0; i < 6; i++){
        const strip = this.box(0.5, 0.09, 1.7, i % 2 ? PM.white : PM.red);
        strip.position.set(-1.25 + i * 0.5, 2.72, 0.28);
        strip.rotation.x = 0.3;
        g.add(strip);
      }
      for (const sx of [-1.35, 1.35]){
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 6), PM.white);
        post.position.set(sx, 1.35, 0.95);
        g.add(post);
      }
      // cups, jug and a little blender
      const cupCols = [PM.sky, PM.yellow, PM.pink, PM.white];
      for (let i = 0; i < 4; i++){
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 10), cupCols[i]);
        cup.position.set(-1.0 + i * 0.28, 1.16, 0.16);
        g.add(cup);
      }
      const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 12), PM.sky);
      jug.position.set(0.78, 1.26, 0.04);
      g.add(jug);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), PM.white);
      lid.scale.y = 0.5;
      lid.position.set(0.78, 1.48, 0.04);
      g.add(lid);
      const menu = this.box(0.9, 0.6, 0.06, PM.cream);
      menu.position.set(-1.0, 1.7, -0.36);
      menu.rotation.z = 0.06;
      g.add(menu);
      this.solid(dx, 0, dz, 3.1, 1.6, 1.2, 'prop');
    }

    /* ===== locker bank ===== */
    {
      const kx = 16.4, kz = 2.2;
      const g = new THREE.Group();
      g.position.set(kx, 0, kz);
      g.rotation.y = -1.35;
      this.root.add(g);
      const shell = this.box(2.5, 2.0, 0.62, PM.blueDeep, 1.2);
      shell.position.set(0, 1.0, 0);
      g.add(shell);
      const cap = this.box(2.62, 0.14, 0.72, PM.white, 1.2);
      cap.position.set(0, 2.06, 0);
      g.add(cap);
      for (let i = 0; i < 3; i++){
        const door = this.box(0.72, 1.66, 0.07, i % 2 ? PM.blue : PM.sky);
        door.position.set(-0.8 + i * 0.8, 1.02, 0.33);
        g.add(door);
        const vet = this.box(0.42, 0.06, 0.02, PM.blueDeep);
        vet.position.set(-0.8 + i * 0.8, 1.7, 0.37);
        g.add(vet);
        const handle = this.box(0.06, 0.2, 0.06, PM.white);
        handle.position.set(-0.5 + i * 0.8, 1.05, 0.38);
        g.add(handle);
        const plate = this.box(0.18, 0.18, 0.02, PM.white);
        plate.position.set(-0.8 + i * 0.8, 1.32, 0.38);
        g.add(plate);
      }
      this.solid(kx, 0, kz, 2.7, 2.1, 1.0, 'prop');
    }

    /* ===== beach cover crates ===== */
    const crate = (x, z, s, ry = 0) => {
      const h = s;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.root.add(g);
      const body = new THREE.Mesh(new RoundedBoxGeometry(s, h, s * 0.94, 3, s * 0.08), PM.woodPale);
      body.position.y = h / 2;
      body.castShadow = true; body.receiveShadow = true;
      g.add(body);
      // pale frame so the crates read as park props, not shipping boxes
      for (const sx of [-1, 1]) for (const sz of [-1, 1]){
        const post = this.box(s * 0.1, h * 0.99, s * 0.1, PM.white);
        post.position.set(sx * (s / 2 - s * 0.045), h / 2, sz * (s / 2 - s * 0.042));
        g.add(post);
      }
      for (const yy of [0.08, 0.92]){
        const band = this.box(s * 1.01, h * 0.075, s * 0.95, PM.white);
        band.position.set(0, h * yy, 0);
        g.add(band);
      }
      const decal = new THREE.Mesh(
        new THREE.PlaneGeometry(s * 0.4, s * 0.46),
        decalTextureMaterial(this.assets.decals.splash, 0.8)
      );
      decal.position.set(0, h * 0.52, s * 0.474);
      g.add(decal);
      this.solid(x, 0, z, s * 1.06, h, s * 1.02, 'crate');
      return g;
    };
    crate(7.0, 10.1, 2.0, 0.12);
    crate(9.1, 11.8, 1.7, -0.2);
    crate(6.5, 12.9, 1.5, 0.3);
    crate(8.3, 13.9, 1.9, -0.08);
    const topCrate = this.box(1.4, 1.4, 1.3, PM.woodPale, 1.1);
    topCrate.position.set(7.0, 2.7, 10.1);
    topCrate.rotation.y = 0.4;
    this.root.add(topCrate);
    this.solid(7.0, 2.0, 10.1, 1.5, 1.4, 1.4, 'crate');

    /* ===== foreground beach play details ===== */
    {
      // pool noodles leaning in a rack
      const nx = -12.2, nz = 17.4;
      const rack = this.box(1.4, 0.86, 0.5, PM.white);
      rack.position.set(nx, 0.43, nz);
      this.root.add(rack);
      const noodleCols = [PM.pink, PM.yellow, PM.sky, PM.red, PM.blue];
      for (let i = 0; i < 5; i++){
        const noodle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.15, 10), noodleCols[i]);
        noodle.position.set(nx - 0.5 + i * 0.25, 1.12, nz + 0.04);
        noodle.rotation.z = 0.1 + i * 0.018;
        noodle.rotation.x = -0.07;
        noodle.castShadow = true;
        this.root.add(noodle);
        const plug = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7), PM.cream);
        plug.position.set(noodle.position.x - Math.sin(noodle.rotation.z) * 1.05, 2.18, nz + 0.04);
        this.root.add(plug);
      }
      this.solid(nx, 0, nz, 1.6, 0.9, 0.7, 'prop');

      // sandcastle with bucket and spade
      const sx2 = -8.6, sz2 = 18.2;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.98, 0.46, 12), PM.straw);
      base.position.set(sx2, 0.23, sz2);
      base.castShadow = true; base.receiveShadow = true;
      this.root.add(base);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.66, 10), PM.straw);
      tower.position.set(sx2 - 0.18, 0.72, sz2 + 0.1);
      tower.castShadow = true;
      this.root.add(tower);
      const tower2 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.44, 9), PM.straw);
      tower2.position.set(sx2 + 0.34, 0.58, sz2 - 0.16);
      tower2.castShadow = true;
      this.root.add(tower2);
      const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), PM.white);
      flagPole.position.set(sx2 - 0.18, 1.3, sz2 + 0.1);
      this.root.add(flagPole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xf2545b, side: THREE.DoubleSide, roughness: 0.8 }));
      flag.position.set(sx2 - 0.06, 1.5, sz2 + 0.1);
      this.root.add(flag);
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 12), PM.blue);
      bucket.position.set(sx2 + 0.8, 0.13, sz2 + 0.5);
      bucket.castShadow = true;
      this.root.add(bucket);
      const bucketRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 4, 14), PM.white);
      bucketRim.rotation.x = Math.PI / 2;
      bucketRim.position.set(sx2 + 0.8, 0.26, sz2 + 0.5);
      this.root.add(bucketRim);
      const spade = this.box(0.05, 0.02, 0.44, PM.yellow);
      spade.position.set(sx2 + 0.5, 0.03, sz2 + 0.62);
      spade.rotation.y = 0.6;
      this.root.add(spade);
      this.solid(sx2, 0, sz2, 1.9, 0.6, 1.9, 'prop');

      // beach ball resting on the sand
      const ballR = 0.42;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 18, 14), PM.white);
      ball.position.set(11.9, ballR, 16.4);
      ball.castShadow = true;
      this.root.add(ball);
      const stripeCols = [PM.red, PM.yellow, PM.blue, PM.pink];
      for (let i = 0; i < 4; i++){
        const seg = new THREE.Mesh(new THREE.SphereGeometry(ballR * 1.002, 18, 14, i * Math.PI / 2, Math.PI / 4, 0.5, 1.3), stripeCols[i]);
        seg.position.copy(ball.position);
        seg.rotation.z = 0.4;
        this.root.add(seg);
      }
    }

    /* ===== beach furniture ===== */
    const umbrella = (x, z, c1, c2, ry = 0) => {
      const u = this.makeUmbrella(c1, c2);
      u.position.set(x, 0, z);
      u.rotation.y = ry;
      this.root.add(u);
      this.solid(x, 0, z, 0.18, 2.9, 0.18, 'prop');
      const towel = this.box(1.0, 0.04, 1.8, c2);
      towel.position.set(x + 1.7, 0.035, z + 1.1);
      towel.rotation.y = 0.5;
      this.root.add(towel);
    };
    umbrella(-9.6, 17.6, PM.pink, PM.white, 0.3);
    umbrella(9.4, 18.4, PM.blue, PM.yellow, -0.4);
    umbrella(-11.2, 9.6, PM.yellow, PM.white, 0.8);
    umbrella(12.4, 10.8, PM.sky, PM.pink, -1.1);

    const chair = (x, z, ry, color) => {
      const c = this.makeLoungeChair(color);
      c.position.set(x, 0, z);
      c.rotation.y = ry;
      this.root.add(c);
    };
    chair(-11.2, 18.9, 0.25, PM.blue);
    chair(-8.0, 19.2, 0.4, PM.pink);
    chair(10.6, 19.6, -0.3, PM.yellow);
    chair(8.0, 19.9, -0.45, PM.sky);
    chair(-12.2, -2.0, 0.6, PM.pink);
    chair(-9.0, -2.3, 0.55, PM.blue);
    chair(12.6, -2.4, -0.7, PM.yellow);

    /* ===== blue banners with water-drop signs ===== */
    const bannerPole = (x, z, ry, bg) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.8, 7), PM.white);
      pole.position.y = 2.4; pole.castShadow = true; g.add(pole);
      const banner = this.makeBanner(bg, 1.3, 1.95);
      banner.position.set(0.72, 3.4, 0);
      g.add(banner);
      this.root.add(g);
      this.solid(x, 0, z, 0.32, 4.8, 0.32, 'prop');
    };
    bannerPole(-13.4, 15.2, 0.2, 0x2a8fd8);
    bannerPole(14.2, 9.6, -0.3, 0xf07ba8);
    bannerPole(-27.6, 13.2, 0.0, 0x2a8fd8);
    bannerPole(27.6, 13.6, 0.0, 0xf07ba8);
    bannerPole(-5.9, 16.2, 0.05, 0x2a8fd8);
    bannerPole(5.9, 16.2, -0.05, 0xf07ba8);

    // lifebuoy stands by the cabanas
    for (const [bx, bz] of [[-18.4, 9.4], [18.4, 7.6]]){
      const stand = this.box(0.14, 1.8, 0.14, PM.woodDark);
      stand.position.set(bx, 0.9, bz);
      this.root.add(stand);
      const ring = this.makeLifebuoy(0.44);
      ring.position.set(bx, 1.45, bz + 0.12);
      this.root.add(ring);
      this.solid(bx, 0, bz, 0.2, 1.8, 0.2, 'prop');
    }

    /* ===== water-source plaza (kept low and open) ===== */
    waterBody(0, 7, 4.25, 4.25, 0.085, 0.14);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.95, 0.8, 12), PM.rockLight);
    pedestal.position.set(0, 0.4, 7);
    pedestal.castShadow = true; pedestal.receiveShadow = true;
    this.root.add(pedestal);
    this.solid(0, 0, 7, 1.9, 0.8, 1.9, 'prop');
    const pedestalMoss = new THREE.Mesh(mossGeo, PM.moss);
    pedestalMoss.scale.set(0.85, 0.2, 0.85);
    pedestalMoss.position.set(0, 0.83, 7);
    this.root.add(pedestalMoss);
    for (let i = 0; i < 4; i++){
      const a = i / 4 * Math.PI * 2 + Math.PI / 4;
      const jx = Math.cos(a) * 2.7, jz = 7 + Math.sin(a) * 2.7;
      this.makeWaterJet(jx, 0.22, jz, 10, 0.35);
    }
  }

  /* ================= beach trinkets ================= */
  buildBeachTrinkets(){
    const starMat = new THREE.MeshStandardMaterial({ color: 0xff9a3c, roughness: 0.75, metalness: 0 });
    const starMat2 = new THREE.MeshStandardMaterial({ color: 0xff6f8a, roughness: 0.75, metalness: 0 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xfff0d8, roughness: 0.55, metalness: 0 });
    const shellMat2 = new THREE.MeshStandardMaterial({ color: 0xffd6e0, roughness: 0.55, metalness: 0 });
    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xc9b18c, roughness: 0.95, metalness: 0 });

    const starfish = (x, z, s, mat, ry = 0) => {
      const g = new THREE.Group();
      g.position.set(x, 0.045, z);
      g.rotation.y = ry;
      for (let i = 0; i < 5; i++){
        const arm = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
        arm.scale.set(s * 0.24, s * 0.1, s * 0.52);
        const holder = new THREE.Group();
        holder.rotation.y = i * Math.PI * 2 / 5;
        holder.add(arm);
        arm.position.set(0, 0, s * 0.42);
        g.add(holder);
      }
      const core = new THREE.Mesh(new THREE.SphereGeometry(s * 0.3, 10, 8), mat);
      core.scale.y = 0.5;
      g.add(core);
      this.root.add(g);
    };
    const shell = (x, z, s, mat, ry = 0) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        mat
      );
      m.scale.y = 0.55;
      m.position.set(x, 0.02, z);
      m.rotation.y = ry;
      m.rotation.z = 0.1;
      this.root.add(m);
      for (let r = 1; r <= 2; r++){
        const rib = new THREE.Mesh(new THREE.TorusGeometry(s * (0.42 + r * 0.24), s * 0.03, 4, 12, Math.PI), mat);
        rib.rotation.x = -Math.PI / 2;
        rib.rotation.z = ry;
        rib.position.set(x, 0.03 + s * 0.03, z);
        this.root.add(rib);
      }
    };
    const pebble = (x, z, s) => {
      const m = new THREE.Mesh(this.blobGeometry(s, s * 0.55, s * 0.85, x * 3 + z), pebbleMat);
      m.position.set(x, s * 0.3, z);
      m.rotation.y = x + z;
      this.root.add(m);
    };

    starfish(5.6, 16.2, 0.5, starMat, 0.4);
    starfish(-3.4, 17.6, 0.38, starMat2, -0.7);
    starfish(11.0, 12.4, 0.32, starMat, 1.2);
    starfish(-11.4, 20.2, 0.44, starMat2, 2.1);
    starfish(2.2, 12.6, 0.28, starMat, -1.6);
    shell(4.4, 15.2, 0.22, shellMat, 0.6);
    shell(5.0, 15.3, 0.14, shellMat2, -0.3);
    shell(-2.6, 16.6, 0.19, shellMat2, 1.4);
    shell(9.4, 14.0, 0.16, shellMat, -0.9);
    pebble(10.2, 16.8, 0.3);
    pebble(10.6, 16.4, 0.2);
    pebble(-12.8, 16.0, 0.26);
    pebble(9.0, 20.6, 0.34);
    pebble(-6.2, 21.4, 0.22);
  }

  /* ================= ambient soap bubbles ================= */
  buildAmbientBubbles(){
    this.ambientBubbles = [];
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.03,
      metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [110, 380],
      envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide,
    });
    const rimMat = new THREE.MeshBasicMaterial({
      color: 0xd9f6ff, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const geo = new THREE.SphereGeometry(1, 20, 14);
    const rimGeo = new THREE.TorusGeometry(0.97, 0.035, 4, 24);
    const spots = [
      [-6.6, 4.8, 17.4, 0.52], [-4.4, 5.2, 16.2, 0.38], [-2.2, 2.6, 15.0, 0.3],
      [5.6, 4.0, 16.6, 0.5], [7.2, 5.8, 14.8, 0.66], [3.4, 6.4, 13.6, 0.34],
      [-7.4, 6.6, 12.4, 0.44], [8.6, 3.0, 11.6, 0.36], [0.8, 7.0, 10.4, 0.26],
      [-5.2, 8.4, 8.0, 0.54], [6.4, 8.8, 7.0, 0.46], [-2.4, 4.6, 4.2, 0.34],
      [4.6, 5.6, 2.4, 0.4], [-8.4, 4.2, 3.2, 0.28], [9.0, 6.6, 4.6, 0.32],
    ];
    for (let i = 0; i < spots.length; i++){
      const [x, y, z, r] = spots[i];
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const shell = new THREE.Mesh(geo, shellMat);
      shell.scale.setScalar(r);
      g.add(shell);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.scale.setScalar(r);
      rim.rotation.set(0.4, 0.6, 0.2);
      g.add(rim);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
      glint.scale.setScalar(r);
      glint.position.set(-0.42 * r, 0.42 * r, 0.5 * r);
      g.add(glint);
      this.root.add(g);
      this.ambientBubbles.push({
        g, base: y, r, phase: i * 1.7, speed: 0.24 + (i % 4) * 0.06,
        drift: 0.2 + (i % 3) * 0.12,
      });
    }
  }

  /* ================= sky ================= */
  buildSkyClouds(){
    const tex = this.assets.canvasTexture(512, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const blob = (cx, cy, rx, ry) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, ry);
        g.addColorStop(0, 'rgba(255,255,255,.98)');
        g.addColorStop(0.55, 'rgba(255,255,255,.9)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx / ry, 1);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, ry, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      };
      for (const [x, y, r] of [[170, 150, 74], [250, 128, 92], [330, 150, 78], [400, 162, 58], [220, 168, 66], [300, 172, 70]]){
        blob(x, y, r * 1.25, r);
      }
      // soft flat base
      const g = ctx.createLinearGradient(0, 150, 0, 230);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(120, 150, 320, 80);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.92, depthWrite: false, fog: false });
    const spots = [
      [-90, 52, -150, 92], [-10, 62, -175, 110], [78, 55, -155, 96],
      [150, 66, -120, 118], [-160, 64, -40, 104], [165, 60, 40, 112],
      [-70, 70, 110, 90], [90, 58, 130, 86],
    ];
    for (const [x, y, z, s] of spots){
      const sp = new THREE.Sprite(mat);
      sp.position.set(x, y, z);
      sp.scale.set(s, s * 0.55, 1);
      this.root.add(sp);
    }
  }

  /* ================= menu diorama ================= */
  buildMenuStage(){
    const mat = (c, r = 0.6, m = 0.05) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const blue = mat(0x36aef4, 0.3);
    const sky = mat(0x8fe6ff, 0.35);
    const yellow = mat(0xffd23f, 0.45);
    const pink = mat(0xff9ec2, 0.5);
    const cream = mat(0xfff2d8, 0.9);
    const white = mat(0xffffff, 0.5);
    const red = mat(0xf2545b, 0.45);

    const g = new THREE.Group();
    g.name = 'MenuStage';
    g.visible = false;
    this.root.add(g);
    this.menuStage = g;

    // ---- oval splash pool right behind the menu cats ----
    const pool = new THREE.Group();
    pool.position.set(0, 0, 11.6);
    g.add(pool);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, 0.36, 44), cream);
    rim.scale.set(7.2, 1, 2.7);
    rim.position.y = 0.18;
    rim.receiveShadow = true;
    pool.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0x2fc9f2, toneMapped: false }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(6.85, 2.4, 1);
    water.position.y = 0.37;
    pool.add(water);
    const shallow = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0x83e6ff, toneMapped: false, transparent: true, opacity: 0.6 }));
    shallow.rotation.x = -Math.PI / 2;
    shallow.scale.set(4.2, 1.35, 1);
    shallow.position.set(-1.2, 0.375, 0.1);
    pool.add(shallow);
    const lip = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), sky);
    lip.rotation.x = -Math.PI / 2;
    lip.scale.set(6.85, 2.4, 1);
    lip.position.y = 0.372;
    pool.add(lip);

    const ring = (x, z, r, c) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.34, 10, 22), c);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, 0.42, z);
      m.castShadow = true;
      g.add(m);
    };
    ring(-3.6, 11.0, 0.82, pink);
    ring(-2.0, 12.4, 0.5, yellow);
    ring(3.2, 11.8, 0.66, sky);
    ring(4.7, 10.7, 0.46, white);

    // big candy-red inflatable tube, like the reference art
    const tube = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.52, 14, 26), red);
    tube.rotation.x = Math.PI / 2;
    tube.rotation.z = 0.2;
    tube.position.set(6.1, 0.52, 7.0);
    tube.castShadow = true;
    g.add(tube);
    for (let i = 0; i < 4; i++){
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), cream);
      const a = i / 4 * Math.PI * 2 + 0.4;
      pad.position.set(6.1 + Math.cos(a) * 1.35, 1.02, 7.0 + Math.sin(a) * 1.35);
      g.add(pad);
    }

    // palms framing the board
    const p1 = this.makePalm(1.35);
    p1.position.set(-10.4, 0, 8.6);
    p1.rotation.y = 0.7;
    g.add(p1);
    const p2 = this.makePalm(1.2);
    p2.position.set(11.4, 0, 8.0);
    p2.rotation.y = 2.2;
    g.add(p2);
    const p3 = this.makePalm(0.95);
    p3.position.set(-12.6, 0, 3.6);
    p3.rotation.y = 1.3;
    g.add(p3);

    // ---- left: rock arch + waterfall ----
    const rockA = new THREE.MeshStandardMaterial({ color: 0xdcc8a2, roughness: 0.96, metalness: 0 });
    const rockB = new THREE.MeshStandardMaterial({ color: 0xc9b089, roughness: 0.96, metalness: 0 });
    const rock = (x, y, z, w, h, d, m) => {
      const r = this.box(w, h, d, m || rockA, 2.5);
      r.position.set(x, y, z);
      r.rotation.y = (Math.random() - 0.5) * 0.12;
      g.add(r);
      return r;
    };
    rock(-11.2, 3.6, 1.6, 4.0, 7.2, 3.0);
    rock(-8.6, 4.6, 1.2, 3.2, 9.2, 2.8, rockB);
    rock(-5.9, 2.4, 1.8, 2.4, 4.8, 2.4, rockB);
    rock(-7.6, 7.4, 1.4, 3.4, 2.6, 2.6, rockB);
    // mossy caps
    for (const [mx, my, mz, mr] of [[-11.2, 7.2, 1.6, 1.5], [-8.6, 9.2, 1.2, 1.3], [-5.9, 4.8, 1.8, 1.0]]){
      const moss = new THREE.Mesh(new THREE.SphereGeometry(mr, 12, 8), new THREE.MeshStandardMaterial({ color: 0x7fc86a, roughness: 0.9 }));
      moss.scale.set(1, 0.4, 1);
      moss.position.set(mx, my + 0.1, mz);
      g.add(moss);
    }
    // rounded boulder tops so the cliff never reads as a flat wall
    for (const [bx, by, bz, br, bs] of [[-11.2, 6.9, 1.6, 2.0, 1.0], [-8.6, 9.0, 1.2, 1.75, 0.95], [-5.9, 4.7, 1.8, 1.2, 0.9]]){
      const b = new THREE.Mesh(new THREE.SphereGeometry(br, 14, 10), rockA);
      b.scale.set(1, bs, 0.8);
      b.position.set(bx, by, bz);
      g.add(b);
    }
    // base boulders around the pool
    for (let i = 0; i < 6; i++){
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.55 + Math.random() * 0.55, 10, 8), i % 2 ? rockA : rockB);
      b.position.set(-13.0 + i * 1.35, 0.3, 4.0 + Math.random() * 0.9);
      b.scale.y = 0.68;
      b.rotation.y = Math.random() * Math.PI;
      g.add(b);
    }
    // waterfall sheet
    const wfTex = this.assets.canvasTexture(256, 512, (ctx, w, h) => {
      const grd = ctx.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(185,240,255,.95)');
      grd.addColorStop(0.55, 'rgba(110,215,250,.85)');
      grd.addColorStop(1, 'rgba(230,255,255,.98)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++){
        ctx.strokeStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.45})`;
        ctx.lineWidth = 2 + Math.random() * 5;
        const x = Math.random() * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 8, h * 0.33, x - 6, h * 0.66, x + 3, h);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++){
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 4, 0, Math.PI * 2); ctx.fill();
      }
    });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 7.4), new THREE.MeshBasicMaterial({ map: wfTex, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }));
    fall.position.set(-7.9, 3.7, 2.9);
    g.add(fall);
    // splash at the base
    const foam = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.75, toneMapped: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(-7.9, 0.08, 4.1);
    g.add(foam);

    // ---- right: candy slide tower ----
    const tx = 9.0, tz = 1.4;
    const UP = new THREE.Vector3(0, 1, 0);

    // chunky fiberglass columns: white shafts, blue feet and caps, candy collars
    const colShaftGeo = new THREE.CylinderGeometry(0.26, 0.33, 7.4, 12);
    const colCapGeo = new THREE.SphereGeometry(0.27, 12, 8);
    const colFootGeo = new THREE.CylinderGeometry(0.4, 0.48, 0.44, 12);
    const collarGeo = new THREE.TorusGeometry(0.3, 0.075, 6, 16);
    const colDummy = new THREE.Object3D();
    const shafts = new THREE.InstancedMesh(colShaftGeo, white, 4);
    const colCaps = new THREE.InstancedMesh(colCapGeo, blue, 4);
    const colFeet = new THREE.InstancedMesh(colFootGeo, blue, 4);
    const colBandA = new THREE.InstancedMesh(collarGeo, yellow, 4);
    const colBandB = new THREE.InstancedMesh(collarGeo, pink, 4);
    [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([sx, sz], i) => {
      const px = tx + sx, pz = tz + sz;
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(px, 3.7, pz);
      colDummy.updateMatrix(); shafts.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 7.4, pz);
      colDummy.updateMatrix(); colCaps.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 0.22, pz);
      colDummy.updateMatrix(); colFeet.setMatrixAt(i, colDummy.matrix);
      colDummy.rotation.set(Math.PI / 2, 0, 0);
      colDummy.position.set(px, 2.3, pz);
      colDummy.updateMatrix(); colBandA.setMatrixAt(i, colDummy.matrix);
      colDummy.position.set(px, 5.5, pz);
      colDummy.updateMatrix(); colBandB.setMatrixAt(i, colDummy.matrix);
    });
    for (const m of [shafts, colCaps, colFeet, colBandA, colBandB]){
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true;
      g.add(m);
    }

    // light X-bracing and tie beams between the columns
    const braceGeo = new THREE.BoxGeometry(6.9, 0.12, 0.12);
    const braces = new THREE.InstancedMesh(braceGeo, sky, 4);
    let braceIdx = 0;
    for (const sz of [-1.3, 1.3]){
      for (const s of [-1, 1]){
        colDummy.rotation.set(0, 0, s * 1.18);
        colDummy.position.set(tx, 3.9, tz + sz);
        colDummy.updateMatrix();
        braces.setMatrixAt(braceIdx++, colDummy.matrix);
      }
    }
    braces.instanceMatrix.needsUpdate = true;
    g.add(braces);
    const tieGeo = new THREE.BoxGeometry(2.72, 0.12, 0.12);
    const ties = new THREE.InstancedMesh(tieGeo, sky, 4);
    let tieIdx = 0;
    for (const s of [-1.3, 1.3]){
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(tx, 3.9, tz + s);
      colDummy.updateMatrix();
      ties.setMatrixAt(tieIdx++, colDummy.matrix);
      colDummy.rotation.set(0, Math.PI / 2, 0);
      colDummy.position.set(tx + s, 3.9, tz);
      colDummy.updateMatrix();
      ties.setMatrixAt(tieIdx++, colDummy.matrix);
    }
    ties.instanceMatrix.needsUpdate = true;
    g.add(ties);

    const deck = this.box(4.0, 0.3, 4.0, cream, 1);
    deck.position.set(tx, 7.35, tz);
    g.add(deck);
    const deckSkirt = this.box(4.16, 0.18, 4.16, blue, 1);
    deckSkirt.position.set(tx, 7.14, tz);
    g.add(deckSkirt);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.1, 1.7, 10), pink);
    roof.position.set(tx, 8.9, tz);
    roof.castShadow = true;
    g.add(roof);
    const fringe = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.14, 6, 24), yellow);
    fringe.rotation.x = Math.PI / 2;
    fringe.position.set(tx, 8.12, tz);
    g.add(fringe);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), white);
    tip.position.set(tx, 9.86, tz);
    g.add(tip);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), white);
    flagPole.position.set(tx, 10.5, tz);
    g.add(flagPole);
    const roofFlag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.46),
      new THREE.MeshStandardMaterial({ color: 0x36aef4, roughness: 0.85, side: THREE.DoubleSide }));
    roofFlag.position.set(tx + 0.42, 10.78, tz);
    g.add(roofFlag);

    // railing
    const railPostGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6);
    const railPosts = new THREE.InstancedMesh(railPostGeo, white, 7);
    let railIdx = 0;
    for (let i = 0; i < 8; i++){
      if (i === 0) continue; // gap for the stair
      const a = i / 8 * Math.PI * 2;
      colDummy.rotation.set(0, 0, 0);
      colDummy.position.set(tx + Math.cos(a) * 1.75, 7.75, tz + Math.sin(a) * 1.75);
      colDummy.updateMatrix();
      railPosts.setMatrixAt(railIdx++, colDummy.matrix);
    }
    railPosts.instanceMatrix.needsUpdate = true;
    g.add(railPosts);
    const railTop = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.055, 5, 26), blue);
    railTop.rotation.x = Math.PI / 2;
    railTop.position.set(tx, 8.2, tz);
    g.add(railTop);

    // enclosed stair down the right flank
    const stairTopX = tx + 2.0, stairBotX = tx + 6.5;
    const stairTopY = 7.2, stairBotY = 0.08;
    const stairRun = stairTopX - stairBotX, stairRise = stairTopY - stairBotY;
    const stairAngle = Math.atan2(stairRise, stairRun);
    const stairLen = Math.hypot(stairRun, stairRise);
    const stringerGeo = new THREE.BoxGeometry(stairLen + 0.2, 0.38, 0.14);
    for (const sz of [-0.62, 0.62]){
      const st = new THREE.Mesh(stringerGeo, white);
      st.position.set((stairTopX + stairBotX) / 2, (stairTopY + stairBotY) / 2 - 0.12, tz + sz);
      st.rotation.z = stairAngle;
      g.add(st);
    }
    const stairDummy = new THREE.Object3D();
    const stepCount = 14;
    const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.12, 1.3), blue, stepCount);
    for (let i = 0; i < stepCount; i++){
      const t = (i + 0.5) / stepCount;
      stairDummy.position.set(stairBotX + stairRun * t, stairBotY + stairRise * t - 0.04, tz);
      stairDummy.updateMatrix();
      steps.setMatrixAt(i, stairDummy.matrix);
    }
    steps.instanceMatrix.needsUpdate = true;
    g.add(steps);
    const handRailGeo = new THREE.BoxGeometry(stairLen + 0.2, 0.09, 0.09);
    for (const sz of [-0.62, 0.62]){
      const hr = new THREE.Mesh(handRailGeo, blue);
      hr.position.set((stairTopX + stairBotX) / 2, (stairTopY + stairBotY) / 2 + 0.78, tz + sz);
      hr.rotation.z = stairAngle;
      g.add(hr);
    }
    const balusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), white, 10);
    for (let i = 0; i < 10; i++){
      const side = i < 5 ? -0.62 : 0.62;
      const t = ((i % 5) + 0.5) / 5;
      stairDummy.position.set(stairBotX + stairRun * t, stairBotY + stairRise * t + 0.38, tz + side);
      stairDummy.updateMatrix();
      balusters.setMatrixAt(i, stairDummy.matrix);
    }
    balusters.instanceMatrix.needsUpdate = true;
    g.add(balusters);

    const troughMat = white.clone();
    troughMat.side = THREE.DoubleSide;
    const troughGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.3, 14, 1, true, -Math.PI / 2, Math.PI);
    const foamRingGeo = new THREE.TorusGeometry(0.55, 0.085, 6, 18);
    const foamMat = new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });
    const lobeGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const chute = (dx, color, ringMat) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(tx + dx, 7.2, tz + 1.4),
        new THREE.Vector3(tx + dx * 1.15, 5.8, tz + 3.6),
        new THREE.Vector3(tx + dx * 0.9 - 0.6, 3.4, tz + 6.0),
        new THREE.Vector3(tx + dx * 0.8 - 1.2, 1.5, tz + 8.6),
        new THREE.Vector3(tx + dx * 0.7 - 1.5, 0.8, tz + 10.1),
      ]);
      const tubeM = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.55, 10, false), color);
      tubeM.castShadow = true;
      g.add(tubeM);
      const ribGeo = new THREE.TorusGeometry(0.585, 0.075, 6, 14);
      for (const t of [0.34, 0.64]){
        const p = curve.getPoint(t), tan = curve.getTangent(t).normalize();
        const rib = new THREE.Mesh(ribGeo, ringMat);
        rib.position.copy(p);
        rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        g.add(rib);
      }
      // colorful play-mouth ring with clover lobes
      const mp = curve.getPoint(0.015), mt = curve.getTangent(0.015).normalize();
      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.11, 8, 20), ringMat);
      mouth.position.copy(mp);
      mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mt);
      g.add(mouth);
      const ax = new THREE.Vector3().crossVectors(mt, UP).normalize();
      const ay = new THREE.Vector3().crossVectors(mt, ax).normalize();
      const lobeCols = [pink, sky, yellow];
      for (let i = 0; i < 3; i++){
        const a = i * Math.PI * 2 / 3 + 0.5;
        const lobe = new THREE.Mesh(lobeGeo, lobeCols[i]);
        lobe.position.copy(mp).addScaledVector(ax, Math.cos(a) * 0.74).addScaledVector(ay, Math.sin(a) * 0.74);
        g.add(lobe);
      }
      const end = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.09, 6, 16), white);
      end.position.copy(curve.getPoint(1));
      end.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangent(1).normalize());
      g.add(end);
      // splash exit trough + foam ring in the pool
      const ep = curve.getPoint(0.96);
      const et = curve.getTangent(0.96).setY(0).normalize();
      const trough = new THREE.Mesh(troughGeo, troughMat);
      trough.position.set(ep.x + et.x * 0.45, 0.62, ep.z + et.z * 0.45);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, et);
      const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const DOWN = new THREE.Vector3(0, -1, 0);
      let roll = localZ.angleTo(DOWN);
      if (new THREE.Vector3().crossVectors(localZ, DOWN).dot(et) < 0) roll = -roll;
      trough.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
      g.add(trough);
      const froth = new THREE.Mesh(foamRingGeo, foamMat);
      froth.rotation.x = -Math.PI / 2;
      froth.scale.set(1.15, 0.85, 1);
      froth.position.set(ep.x + et.x * 0.95, 0.4, ep.z + et.z * 0.95);
      g.add(froth);
      const splash = new THREE.Mesh(lobeGeo, white);
      splash.position.set(ep.x - et.x * 0.3, 0.52, ep.z - et.z * 0.3);
      g.add(splash);
    };
    chute(-0.55, blue, pink);
    chute(0.75, yellow, sky);

    // lifebuoy + painted water-drop sign on the columns
    const buoy = this.makeLifebuoy(0.42);
    buoy.position.set(tx + 1.3, 4.6, tz + 1.66);
    g.add(buoy);
    if (this._dropSignTex){
      const dropSign = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.78), this._dropSignMat || new THREE.MeshStandardMaterial({ map: this._dropSignTex, roughness: 0.72 }));
      dropSign.position.set(tx - 1.3, 4.35, tz + 1.68);
      g.add(dropSign);
    }

    // pennant flags on the tower
    for (let i = 0; i < 3; i++){
      const px = tx - 1.4 + i * 1.4;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 3), [pink, sky, yellow][i]);
      flag.rotation.z = Math.PI / 2;
      flag.position.set(px, 9.95, tz);
      g.add(flag);
    }

    // beach ball + starfish accents
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), yellow);
    ball.position.set(-5.4, 0.34, 14.6);
    g.add(ball);
    const bandA = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 16), white);
    bandA.position.copy(ball.position);
    bandA.rotation.x = Math.PI / 2;
    g.add(bandA);
    const bandB = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), blue);
    bandB.position.copy(ball.position);
    bandB.rotation.y = Math.PI / 2;
    g.add(bandB);
  }

  setMenuStage(on){
    if (this.menuStage) this.menuStage.visible = !!on;
    if (this.menuHide) this.menuHide.visible = !on;
    if (this.powerLines) this.powerLines.visible = !on;
  }
  /* ================= prop factories ================= */
  // Recessed window unit: dark reveal, stone lintel + sill, wooden mullion
  // and optional shutters. Local +Z points out of the wall.
  makeWindow(w, h, opts = {}){
    const M = this.M;
    const g = new THREE.Group();
    const depth = 0.2;

    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.windowGlass);
    glass.position.z = -0.06;
    g.add(glass);

    const frame = opts.frameMat || M.sandstoneLight;
    for (const sx of [-1, 1]){
      const jamb = this.box(0.14, h + 0.3, depth, frame);
      jamb.position.set(sx * (w / 2 + 0.07), 0, depth / 2 - 0.06);
      g.add(jamb);
    }
    const lintel = this.box(w + 0.6, 0.18, depth + 0.1, frame);
    lintel.position.set(0, h / 2 + 0.16, depth / 2 - 0.02);
    g.add(lintel);
    const sill = this.box(w + 0.66, 0.14, depth + 0.26, M.sandstoneLight);
    sill.position.set(0, -h / 2 - 0.2, depth / 2 + 0.06);
    g.add(sill);

    const mv = this.box(0.06, h, 0.06, M.woodDark);
    mv.position.set(0, 0, 0.0);
    g.add(mv);
    const mh = this.box(w, 0.05, 0.06, M.woodDark);
    mh.position.set(0, h * 0.12, 0.0);
    g.add(mh);

    if (opts.shutters !== false){
      const shutMat = opts.shutterMat || M.woodPale;
      for (const sx of [-1, 1]){
        const sh = this.box(0.42, h * 0.94, 0.06, shutMat);
        sh.position.set(sx * (w / 2 + 0.42), 0, depth + 0.04);
        sh.rotation.y = sx * 0.38;
        sh.castShadow = true;
        g.add(sh);
      }
    }
    if (opts.grille){
      for (let i = 0; i < 3; i++){
        const bar = this.box(0.04, h, 0.05, M.iron);
        bar.position.set(-w * 0.3 + i * w * 0.3, 0, 0.04);
        g.add(bar);
      }
    }
    return g;
  }

  // Recessed door: plank panel, iron studs, stone jambs, lintel and threshold.
  makeDoor(w, h){
    const M = this.M;
    const g = new THREE.Group();
    const depth = 0.24;

    const panel = this.box(w, h, 0.12, M.woodDark);
    panel.position.z = 0.02;
    g.add(panel);
    for (let i = 1; i < 4; i++){
      const seam = this.box(0.035, h * 0.94, 0.02, M.iron);
      seam.position.set(-w / 2 + i * w / 4, 0, 0.09);
      g.add(seam);
    }
    for (let i = 0; i < 3; i++){
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), M.iron);
      stud.position.set(-w * 0.28 + i * w * 0.28, 0, 0.1);
      g.add(stud);
    }
    const jambMat = M.sandstoneLight;
    for (const sx of [-1, 1]){
      const jamb = this.box(0.15, h + 0.3, depth, jambMat);
      jamb.position.set(sx * (w / 2 + 0.075), 0, depth / 2 - 0.05);
      g.add(jamb);
    }
    const lintel = this.box(w + 0.6, 0.2, depth + 0.12, jambMat);
    lintel.position.set(0, h / 2 + 0.18, depth / 2 - 0.02);
    g.add(lintel);
    const threshold = this.box(w + 0.5, 0.12, depth + 0.34, M.sandstone);
    threshold.position.set(0, -h / 2 - 0.02, depth / 2 + 0.1);
    g.add(threshold);
    return g;
  }

  makeCrate(size, M){
    const g = new THREE.Group();
    const uv = worldUVBox(size, size, size, 1.2);
    const body = new THREE.Mesh(uv, M.wood);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // corner braces
    const braceMat = M.woodDark;
    const t = size * 0.09;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const post = new THREE.Mesh(new THREE.BoxGeometry(t, size + 0.02, t), braceMat);
      post.position.set(sx * (size / 2 - t / 2), 0, sz * (size / 2 - t / 2));
      post.castShadow = true;
      g.add(post);
    }
    for (const sy of [-1, 1]) for (const sz of [-1, 1]){
      const beam = new THREE.Mesh(new THREE.BoxGeometry(size + 0.02, t, t), braceMat);
      beam.position.set(0, sy * (size / 2 - t / 2), sz * (size / 2 - t / 2));
      g.add(beam);
    }
    // metal corner caps
    for (const sx of [-1, 1]) for (const sy of [-1, 1]){
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, size + 0.04), M.iron);
      cap.position.set(sx * (size / 2), sy * (size / 2), 0);
      g.add(cap);
    }
    // stencil
    const stencil = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.45, size * 0.3), decalTextureMaterial(this.assets.decals.hazard, 0.4));
    stencil.position.set(0, 0, size / 2 + 0.012);
    g.add(stencil);
    return g;
  }

  makeBarrel(mat, M){
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.25, 20), mat);
    body.position.y = 0.625; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    for (const y of [0.18, 0.62, 1.06]){
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.565, 0.035, 5, 24), M.iron);
      band.rotation.x = Math.PI / 2; band.position.y = y;
      g.add(band);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 20), M.iron);
    top.position.y = 1.26; g.add(top);
    return g;
  }

  makeTable(w, d){
    const g = new THREE.Group();
    const top = new THREE.Mesh(new RoundedBoxGeometry(w, 0.12, d, 2, 0.03), this.M.wood);
    top.position.y = 0.82; top.castShadow = true; top.receiveShadow = true;
    g.add(top);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), this.M.woodDark);
      leg.position.set(sx * (w / 2 - 0.15), 0.4, sz * (d / 2 - 0.12));
      g.add(leg);
    }
    return g;
  }

  makeAwning(w, d, mat, sag = 0.3){
    const geo = new THREE.PlaneGeometry(w, d, 10, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++){
      const x = p.getX(i), y = p.getY(i);
      const u = x / w, v = y / d;
      p.setZ(i, -Math.abs(Math.sin(u * Math.PI)) * sag - Math.abs(Math.sin(v * Math.PI)) * sag * 0.35);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2 + 0.18;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  makePot(r, M){
    const pts = [];
    const h = r * 2.0;
    for (let i = 0; i <= 10; i++){
      const t = i / 10;
      const rr = r * (0.55 + Math.sin(t * Math.PI * 0.9) * 0.55) * (1 - t * 0.12);
      pts.push(new THREE.Vector2(rr, t * h));
    }
    const geo = new THREE.LatheGeometry(pts, 16);
    const m = new THREE.Mesh(geo, Math.random() > .5 ? M.terracotta : M.terracottaLight);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  makePalm(scale = 1){
    const g = new THREE.Group();
    const segs = 9;
    let px = 0, pz = 0;
    const leanX = (Math.random() - 0.5) * 0.5, leanZ = (Math.random() - 0.5) * 0.5;
    for (let i = 0; i < segs; i++){
      const h = 0.95 * scale;
      const r0 = (0.30 - i * 0.018) * scale, r1 = (0.28 - i * 0.018) * scale;
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 8), this.M.trunk);
      seg.position.set(px, i * h + h / 2, pz);
      seg.rotation.z = leanX * 0.06 * i;
      seg.rotation.x = leanZ * 0.06 * i;
      seg.castShadow = true; seg.receiveShadow = true;
      g.add(seg);
      px += leanX * 0.08 * i * scale * 0.1;
      pz += leanZ * 0.08 * i * scale * 0.1;
      // trunk rings
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r0 + 0.01, 0.02, 4, 10), this.M.woodDark);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, i * h + 0.05, pz);
      g.add(ring);
    }
    const crownY = segs * 0.95 * scale;
    // fronds
    for (let i = 0; i < 18; i++){
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.28;
      const len = (3.4 + Math.random() * 1.5) * scale * (i % 3 === 0 ? 0.74 : 1);
      const droop = 1.2 + Math.random() * 1.2;
      const geo = new THREE.BufferGeometry();
      const verts = [];
      const uvs = [];
      const idx = [];
      const steps = 9;
      for (let s = 0; s <= steps; s++){
        const t = s / steps;
        const x = t * len;
        const y = Math.sin(t * Math.PI * 0.55) * 1.15 * scale - droop * t * t * scale;
        const wdt = Math.sin(t * Math.PI) * 0.55 * scale + 0.04;
        verts.push(x, y, -wdt, x, y, wdt);
        uvs.push(t, 0, t, 1);
        if (s < steps){
          const b = s * 2;
          idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        }
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const frond = new THREE.Mesh(geo, i % 2 ? this.M.frond : this.M.frondLight);
      frond.position.set(px, crownY, pz);
      frond.rotation.y = a;
      frond.rotation.z = -0.1 + Math.random() * 0.12;
      frond.castShadow = true;
      g.add(frond);
    }
    // coconuts
    for (let i = 0; i < 3; i++){
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 6), this.M.trunk);
      c.position.set(px + Math.cos(i * 2.1) * 0.4, crownY - 0.25, pz + Math.sin(i * 2.1) * 0.4);
      g.add(c);
    }
    return g;
  }

  makeCart(){
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.5, 1.5, 2, 0.05), this.M.wood);
    bed.position.y = 0.7; bed.castShadow = true; g.add(bed);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]){
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 16), this.M.woodDark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 1.0, 0.52, sz * 0.78);
      wheel.castShadow = true;
      g.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 8), this.M.iron);
      hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); g.add(hub);
      for (let i = 0; i < 6; i++){
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.82, 0.05), this.M.woodDark);
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.x = i / 6 * Math.PI;
        spoke.position.copy(wheel.position);
        g.add(spoke);
      }
    }
    for (const sx of [-1, 1]){
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), this.M.woodDark);
      shaft.rotation.z = Math.PI / 2;
      shaft.position.set(sx * 1.8, 0.65, 0);
      g.add(shaft);
    }
    // hay in cart
    const hay = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), this.M.hay);
    hay.scale.set(1.2, 0.45, 0.8); hay.position.y = 1.15; g.add(hay);
    return g;
  }

  makeLantern(){
    const g = new THREE.Group();
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4), this.M.iron);
    chain.position.y = 0.35; g.add(chain);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 8), this.M.brass);
    body.position.y = -0.1; g.add(body);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.95 }));
    glow.position.y = -0.12; g.add(glow);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.18, 8), this.M.brass);
    cap.position.y = 0.14; g.add(cap);
    return g;
  }

  /* ================= DUST II STYLE A-SITE LAYOUT ================= */
  buildDustLayout(){
    const M = this.M;
    const site = { x: 0, z: -12 };

    const wallRun = (x, z, w, h, d) => {
      const g = new THREE.Group();
      const body = this.box(w, h, d, M.plasterOchre, 2);
      body.position.y = h / 2;
      g.add(body);
      const cap = this.box(w + 0.16, 0.16, d + 0.16, M.sandstoneLight);
      cap.position.y = h + 0.08;
      g.add(cap);
      // chipped base course
      const base = this.box(w + 0.2, 0.35, d + 0.2, M.sandstone, 2);
      base.position.y = 0.175;
      g.add(base);
      g.position.set(x, 0, z);
      this.root.add(g);
      this.solid(x, 0, z, w, h, d, 'dustwall');
      return g;
    };

    // ---------- A site plateau + painted marker ----------
    const PLAT_H = 1.2;
    const plat = this.box(15, PLAT_H, 9, M.sandstoneLight, 2.2);
    plat.position.set(site.x, PLAT_H / 2, site.z);
    plat.receiveShadow = true;
    this.root.add(plat);
    this.solid(site.x, 0, site.z, 15, PLAT_H, 9, 'site');
    // top edge trim
    const platTrim = this.box(15.34, 0.12, 9.34, M.sandstone, 2);
    platTrim.position.set(site.x, PLAT_H + 0.05, site.z);
    platTrim.receiveShadow = true;
    this.root.add(platTrim);
    // south staircase: four 0.3 m steps up to the plateau
    for (let i = 0; i < 4; i++){
      const h = 0.3 * (i + 1);
      const sz = -5.75 - i * 0.5;
      const step = this.box(7, h, 0.5, M.sandstoneLight, 2);
      step.position.set(site.x, h / 2, sz);
      step.receiveShadow = true;
      step.castShadow = true;
      this.root.add(step);
      const nose = this.box(7.1, 0.08, 0.56, M.sandstone, 2);
      nose.position.set(site.x, h + 0.02, sz);
      this.root.add(nose);
      this.solid(site.x, 0, sz, 7, h, 0.5, 'sitestep');
    }
    // north/CT ramp: four steps down from the plateau toward CT spawn
    for (let i = 0; i < 4; i++){
      const h = 1.2 - i * 0.3;
      const sz = -16.9 - i * 0.5;
      const step = this.box(3.6, h, 0.5, M.sandstoneLight, 2);
      step.position.set(site.x, h / 2, sz);
      step.receiveShadow = true;
      step.castShadow = true;
      this.root.add(step);
      const nose = this.box(3.68, 0.08, 0.56, M.sandstone, 2);
      nose.position.set(site.x, h + 0.02, sz);
      this.root.add(nose);
      this.solid(site.x, 0, sz, 3.6, h, 0.5, 'sitestep');
    }

    // east/long-A ramp up to the site
    for (let i = 0; i < 4; i++){
      const h = 0.3 * (i + 1);
      const sx = 9.25 - i * 0.5;
      const step = this.box(0.5, h, 4.2, M.sandstoneLight, 2);
      step.position.set(sx, h / 2, -12);
      step.receiveShadow = true;
      step.castShadow = true;
      this.root.add(step);
      const nose = this.box(0.56, 0.08, 4.28, M.sandstone, 2);
      nose.position.set(sx, h + 0.02, -12);
      this.root.add(nose);
      this.solid(sx, 0, -12, 0.5, h, 4.2, 'sitestep');
    }

    const aTex = this.assets.canvasTexture(512, 512, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(206,188,148,.6)';
      ctx.lineWidth = 12;
      ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.fillStyle = 'rgba(210,192,150,.66)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 300px Rajdhani, sans-serif';
      ctx.fillText('A', w / 2, h / 2 - 20);
      ctx.font = '600 36px Chakra Petch, monospace';
      ctx.fillText('BOMB SITE A', w / 2, h - 70);
    });
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), decalTextureMaterial(aTex, 0.9));
    marker.rotation.x = -Math.PI / 2;
    marker.rotation.z = Math.PI;
    marker.position.set(site.x, PLAT_H + 0.12, site.z + 1.4);
    this.root.add(marker);

    // ---------- mid doors ----------
    wallRun(-6.6, 8, 5.2, 3.4, 0.9);
    wallRun(6.6, 8, 5.2, 3.4, 0.9);
    const lintel = this.box(9.4, 0.55, 1.1, M.woodDark, 2);
    lintel.position.set(0, 3.5, 8);
    lintel.castShadow = true;
    this.root.add(lintel);
    for (const x of [-2.6, 2.6]){
      const post = this.box(0.32, 3.4, 0.9, M.sandstoneLight, 2);
      post.position.set(x, 1.7, 8);
      this.root.add(post);
      this.solid(x, 0, 8, 0.32, 3.4, 0.9, 'doorpost');
    }

    // ---------- long A: west wall with long doors + A exit ----------
    wallRun(25.5, 16.75, 0.9, 3.6, 14.5);   // z 9.5 .. 24
    wallRun(25.5, -1.5, 0.9, 3.6, 16.0);    // z -9.5 .. 6.5 (opening at z -17..-9.5 into A)
    wallRun(34.2, 22, 0.8, 3.6, 4.0);       // closes the south-east gap
    wallRun(34.2, -12.5, 0.8, 3.6, 9.0);    // closes the north-east gap

    // long doors frame + two swung wooden leaves
    const ld = this.box(0.9, 3.6, 3.4, M.woodDark, 2);
    ld.position.set(25.5, 1.8, 8);
    this.root.add(ld);
    for (const [dz, swing] of [[9.2, 1], [6.8, -1]]){
      const leaf = new THREE.Group();
      const panel = this.box(0.08, 2.45, 1.3, M.wood, 1.4);
      panel.position.set(0, 1.22, swing * 0.7);
      leaf.add(panel);
      for (const sy of [0.6, 1.75]){
        const brace = this.box(0.1, 0.09, 1.15, M.woodDark, 1);
        brace.position.set(0, sy, swing * 0.7);
        leaf.add(brace);
      }
      leaf.position.set(25.05, 0, dz);
      leaf.rotation.y = swing * 0.58;
      this.root.add(leaf);
    }

    // ---------- catwalk (west lane to A) ----------
    const walk = this.box(5.2, 0.34, 12.5, M.sandstoneLight, 2);
    walk.position.set(-11, 0.17, -2.2);
    walk.receiveShadow = true;
    this.root.add(walk);
    this.solid(-11, 0, -2.2, 5.2, 0.34, 12.5, 'catwalk');
    for (const [rx, rz, rl] of [[-13.55, -2.2, 12.5], [-8.45, -1.2, 10.5]]){
      const rail = this.box(0.22, 0.9, rl, M.woodDark, 1.4);
      rail.position.set(rx, 0.79, rz);
      this.root.add(rail);
      this.solid(rx, 0.34, rz, 0.22, 0.9, rl, 'rail');
    }
    for (const z of [-8.2, -2.2, 3.8]){
      const lampPost = this.box(0.2, 1.25, 0.2, M.iron);
      lampPost.position.set(-13.55, 1.34, z);
      this.root.add(lampPost);
    }

    // short-A: two steps from the catwalk up onto the site plateau
    for (const [sz, sh, sd] of [[-9.0, 0.6, 2.0], [-10.4, 0.9, 1.0]]){
      const step = this.box(1.7, sh, sd, M.sandstoneLight, 2);
      step.position.set(-7.65, sh / 2, sz);
      step.receiveShadow = true;
      step.castShadow = true;
      this.root.add(step);
      const nose = this.box(1.78, 0.08, sd + 0.06, M.sandstone, 2);
      nose.position.set(-7.65, sh + 0.02, sz);
      this.root.add(nose);
      this.solid(-7.65, 0, sz, 1.7, sh, sd, 'sitestep');
    }

    // ---------- A-site "goose" cover (north edge, central gap) ----------
    for (const [gx, gw] of [[-5.0, 4.6], [5.0, 4.6]]){
      const g = this.box(gw, 1.15, 0.65, M.sandstone, 1.6);
      g.position.set(gx, PLAT_H + 0.575, -16.0);
      g.castShadow = g.receiveShadow = true;
      this.root.add(g);
      const cap = this.box(gw + 0.12, 0.12, 0.77, M.sandstoneLight, 1.6);
      cap.position.set(gx, PLAT_H + 1.2, -16.0);
      this.root.add(cap);
      this.solid(gx, PLAT_H, -16.0, gw, 1.15, 0.65, 'goose');
    }
    // big "A" stencils on the goose wall, facing the bombsite
    const aStencilTex = this.assets.canvasTexture(256, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(30,24,16,.72)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 210px Rajdhani, sans-serif';
      ctx.fillText('A', w / 2, h / 2 + 8);
    });
    const aStencilMat = decalTextureMaterial(aStencilTex, 0.9);
    for (const gx of [-5.0, 5.0]){
      const st = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.0), aStencilMat);
      st.position.set(gx, PLAT_H + 0.58, -15.66);
      this.root.add(st);
    }

    // ---------- long A: blue shipping container at the A exit ----------
    const contMat = new THREE.MeshStandardMaterial({ color: 0x2d4a5c, roughness: 0.82, metalness: 0.35 });
    const cont = this.box(2.4, 2.6, 6.0, contMat, 3);
    cont.position.set(32.0, 1.3, -12.5);
    cont.castShadow = cont.receiveShadow = true;
    this.root.add(cont);
    for (let i = 0; i < 7; i++){
      const rib = this.box(2.46, 2.58, 0.06, M.metal);
      rib.position.set(32.0, 1.3, -15.4 + i * 0.96);
      this.root.add(rib);
    }
    const contTop = this.box(2.5, 0.08, 6.12, M.metal);
    contTop.position.set(32.0, 2.64, -12.5);
    this.root.add(contTop);
    this.solid(32.0, 0, -12.5, 2.4, 2.6, 6.0, 'container');

    // ---------- bombsite cover ----------
    const crateAt = (x, z, size, ry = 0, baseY = 0) => {
      const c = this.makeCrate(size, M);
      c.position.set(x, baseY + size / 2 + 0.02, z);
      c.rotation.y = ry;
      this.root.add(c);
      this.solid(x, baseY, z, size, size, size, 'crate');
    };
    const crateStack = (x, z, size, ry = 0, baseY = 0) => {
      crateAt(x, z, size, ry, baseY);
      const top = this.makeCrate(size * 0.72, M);
      top.position.set(x + 0.05, baseY + size + size * 0.36 + 0.02, z - 0.05);
      top.rotation.y = 0.42;
      this.root.add(top);
    };
    crateAt(-5.9, -8.4, 1.5, 0.25, PLAT_H);
    crateAt(-6.4, -10.0, 1.25, -0.4, PLAT_H);
    crateStack(6.1, -8.6, 1.5, -0.2, PLAT_H);
    crateAt(5.6, -15.4, 1.35, 0.5, PLAT_H);
    crateAt(-5.7, -15.2, 1.2, -0.15, PLAT_H);
    // iconic mid "xbox" and a long-A crate stack
    crateStack(3.2, 5.6, 1.35, 0.2);
    crateStack(31.4, 8.4, 1.5, -0.35);

    const barrelAt = (x, z) => {
      const b = this.makeBarrel(M.metal, M);
      b.position.set(x, 0, z);
      this.root.add(b);
      this.solid(x, 0, z, 1.2, 1.25, 1.2, 'barrel');
    };
    barrelAt(9.6, -6.0);
    barrelAt(-8.0, -5.6);

    // sandbag firing line facing the north approach
    const bags = (x, z, w, d, ry) => {
      const g = new THREE.Group();
      const mat = M.sack;
      const n = Math.max(2, Math.round(w / 0.68));
      for (let r = 0; r < 2; r++){
        for (let i = 0; i < n - r; i++){
          const bag = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.26, 0.36), mat);
          bag.position.set(-((n - r - 1) / 2) * 0.68 + i * 0.68, 0.14 + r * 0.26, 0);
          bag.castShadow = true;
          g.add(bag);
        }
      }
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.root.add(g);
      this.solid(x, 0, z, w, 0.55, d, 'sandbags');
    };
    bags(4.2, -19.4, 3.4, 0.9, 0);
    bags(-11.2, -14.0, 3.6, 0.9, Math.PI / 2);

    // ---------- signage ----------
    const sign = (title, sub, x, z, ry = 0, w = 3.4) => {
      const tex = this.assets.canvasTexture(512, 256, (ctx, W, H) => {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(22,19,14,.88)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(216,178,90,.55)';
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, W - 20, H - 20);
        ctx.fillStyle = 'rgba(236,224,196,.95)';
        ctx.textAlign = 'center';
        ctx.font = '700 96px Rajdhani, sans-serif';
        ctx.fillText(title, W / 2, H / 2 - 6);
        ctx.fillStyle = 'rgba(216,178,90,.9)';
        ctx.font = '600 34px Chakra Petch, monospace';
        ctx.fillText(sub, W / 2, H / 2 + 62);
      });
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide });
      const geo = new THREE.PlaneGeometry(w, w * 0.5);
      const nx = Math.sin(ry), nz = Math.cos(ry);
      const front = new THREE.Mesh(geo, mat);
      front.position.set(x + nx * 0.02, 2.6, z + nz * 0.02);
      front.rotation.y = ry;
      this.root.add(front);
      const back = new THREE.Mesh(geo, mat);
      back.position.set(x - nx * 0.02, 2.6, z - nz * 0.02);
      back.rotation.y = ry + Math.PI;
      this.root.add(back);
      for (const sx of [-w * 0.36, w * 0.36]){
        const px = x + Math.cos(ry) * sx;
        const pz = z - Math.sin(ry) * sx;
        const post = this.box(0.1, 2.4, 0.1, M.woodDark);
        post.position.set(px, 1.2, pz);
        this.root.add(post);
        this.solid(px, 0, pz, 0.12, 2.4, 0.12, 'signpost');
      }
    };
    sign('A SITE', 'BOMB SITE A', 0, -19.2, 0, 3.6);
    sign('LONG A', 'T → A', 29.6, 20.0, 0, 3.2);
    sign('LONG DOORS', 'A SHORT', 24.9, 11.4, Math.PI / 2, 2.4);
    sign('MID', 'DOUBLE DOORS', 0, 11.6, 0, 2.8);
    sign('CATWALK', 'SHORT A', -11, 9.0, 0, 3.0);
    sign('CT SPAWN', 'HOLD SITE A', 8.5, -24.6, 0, 3.0);
    sign('T SPAWN', 'PUSH LONG / MID', -11.5, 24.2, Math.PI, 3.2);

    // ---------- hazard paint around the site ----------
    const hazardMat = decalTextureMaterial(this.assets.decals.hazard, 0.42);
    for (const [hx, hz, hw, hd] of [[0, -17.6, 15, 0.7], [0, -3.8, 15, 0.7]]){
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(hw, hd), hazardMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(hx, 0.03, hz);
      this.root.add(strip);
    }
  }

  /* ================= runtime ================= */
  update(dt, time, playerPos){
    this.time = time;
    // cloth wave
    for (const c of this.clothMeshes){
      const attr = c.mesh.geometry.attributes.position;
      const base = c.base;
      for (let i = 0; i < attr.count; i++){
        const bx = base[i * 3], by = base[i * 3 + 1];
        const z = Math.sin(time * c.speed * 2.2 + bx * 1.4 + by * 0.6) * c.amp
                + Math.sin(time * c.speed * 3.7 + by * 2.0) * c.amp * 0.4;
        attr.setZ(i, z);
      }
      attr.needsUpdate = true;
    }
    // water normals
    const [w1, w2] = this.M.waterNormals;
    w1.offset.set(time * 0.012, time * 0.008);
    w2.offset.set(-time * 0.009, time * 0.015);
    // spout arc opacity pulse
    if (this.spoutArc) this.spoutArc.material.opacity = 0.45 + Math.sin(time * 8) * 0.08;
    // balloons bob gently
    if (this.balloons){
      for (const b of this.balloons){
        b.mesh.position.y = b.base + Math.sin(time * 1.3 + b.phase) * 0.07;
        b.mesh.position.x = b.sway + Math.sin(time * 0.9 + b.phase) * 0.05;
        b.mesh.rotation.z = Math.sin(time * 1.1 + b.phase) * 0.06;
      }
    }
    // shoreline ripples expand outward and fade
    if (this.ripples){
      for (const r of this.ripples){
        const p = (time * 0.32 + r.phase) % 1;
        const s = 0.7 + p * 1.9;
        r.m.scale.set(s, s, 1);
        r.m.material.opacity = 0.3 * (1 - p);
      }
    }
    // waterfall spray breathes at the base
    if (this.fallMist){
      for (const m of this.fallMist){
        const t = time * 0.55 + m.phase;
        m.sp.position.y = m.baseY + Math.sin(t) * 0.32;
        const s = m.baseS * (1 + Math.sin(t * 1.4) * 0.08);
        m.sp.scale.set(s, s * 0.68, 1);
        m.sp.material.opacity = 0.1 + (Math.sin(t * 1.7) + 1) * 0.05;
      }
    }
    // ambient soap bubbles drift and shimmer
    if (this.ambientBubbles){
      for (const b of this.ambientBubbles){
        const t = time * b.speed + b.phase;
        b.g.position.y = b.base + Math.sin(t) * 0.55;
        b.g.position.x += Math.sin(t * 0.7) * b.drift * dt;
        b.g.position.z += Math.cos(t * 0.55) * b.drift * dt * 0.6;
        b.g.rotation.y += dt * 0.18;
        const s = 1 + Math.sin(t * 1.9) * 0.035;
        b.g.scale.setScalar(s);
      }
    }
    // rubber duck bobs in the fountain
    if (this.duck){
      this.duck.position.y = 1.62 + Math.sin(time * 1.7) * 0.05;
      this.duck.rotation.z = Math.sin(time * 1.2) * 0.06;
    }
    // waterfall streaks scroll downwards
    for (const m of this.waterfallMats){
      if (m.map) m.map.offset.y = (time * 0.55) % 1;
    }
    // pool water slowly drifts so the caustics breathe
    if (this._waterTex){
      this._waterTex.offset.x = (time * 0.012) % 1;
      this._waterTex.offset.y = (time * 0.019) % 1;
    }
    // pool toys bob on the lagoon
    for (const f of this.parkFloaters){
      f.mesh.position.y = f.base + Math.sin(time * 1.6 + f.phase) * 0.03;
      f.mesh.rotation.z = Math.sin(time * 1.1 + f.phase) * 0.05;
    }
    // water jets
    for (const jet of this.waterJets){
      const p = jet.pts.geometry.attributes.position;
      for (let i = 0; i < jet.data.length; i++){
        const d = jet.data[i];
        d.life += dt * 1.6;
        if (d.life > 1) d.life = 0;
        const t = d.life;
        p.setXYZ(i,
          jet.origin.x + d.ox + Math.sin(t * 6 + i) * 0.06,
          jet.origin.y + t * 1.1 - t * t * 0.6,
          jet.origin.z + d.oz + Math.cos(t * 5 + i) * 0.06);
      }
      p.needsUpdate = true;
    }
  }

  /* ================= collision queries ================= */
  getSupportHeight(x, z, feetY, radius = 0.35, maxStep = 0.45){
    let h = 0;
    for (const c of this.colliders){
      const b = c.box;
      if (x < b.min.x - radius * 0.4 || x > b.max.x + radius * 0.4) continue;
      if (z < b.min.z - radius * 0.4 || z > b.max.z + radius * 0.4) continue;
      if (b.max.y <= feetY + maxStep + 0.001 && b.max.y > h) h = b.max.y;
    }
    return h;
  }

  resolveCircle(pos, radius, feetY, height){
    let stepped = 0;
    const headY = feetY + height;
    for (let pass = 0; pass < 2; pass++){
      for (const c of this.colliders){
        const b = c.box;
        if (feetY >= b.max.y - 0.06) continue;
        if (headY <= b.min.y + 0.02) continue;
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        const stepUp = b.max.y - feetY;
        if (stepUp > 0 && stepUp <= 0.36){
          // Keep the tallest climbable step found in this pass. Taking only the
          // first one made stacked stair treads (and the plateau edge right
          // behind them) shove the actor back down.
          if (b.max.y > stepped) stepped = b.max.y;
          continue;
        }
        const d = Math.sqrt(d2) || 0.0001;
        if (d2 < 0.000001){
          // center inside box — push out along nearest face
          const left = Math.abs(pos.x - b.min.x), right = Math.abs(b.max.x - pos.x);
          const front = Math.abs(pos.z - b.min.z), back = Math.abs(b.max.z - pos.z);
          const m = Math.min(left, right, front, back);
          if (m === left) pos.x = b.min.x - radius;
          else if (m === right) pos.x = b.max.x + radius;
          else if (m === front) pos.z = b.min.z - radius;
          else pos.z = b.max.z + radius;
        } else {
          const push = (radius - d);
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        }
      }
    }
    return stepped;
  }

  raycastObstacles(origin, dir, maxDist = 100, step = 0.35){
    // ray-march AABB slabs (fast enough at map scale)
    let best = maxDist;
    for (const c of this.colliders){
      const t = rayBox(origin, dir, c.box);
      if (t !== null && t >= 0 && t < best) best = t;
    }
    return best;
  }

  rayHit(origin, dir, maxDist = 200){
    let best = null;
    for (const c of this.colliders){
      const hit = rayBoxHit(origin, dir, c.box);
      if (hit && hit.t >= 0 && hit.t < maxDist && (!best || hit.t < best.t)){
        best = hit;
      }
    }
    if (best){
      best.point = origin.clone().addScaledVector(dir, best.t);
    }
    return best;
  }

  hasLineOfSight(a, b){
    const dir = b.clone().sub(a);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    const yA = a.y, yB = b.y;
    const d = this.raycastObstacles(new THREE.Vector3(a.x, yA, a.z), new THREE.Vector3(dir.x, 0, dir.z), dist);
    if (d < dist - 0.2) return false;
    return true;
  }
}

function rayBox(origin, dir, box){
  let tmin = 0, tmax = Infinity;
  for (const axis of ['x', 'y', 'z']){
    const o = origin[axis], d = dir[axis];
    const mn = box.min[axis], mx = box.max[axis];
    if (Math.abs(d) < 1e-8){
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

function rayBoxHit(origin, dir, box){
  let tmin = 0, tmax = Infinity;
  let axis = null, sign = 1;
  for (const a of ['x', 'y', 'z']){
    const o = origin[a], d = dir[a];
    const mn = box.min[a], mx = box.max[a];
    if (Math.abs(d) < 1e-8){
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      let s = -1;
      if (t1 > t2){ const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
      if (t1 > tmin){ tmin = t1; axis = a; sign = s; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  const normal = new THREE.Vector3();
  if (axis) normal[axis] = sign;
  else normal.set(0, 1, 0);
  return { t: tmin, normal };
}
