import * as THREE from 'three';

/* ============================================================
   World materials + geometry helpers
   ============================================================ */

// Builds UVs so tiling is consistent in world units on a box (per-face, axis aligned).
export function worldUVBox(w, h, d, scale = 1){
  const geo = new THREE.BoxGeometry(w, h, d);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx > ny && nx > nz){ u = z; v = y; }
    else if (nz > ny && nz > nx){ u = x; v = y; }
    else { u = x; v = z; }
    uv.setXY(i, u / scale + 0.5, v / scale + 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

export function noiseNormalTexture(size = 256, strength = 2.2){
  const height = new Float32Array(size * size);
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // value noise octaves
  const grid = 32;
  const g = new Float32Array(grid * grid);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  const sample = (x, y) => {
    const gx = (x / size * grid), gy = (y / size * grid);
    const x0 = Math.floor(gx) % grid, y0 = Math.floor(gy) % grid;
    const x1 = (x0 + 1) % grid, y1 = (y0 + 1) % grid;
    const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[y0 * grid + x0], b = g[y0 * grid + x1], c = g[y1 * grid + x0], d = g[y1 * grid + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      height[y * size + x] = sample(x, y) * 0.6 + sample(x * 3.7, y * 3.7) * 0.3 + sample(x * 9.1, y * 9.1) * 0.1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const idx = (y * size + x) * 4;
      img.data[idx] = (( -dx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function waterNormalTexture(size = 256){
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const h = (x, y) => {
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    return Math.sin(u * 3 + Math.sin(v * 2) * 1.2) * 0.5
         + Math.sin(v * 4 + Math.cos(u * 3) * 1.6) * 0.3
         + Math.sin((u + v) * 7) * 0.12
         + Math.sin(u * 11 - v * 9) * 0.08;
  };
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const idx = (y * size + x) * 4;
      img.data[idx] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[idx + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[idx + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function makeGrimeTexture(size = 512){
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, size, size);
  let seed = 19;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // broad damp patches
  for (let i = 0; i < 80; i++){
    const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(96,84,70,${0.10 + rnd() * 0.16})`);
    g.addColorStop(0.6, `rgba(120,106,90,${0.05 + rnd() * 0.08})`);
    g.addColorStop(1, 'rgba(140,124,104,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // rain streaks running down the plaster
  for (let i = 0; i < 46; i++){
    const x = rnd() * size, w = 1 + rnd() * 5, y0 = rnd() * size * 0.5, len = 40 + rnd() * 190;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    g.addColorStop(0, 'rgba(88,76,62,0)');
    g.addColorStop(0.25, `rgba(88,76,62,${0.10 + rnd() * 0.16})`);
    g.addColorStop(1, 'rgba(88,76,62,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y0, w, len);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function applyFacadeGrime(mat, grime, strength = 1.0){
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: grime };
    shader.uniforms.uGrimeAmt = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uGrime;\nuniform float uGrimeAmt;')
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec2 guv = vec2((vWPos.x + vWPos.z) * 0.052, vWPos.y * 0.10 + vWPos.x * 0.012);
        float gr = texture2D(uGrime, guv).r;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.52 + gr * 0.58), 0.5 * uGrimeAmt);
        diffuseColor.rgb *= mix(0.58, 1.0, smoothstep(0.0, 2.1, vWPos.y));
      `);
  };
  mat.customProgramCacheKey = () => 'facade-grime-' + strength;
  mat.needsUpdate = true;
  return mat;
}

export function createMaterials(assets){
  const M = {};

  // ---------- sand ground (macro variation injected) ----------
  const sand = assets.makePBR('sand', { repeat: [64, 64], color: 0xfff0d2, normalScale: 1.4, roughnessScale: 1.0 });
  const macroCanvas = document.createElement('canvas');
  macroCanvas.width = macroCanvas.height = 256;
  const mctx = macroCanvas.getContext('2d');
  mctx.fillStyle = '#c9b184'; mctx.fillRect(0, 0, 256, 256);
  let ms = 7;
  const mr = () => { ms = (ms * 16807) % 2147483647; return ms / 2147483647; };
  for (let i = 0; i < 70; i++){
    const x = mr() * 256, y = mr() * 256, r = 18 + mr() * 90;
    const g = mctx.createRadialGradient(x, y, 0, x, y, r);
    const c = mr() > .5 ? '200,176,134' : '228,208,170';
    g.addColorStop(0, `rgba(${c},${.16 + mr() * .16})`);
    g.addColorStop(1, `rgba(${c},0)`);
    mctx.fillStyle = g; mctx.beginPath(); mctx.arc(x, y, r, 0, Math.PI * 2); mctx.fill();
  }
  const macro = new THREE.CanvasTexture(macroCanvas);
  macro.wrapS = macro.wrapT = THREE.RepeatWrapping;
  macro.colorSpace = THREE.SRGBColorSpace;
  sand.onBeforeCompile = (shader) => {
    shader.uniforms.uMacro = { value: macro };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSandW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMacro;\nvarying vec3 vSandW;')
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        vec3 macroCol = texture2D(uMacro, vMapUv * 0.055).rgb;
        diffuseColor.rgb *= mix(vec3(1.0), macroCol * 1.62, 0.11);
        // world-space high-frequency grain keeps the ground crisp under the camera
        float sandG1 = texture2D(uMacro, vSandW.xz * 1.9).r;
        float sandG2 = texture2D(uMacro, vSandW.xz * 6.1).g;
        float sandGrain = sandG1 * 0.6 + sandG2 * 0.4;
        diffuseColor.rgb *= 0.95 + sandGrain * 0.12;
      `)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.9 + sandGrain * 0.22), 0.4, 1.0);
      `);
  };
  M.sand = sand;

  // ---------- plasters ----------
  const plasterTex = assets.makePBR('plaster', { repeat: [1, 1], normalScale: 0.9 });
  const tint = (mat, color, rough) => { mat.color.set(color); mat.roughness = rough; return mat; };
  M.plasterCream = tint(plasterTex.clone(), 0xf2d9ae, 0.92);
  M.plasterTan   = tint(plasterTex.clone(), 0xd9b07c, 0.95);
  M.plasterOchre = tint(plasterTex.clone(), 0xc9905c, 0.94);
  M.plasterWhite = tint(plasterTex.clone(), 0xe8ddc2, 0.9);
  const grime = makeGrimeTexture(512);
  for (const m of [M.plasterCream, M.plasterTan, M.plasterOchre, M.plasterWhite]){
    m.map = plasterTex.map.clone(); m.normalMap = plasterTex.normalMap.clone();
    m.roughnessMap = plasterTex.roughnessMap.clone(); m.aoMap = m.roughnessMap;
    m.metalnessMap = m.roughnessMap;
    for (const t of [m.map, m.normalMap, m.roughnessMap]){
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; t.anisotropy = plasterTex.map.anisotropy;
    }
    m.normalScale = new THREE.Vector2(1.25, 1.25);
    m.roughness = 0.95;
    applyFacadeGrime(m, grime, 1.0);
    m.needsUpdate = true;
  }

  // ---------- sandstone ----------
  M.sandstone = assets.makePBR('sandstone', { repeat: [1, 1], normalScale: 1.0 });
  M.sandstoneLight = M.sandstone.clone();
  M.sandstoneLight.color.set(0xf0d9b2);
  M.sandstoneLight.normalMap = M.sandstone.normalMap.clone();
  M.sandstoneLight.roughnessMap = M.sandstone.roughnessMap.clone();
  M.sandstoneLight.map = M.sandstone.map.clone();
  M.sandstoneLight.aoMap = M.sandstoneLight.roughnessMap;
  M.sandstoneLight.normalScale = new THREE.Vector2(1.2, 1.2);
  applyFacadeGrime(M.sandstone, grime, 0.85);
  applyFacadeGrime(M.sandstoneLight, grime, 0.85);

  // ---------- wood ----------
  M.wood = assets.makePBR('wood', { repeat: [1, 1], normalScale: 0.85 });
  M.wood.color.set(0xd3a878);
  M.woodDark = M.wood.clone();
  M.woodDark.color.set(0x9a7248);
  M.woodPale = M.wood.clone();
  M.woodPale.color.set(0xf0d6ae);
  for (const m of [M.woodDark, M.woodPale]){
    m.map = M.wood.map.clone(); m.normalMap = M.wood.normalMap.clone();
    m.roughnessMap = M.wood.roughnessMap.clone(); m.aoMap = m.roughnessMap; m.metalnessMap = m.roughnessMap;
    m.needsUpdate = true;
  }

  // faded shutter paints — window boards weather differently across the village
  const shutterVariant = (color) => {
    const m = M.woodPale.clone();
    m.color.set(color);
    m.map = M.wood.map.clone(); m.normalMap = M.wood.normalMap.clone();
    m.roughnessMap = M.wood.roughnessMap.clone(); m.aoMap = m.roughnessMap; m.metalnessMap = m.roughnessMap;
    m.roughness = 1;
    m.needsUpdate = true;
    return m;
  };
  M.shutterTeal = shutterVariant(0x7d9c95);
  M.shutterBlue = shutterVariant(0x6d8998);
  M.shutterRust = shutterVariant(0xa3614a);

  // dark glass that picks up a little sky reflection instead of reading as a void
  M.windowGlass = new THREE.MeshStandardMaterial({
    color: 0x0e161b, roughness: 0.24, metalness: 0.6, envMapIntensity: 1.5,
  });

  // ---------- metal ----------
  M.metal = assets.makePBR('metal', { repeat: [1, 1], normalScale: 1.0, metalness: 0.55, roughnessScale: 0.82 });
  M.metalDark = new THREE.MeshStandardMaterial({ color: 0x4b5256, metalness: 0.86, roughness: 0.38 });
  M.metalPaint = new THREE.MeshStandardMaterial({ color: 0x2a5f63, metalness: 0.55, roughness: 0.45 });
  M.brass = new THREE.MeshStandardMaterial({ color: 0xa88646, metalness: 0.95, roughness: 0.32 });
  M.iron = new THREE.MeshStandardMaterial({ color: 0x3a3d3c, metalness: 0.9, roughness: 0.5 });

  // ---------- roof ----------
  M.roof = assets.makePBR('roof', { repeat: [1, 1], normalScale: 1.0, roughnessScale: 0.9 });
  M.roofDark = M.roof.clone();
  M.roofDark.color.set(0x9c6b4f);

  // ---------- misc ----------
  M.clothRed = new THREE.MeshStandardMaterial({
    map: assets.decals.clothRed, color: 0xd8c4a4, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide, emissive: 0x3a140a, emissiveIntensity: 0.55,
  });
  M.clothTeal = new THREE.MeshStandardMaterial({
    map: assets.decals.clothTeal, color: 0xd8c4a4, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide, emissive: 0x0a2a2e, emissiveIntensity: 0.55,
  });
  M.canvasCream = new THREE.MeshStandardMaterial({ color: 0xcbb38a, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  M.clothShade = new THREE.MeshStandardMaterial({
    color: 0xf0ddb7, roughness: 0.92, metalness: 0,
    side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    emissive: 0x9a743f, emissiveIntensity: 0.32,
  });
  M.sack = new THREE.MeshStandardMaterial({ color: 0xb9a072, roughness: 0.98 });
  M.terracotta = new THREE.MeshStandardMaterial({ color: 0x9c5b3b, roughness: 0.8, metalness: 0.02 });
  M.terracottaLight = new THREE.MeshStandardMaterial({ color: 0xb8774e, roughness: 0.82 });
  M.trunk = new THREE.MeshStandardMaterial({ color: 0x7b5c3b, roughness: 1 });
  M.frond = new THREE.MeshStandardMaterial({ color: 0x5d7a2c, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  M.frondLight = new THREE.MeshStandardMaterial({ color: 0x86a044, roughness: 0.82, side: THREE.DoubleSide });
  M.shrub = new THREE.MeshStandardMaterial({ color: 0x77713d, roughness: 1 });
  M.rock = new THREE.MeshStandardMaterial({ color: 0x8c7a5c, roughness: 0.95, normalMap: assets.textures.sandstone.normalMap, normalScale: new THREE.Vector2(1.5, 1.5) });
  M.hay = new THREE.MeshStandardMaterial({ color: 0xc9a85c, roughness: 1 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x241c15, roughness: 0.88 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x22282b, roughness: 0.75 });

  M.fabricNormal = noiseNormalTexture(256, 1.6);
  M.leatherNormal = noiseNormalTexture(256, 2.4);

  // ---------- water ----------
  const waterNormal = waterNormalTexture(256);
  const waterNormal2 = waterNormal.clone();
  waterNormal.repeat.set(3, 3);
  waterNormal2.repeat.set(7, 7);
  M.waterNormals = [waterNormal, waterNormal2];
  M.water = new THREE.MeshStandardMaterial({
    color: 0x1f6f7e, roughness: 0.08, metalness: 0.18,
    normalMap: waterNormal, normalScale: new THREE.Vector2(0.42, 0.42),
    transparent: true, opacity: 0.94, envMapIntensity: 1.8,
  });
  M.water.clearcoat = 1;
  M.water.clearcoatRoughness = 0.03;

  // decal materials
  M.decalSplash = new THREE.MeshBasicMaterial({
    map: assets.decals.splash, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.NormalBlending, color: 0xbfefff,
  });
  M.tracks = new THREE.MeshBasicMaterial({
    map: assets.decals.tracks, transparent: true, opacity: 0.5, depthWrite: false,
  });
  return M;
}

/* helpers used by the map builder */
export function setShadow(mesh, cast = true, receive = true){
  mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh;
}

export function addBox(parent, geo, mat, x, y, z, ry = 0){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function plane(w, h, mat){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

export function decalTextureMaterial(tex, opacity = 1, color = 0xffffff){
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity, depthWrite: false, color,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
