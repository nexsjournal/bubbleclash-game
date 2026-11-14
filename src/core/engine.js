import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ============================================================
   HDR renderer + heavy cinematic post stack
   ============================================================ */
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.010 },
    uAberration: { value: 0.85 },
    uDamage: { value: 0.0 },
    uBubble: { value: 0.0 },
    uFlash: { value: 0.0 },
    uSaturation: { value: 1.38 },
    uContrast: { value: 1.11 },
    uFade: { value: 0.0 },
    uSlow: { value: 0.0 },
    uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uDamage;
    uniform float uBubble;
    uniform float uFlash;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uFade;
    uniform float uSlow;
    uniform vec2 uSunScreen;
    uniform float uSunVis;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // subtle barrel distortion
      vec2 uv = 0.5 + c * (1.0 + 0.008 * r2);

      // bubble containment warp
      if (uBubble > 0.001){
        uv += vec2(
          sin(uv.y * 16.0 + uTime * 1.7) * 0.0028,
          cos(uv.x * 13.0 + uTime * 1.4) * 0.0028
        ) * uBubble;
      }

      // chromatic aberration
      vec2 dir = uv - 0.5;
      float amt = (0.00045 + 0.0032 * uBubble) * (0.35 + r2 * 2.4) * uAberration;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * amt).b;

      // bubble rim film
      if (uBubble > 0.001){
        float rr = length(c * vec2(1.0, 0.94));
        float rim = smoothstep(0.52, 0.58, rr) * (1.0 - smoothstep(0.64, 0.76, rr));
        float hue = 0.5 + 0.5 * cos(6.28318 * (rr * 4.0 + uTime * 0.08 + vec2(0.0, 0.3).x));
        col += vec3(0.24, 0.62, 0.72) * rim * uBubble * (0.5 + hue * 0.5);
      }

      // colour grade (sRGB domain)
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col += vec3(0.014, 0.006, -0.008) * smoothstep(0.5, 1.0, lum);
      col += vec3(-0.012, 0.002, 0.024) * (1.0 - smoothstep(0.0, 0.42, lum));
      col = mix(col, col * vec3(0.55, 0.42, 0.4), uSlow * 0.22);

      // in-frame sun bloom (soft lens glow, only when facing the sun)
      if (uSunVis > 0.001){
        float sunD = length((vUv - uSunScreen) * vec2(uResolution.x / uResolution.y, 1.0));
        float wideGlow = exp(-sunD * 3.6);
        float coreGlow = exp(-sunD * 16.0);
        col += vec3(1.0, 0.84, 0.58) * wideGlow * uSunVis * 0.16;
        col += vec3(1.0, 0.95, 0.84) * coreGlow * uSunVis * 0.30;
      }

      // vignette
      float vig = smoothstep(1.02, 0.22, length(c * vec2(1.15, 1.0)));
      col *= mix(1.0, vig, uVignette);

      // damage edges
      if (uDamage > 0.001){
        float dmg = smoothstep(0.42, 0.95, length(c * vec2(1.0, 1.22)));
        col = mix(col, col * vec3(1.7, 0.30, 0.34) + vec3(0.16, 0.0, 0.0), uDamage * dmg);
      }

      // flash
      col += vec3(1.0, 0.96, 0.88) * uFlash * 0.16;

      // film grain
      float n = hash(vUv * uResolution + vec2(uTime * 60.0, uTime * 37.0));
      col += (n - 0.5) * uGrain;

      // fade
      col *= (1.0 - uFade);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export class Engine {
  constructor(canvas, scene){
    this.canvas = canvas;
    this.scene = scene;
    this.quality = 'ultra';
    this.time = 0;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 600);
    this.camera.position.set(0, 4, 40);

    this.buildComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildComposer(){
    const w = window.innerWidth, h = window.innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 4,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    const composer = new EffectComposer(this.renderer, rt);
    composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer = composer;

    this.renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(this.renderPass);

    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.1;
    this.gtao.updateGtaoMaterial({
      radius: 0.5, distanceExponent: 1.6, thickness: 0.7,
      scale: 1.0, samples: 14, distanceFallOff: 0.9, screenSpaceRadius: true,
    });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, rings: 2, samples: 12 });

    // Sprites and transparent/depth-less surfaces must not be rasterised into the
    // AO depth+normal buffer: their tiny quads would smear large dark blocks over
    // the sky and distant geometry.
    const baseVisibility = this.gtao.overrideVisibility.bind(this.gtao);
    const scene = this.scene;
    this.gtao.overrideVisibility = () => {
      baseVisibility();
      scene.traverse((o) => {
        if (o.isSprite) { o.visible = false; return; }
        if (!o.isMesh || !o.material) return;
        const m = o.material;
        if (m.transparent || m.depthWrite === false || m.blending === THREE.AdditiveBlending) o.visible = false;
      });
    };

    composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.55, 0.9);
    composer.addPass(this.bloom);

    this.output = new OutputPass();
    composer.addPass(this.output);

    this.cinematic = new ShaderPass(CinematicShader);
    this.cinematic.uniforms.uResolution.value.set(w, h);
    composer.addPass(this.cinematic);
  }

  setQuality(quality){
    this.quality = quality;
    const ultra = quality === 'ultra';
    this.gtao.enabled = ultra;
    this.bloom.strength = ultra ? 0.34 : 0.24;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ultra ? 1.5 : 1.2));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.cinematic.uniforms.uGrain.value = ultra ? 0.032 : 0.02;
    this.resize();
  }

  setCamera(camera){ this.camera = camera; this.renderPass.camera = camera; this.gtao.camera = camera; }

  resize(){
    const w = window.innerWidth, h = window.innerHeight;
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.cinematic.uniforms.uResolution.value.set(w, h);
    if (this.gtao) this.gtao.setSize(w, h);
  }

  render(dt, elapsed){
    this.time = elapsed;
    const u = this.cinematic.uniforms;
    u.uTime.value = elapsed;
    this.composer.render(dt);
  }
}
