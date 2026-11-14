import * as THREE from 'three';

/* ============================================================
   Cinematic desert environment : hazy afternoon sky, hard sun,
   dusty aerial perspective over the oasis village.
   ============================================================ */
export class Environment {
  constructor(scene, assets, renderer){
    this.scene = scene;
    this.assets = assets;
    this.renderer = renderer;
    this.time = 0;
    this.sunDir = new THREE.Vector3(-0.46, 0.42, 0.66).normalize();

    scene.background = null;
    scene.backgroundIntensity = 0.82;
    scene.backgroundBlurriness = 0.0;
    scene.environment = assets.envMap;
    scene.environmentIntensity = 0.72;
    scene.environmentRotation = new THREE.Euler(0, 2.15, 0);

    scene.fog = new THREE.FogExp2(0xdcc4a0, 0.0026);

    this.group = new THREE.Group();
    this.group.name = 'Environment';
    scene.add(this.group);

    this.buildSky();
    this.buildLights();
    this.buildGroundPlane();
    this.buildHorizon();
    this.buildDust();
    this.buildBirds();
  }

  buildSky(){
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uTime: { value: 0 },
        uZenith: { value: new THREE.Color(0x2f6f9e) },
        uHorizon: { value: new THREE.Color(0xd9c9b0) },
        uHaze: { value: new THREE.Color(0xf0dcbd) },
        uSunColor: { value: new THREE.Color(0xffe6bd) },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = (modelMatrix * vec4(position, 0.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uHaze;
        uniform vec3 uSunColor;
        uniform float uTime;
        varying vec3 vDir;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i), b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p){
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
          return v;
        }

        void main(){
          vec3 d = normalize(vDir);
          float up = clamp(d.y, 0.0, 1.0);
          // dusty desert gradient: warm haze at the horizon into deep blue zenith
          float grad = pow(smoothstep(-0.03, 0.72, up), 0.85);
          vec3 col = mix(uHorizon, uZenith, grad);

          // thick band of suspended dust hugging the horizon
          float haze = smoothstep(0.30, -0.04, d.y);
          col = mix(col, uHaze, haze * 0.55);

          // sun disc + broad atmospheric scatter
          float sd = max(dot(d, uSunDir), 0.0);
          float disc = smoothstep(0.99955, 0.99988, sd);
          col += uSunColor * disc * 9.0;
          col += uSunColor * pow(sd, 60.0) * 0.7;
          col += uSunColor * pow(sd, 6.0) * 0.14;

          // thin wind-stretched cirrus, no cartoon puffs
          vec2 cuv = d.xz / max(d.y + 0.22, 0.10);
          cuv = cuv * 0.5 + vec2(uTime * 0.0032, uTime * 0.0014);
          float streak = fbm(vec2(cuv.x * 0.7, cuv.y * 3.4) + 21.0);
          float cirrus = smoothstep(0.62, 0.86, streak);
          cirrus *= smoothstep(0.04, 0.22, d.y) * (1.0 - smoothstep(0.7, 1.0, d.y));
          vec3 cloudCol = mix(vec3(0.86, 0.85, 0.83), vec3(1.0, 0.98, 0.94), smoothstep(0.6, 0.9, streak));
          col = mix(col, cloudCol, cirrus * 0.4);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(480, 48, 32), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -100;
    this.sky = sky;
    this.group.add(sky);
  }

  buildLights(){
    const sun = new THREE.DirectionalLight(0xffe3b8, 3.3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2.4;
    sun.target.position.set(0, 0, 0);
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(0xbfd8ef, 0xc9a87c, 0.42);
    this.scene.add(hemi);
    this.hemi = hemi;

    // cool bounce from the sky opposite the sun
    const fill = new THREE.DirectionalLight(0x9fc3e6, 0.2);
    fill.position.set(40, 26, -38);
    this.scene.add(fill);
    this.fill = fill;

    // warm bounce from sand
    const bounce = new THREE.DirectionalLight(0xffae6e, 0.18);
    bounce.position.set(8, -12, 22);
    this.scene.add(bounce);
    this.bounce = bounce;

    // soft camera-side key so faces never fall into silhouette when backlit
    const faceLight = new THREE.DirectionalLight(0xfff0d8, 0.26);
    faceLight.position.set(4, 16, 46);
    this.scene.add(faceLight);
    this.faceLight = faceLight;
  }

  // huge underlay so the HDRI's ground half never shows through
  buildGroundPlane(){
    const mat = new THREE.MeshStandardMaterial({ color: 0xf2e2c1, roughness: 1, metalness: 0 });
    const g = new THREE.Mesh(new THREE.CircleGeometry(620, 64), mat);
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.35;
    g.receiveShadow = true;
    this.group.add(g);
  }

  buildHorizon(){
    const rand = mulberry32(9142);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xb99a72, roughness: 1, metalness: 0 });
    const rockMat2 = new THREE.MeshStandardMaterial({ color: 0xa8895f, roughness: 1, metalness: 0 });
    const duneMat = new THREE.MeshStandardMaterial({ color: 0xd9c09a, roughness: 1, metalness: 0 });

    // dune belt
    const duneGeo = new THREE.RingGeometry(150, 420, 96, 12);
    const pos = duneGeo.attributes.position;
    for (let i = 0; i < pos.count; i++){
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const h = 6 + Math.sin(a * 5.0 + 1.3) * 4.5 + Math.sin(a * 11.0 + r * 0.02) * 2.4 + rand() * 0.8;
      const t = (r - 150) / 270;
      pos.setZ(i, h * (0.55 + t * 1.6));
    }
    duneGeo.computeVertexNormals();
    const dunes = new THREE.Mesh(duneGeo, duneMat);
    dunes.rotation.x = -Math.PI / 2;
    dunes.position.y = -0.2;
    dunes.receiveShadow = false;
    this.group.add(dunes);

    // low, wide rock formations far beyond the walls
    for (let i = 0; i < 16; i++){
      const a = rand() * Math.PI * 2;
      const r = 190 + rand() * 160;
      const h = 8 + rand() * 15;
      const radius = 26 + rand() * 48;
      const geo = new THREE.CylinderGeometry(radius * (0.6 + rand() * 0.25), radius, h, 6 + Math.floor(rand() * 4), 3);
      const p = geo.attributes.position;
      for (let j = 0; j < p.count; j++){
        p.setX(j, p.getX(j) * (0.9 + rand() * 0.25));
        p.setZ(j, p.getZ(j) * (0.9 + rand() * 0.25));
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, rand() > 0.5 ? rockMat : rockMat2);
      m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
      m.rotation.y = rand() * Math.PI;
      this.group.add(m);
    }

    // distant palms silhouettes
    for (let i = 0; i < 7; i++){
      const a = rand() * Math.PI * 2;
      const r = 88 + rand() * 60;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 9 + rand() * 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 1 }));
      trunk.position.set(Math.cos(a) * r, 4, Math.sin(a) * r);
      this.group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x3f5526, roughness: 1 }));
      crown.position.set(trunk.position.x, trunk.position.y + 5, trunk.position.z);
      crown.scale.y = 0.6;
      this.group.add(crown);
    }
  }

  buildDust(){
    const count = 1100;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++){
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.PointsMaterial({
      size: 0.12, map: this.assets.sprites.glow, transparent: true, opacity: 0.24,
      blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.dust = points;
    this.dustPos = pos;
    this.group.add(points);
  }

  buildBirds(){
    const mat = new THREE.MeshBasicMaterial({ color: 0x4a4136, transparent: true, opacity: 0.55 });
    this.birds = [];
    const wingGeo = new THREE.ConeGeometry(0.24, 1.15, 3);
    for (let i = 0; i < 7; i++){
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wingGeo, mat);
      wl.rotation.z = Math.PI / 2; wl.position.x = -1.0;
      const wr = wl.clone(); wr.position.x = 1.0; wr.rotation.z = -Math.PI / 2;
      g.add(wl, wr);
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 40;
      g.userData = { a, r, speed: 0.04 + Math.random() * 0.04, h: 26 + Math.random() * 18, phase: Math.random() * 6 };
      this.group.add(g);
      this.birds.push(g);
    }
  }

  buildChimneySmoke(){
    this.smokePuffs = [];
    const mat = new THREE.SpriteMaterial({
      map: this.assets.sprites.smoke, color: 0xf6ead6, transparent: true,
      opacity: 0.10, depthWrite: false,
    });
    this.smokeOrigins = [
      new THREE.Vector3(-18, 8.5, -22),
      new THREE.Vector3(21, 9.5, -18),
    ];
    for (const o of this.smokeOrigins){
      for (let i = 0; i < 6; i++){
        const s = new THREE.Sprite(mat.clone());
        s.position.copy(o);
        s.scale.setScalar(2 + Math.random() * 3);
        s.userData = { life: Math.random(), max: 9 + Math.random() * 6, ox: o.x, oy: o.y, oz: o.z, drift: Math.random() * 1.4 };
        s.userData.life = Math.random() * s.userData.max;
        this.group.add(s);
        this.smokePuffs.push(s);
      }
    }
  }

  update(dt, time, focus, camera){
    this.time = time;
    // sky follows the camera, sun uniform stays world-fixed
    if (this.sky && camera){
      this.sky.position.copy(camera.position);
      this.skyMat.uniforms.uTime.value = time;
    }
    // shadow frustum follows the player
    const focusPos = focus || new THREE.Vector3();
    this.sun.position.copy(focusPos).addScaledVector(this.sunDir, 92);
    this.sun.target.position.copy(focusPos);
    this.sun.target.updateMatrixWorld();

    // dust drift
    const pos = this.dustPos;
    if (pos){
      for (let i = 0; i < pos.length; i += 3){
        const s = i / 3;
        pos[i] += Math.sin(time * 0.13 + s) * 0.006;
        pos[i + 1] += Math.sin(time * 0.07 + s * 0.7) * 0.004 - 0.0015;
        pos[i + 2] += 0.02 * dt * 1.6 + Math.cos(time * 0.11 + s) * 0.005;
        if (pos[i] - focusPos.x > 60) pos[i] -= 120;
        if (pos[i] - focusPos.x < -60) pos[i] += 120;
        if (pos[i + 2] - focusPos.z > 60) pos[i + 2] -= 120;
        if (pos[i + 2] - focusPos.z < -60) pos[i + 2] += 120;
        if (pos[i + 1] > 26) pos[i + 1] = 0.2;
        if (pos[i + 1] < 0) pos[i + 1] = 25;
      }
      this.dust.geometry.attributes.position.needsUpdate = true;
      if (camera){
        this.dust.position.x = Math.round(focusPos.x / 120) * 120;
        this.dust.position.z = Math.round(focusPos.z / 120) * 120;
      }
    }

    // birds
    for (const b of this.birds){
      const u = b.userData;
      u.a += u.speed * dt;
      b.position.set(Math.cos(u.a) * u.r, u.h + Math.sin(time * 0.5 + u.phase) * 2, Math.sin(u.a) * u.r);
      b.rotation.y = -u.a + Math.PI / 2;
      b.children[0].rotation.z = Math.PI / 2 + Math.sin(time * 9 + u.phase) * 0.35;
      b.children[1].rotation.z = -Math.PI / 2 - Math.sin(time * 9 + u.phase) * 0.35;
    }

    // chimney smoke
    for (const s of this.smokePuffs || []){
      const u = s.userData;
      u.life += dt;
      if (u.life > u.max){ u.life = 0; }
      const t = u.life / u.max;
      s.position.set(
        u.ox + Math.sin(time * 0.4 + t * 4) * 1.6 + t * 6.5,
        u.oy + t * 9,
        u.oz + t * 4 + Math.cos(time * 0.3 + t * 3) * 1.2
      );
      const sc = (2 + t * 4.2);
      s.scale.setScalar(sc);
      s.material.opacity = Math.sin(t * Math.PI) * 0.10;
    }
  }

  setQuality(quality){
    if (quality === 'high'){
      this.sun.shadow.mapSize.set(2048, 2048);
      this.dust.visible = true;
    } else {
      this.sun.shadow.mapSize.set(4096, 4096);
      this.dust.visible = true;
    }
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
}

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
