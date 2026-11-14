import * as THREE from 'three';
import { Engine } from '../core/engine.js';
import { Assets } from '../core/assets.js';
import { Input } from '../core/input.js';
import { CameraRig } from '../core/camera.js';
import { createMaterials } from '../world/materials.js';
import { Environment } from '../world/environment.js';
import { VillageMap } from '../world/map.js';
import { Effects } from '../fx/effects.js';
import { Fighter } from '../entities/fighter.js';
import { ProjectileSystem } from './projectiles.js';
import { UI } from '../ui/ui.js';
import { AudioEngine } from '../audio/audio.js';
import { updateEnemyAI, updateAllyAI } from './ai.js';
import {
  createActor, updatePlayerCombat, updateActorStates, handleCharacterHit,
  handleWorldHit, tryPlayerInteract, tryPump, enemyShoot, allyShoot,
  enemyShootBubble, allyShootBubble, enemyKick, computeInteractTarget,
  respawnActor, updateBubbleState,
} from './combat.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  constructor(canvas){
    this.canvas = canvas;
    this.state = 'boot';
    this.time = 0;
    this.dt = 0;
    this.timeScale = 1;
    this.slowmo = 0;
    this.quality = 'ultra';
    this.clock = new THREE.Clock();
    this.camera = null;
    this.actors = [];
    this.enemies = [];
    this.projectiles = null;
    this.stats = null;
    this.introT = 0;
    this.countdownT = 0;
    this.countdownStep = -1;
    this.lastCountdown = 0;
    this.menuAngle = 0.7;
    this.pendingEnd = false;
    this._savedQuality = 'ultra';
    this.menuTime = 0;
    this.cine = { start: new THREE.Vector3(), startLook: new THREE.Vector3(), end: new THREE.Vector3(), endLook: new THREE.Vector3() };
    this.wave = 0;
    this.waveSizes = [3, 4, 5];
    this.selectedSkin = 'player';
    this.waveDelay = 0;
    this.waveCleared = false;
    this.objective = { integrity: 100, radius: 7.0, pos: new THREE.Vector3(0, 0, -12) };
    this.pickups = [];
  }

  async init(){
    const t0 = performance.now();
    this.ui = new UI(null);
    this.ui.setActionHandler((a) => this.handleAction(a));
    this.ui.setLoading(0.02, 'BOOT SEQUENCE · 启动引擎');

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.engine = new Engine(this.canvas, this.scene);
    this.camera = this.engine.camera;

    await frame();
    this.assets = new Assets(this.engine.renderer);
    await this.assets.load(
      (p) => { this._lastP = p; this.ui.setLoading(0.05 + p * 0.5, null); },
      (label) => this.ui.setLoading(0.05 + (this._lastP || 0) * 0.5, label)
    );
    // reflect final load progress
    this.ui.setLoading(0.55, 'HDRI + PBR 资产载入完成');
    this.ui.setLoading(0.58, 'HDR ENVIRONMENT · 环境就绪');
    await frame();

    this.ui.setLoading(0.64, 'PBR LIBRARY · 编译材质');
    this.materials = createMaterials(this.assets);
    await frame();

    this.ui.setLoading(0.70, 'TERRAIN MANIFEST · 搭建绿洲村落');
    this.env = new Environment(this.scene, this.assets, this.engine.renderer);
    this.map = new VillageMap(this.scene, this.materials, this.assets);
    this.map.build();
    this.ui.map = this.map;
    this.ui.buildMinimapBase();
    await frame();

    this.ui.setLoading(0.82, 'GEOMETRY STREAMING · 建筑 / 集市 / 棕榈');
    this.effects = new Effects(this.scene, this.assets, this.map);
    this.projectiles = new ProjectileSystem(this.scene, this.map, this.effects, this.assets);
    this.projectiles.onCharacterHit = (victim, point, p, meta) => handleCharacterHit(this, victim, point, p, meta);
    this.projectiles.onWorldHit = (point, normal, p) => handleWorldHit(this, point, normal, p);
    await frame();

    this.ui.setLoading(0.9, 'OPERATORS DEPLOYING · 干员进场');
    this.spawnActors();
    await frame();

    this.rig = new CameraRig(this.camera, this.map);
    this.input = new Input(this.canvas);
    this.input.onPause = () => this.togglePause();
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this._programmaticUnlock){
        this.pause();
      }
    };
    this.audio = new AudioEngine();
    this.projectiles.camera = this.camera;
    this.projectiles.audio = this.audio;
    // Browsers only allow audio after a gesture. Arm the menu score on the
    // very first click/key press so the title screen is never silent.
    this._audioUnlocked = false;
    const armAudio = () => {
      document.removeEventListener('pointerdown', armAudio);
      document.removeEventListener('keydown', armAudio);
      this._audioUnlocked = true;
      if (!this.audio) return;
      this.audio.ensure();
      this.ui.setAudioUnlocked(true);
      if (this.state === 'loading' || this.state === 'menu'){
        this.audio.startAmbient();
        this.audio.startMenuMusic();
      }
    };
    document.addEventListener('pointerdown', armAudio);
    document.addEventListener('keydown', armAudio);
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.requestLock();
    });
    window.addEventListener('resize', () => this.engine.resize());

    this.scene.environment = this.assets.envMap;

    this.ui.setLoading(0.95, 'COMPILING SHADERS · 着色器预热');
    this.engine.renderer.compile(this.scene, this.camera);
    await frame();

    this.ui.setLoading(1.0, 'READY · 准备空降');
    this.ui.setMenuQuality(this.quality);
    const remain = 1850 - (performance.now() - t0);
    if (remain > 0) await wait(remain);

    this.state = 'menu';
    this.ui.bubbleWipe();
    this.ui.showScreen('menu');
    this.ui.setHUDVisible(false);
    this.placeMenuActors();
    if (this._audioUnlocked && this.audio){
      this.audio.startAmbient();
      this.audio.startMenuMusic();
      this.ui.setAudioUnlocked(true);
    }
    this.engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.engine.setQuality(this.quality);

    this.loop();
  }

  spawnActors(){
    const M = this.map;
    this.player = createActor(this, this.selectedSkin || 'player', 'blue', {
      name: 'ECHO', spawn: M.playerSpawn.clone(), heading: Math.PI,
    });
    this.ally = createActor(this, 'ally', 'blue', {
      name: 'NOVA', spawn: M.allySpawn.clone(), heading: Math.PI,
    });
    const names = ['VIPER', 'RAZOR', 'GHOST', 'EMBER', 'SABLE'];
    const kinds = ['red', 'teal', 'sunny', 'berry', 'purple'];
    this.enemies = [];
    for (let i = 0; i < 5; i++){
      const spawn = M.enemySpawns[i % M.enemySpawns.length].clone();
      const e = createActor(this, kinds[i], 'red', {
        name: names[i], spawn, heading: 0,
        variant: i % 3,
      });
      e.waveIndex = i;
      this.enemies.push(e);
    }
    this.actors = [this.player, this.ally, ...this.enemies];
    this.redStats = { score: 0, bubbles: 0, pops: 0, rescues: 0, shots: 0, hits: 0 };
    this.buildPickups();
  }

  setPlayerSkin(kind){
    if (!kind) return;
    const meta = {
      player: { mono: 'ECHO', cn: '回声', role: 'ASSAULT · CARBINE' },
      sunny: { mono: 'VPR', cn: '毒蛇', role: 'BREACHER · CARBINE' },
      mint: { mono: 'NVA', cn: '新星', role: 'SUPPORT · CARBINE' },
      berry: { mono: 'SBL', cn: '黑貂', role: 'SKIRMISHER · CARBINE' },
      rocky: { mono: 'RZR', cn: '剃刀', role: 'TANK · CARBINE' },
    }[kind];
    const dossier = document.querySelector('.dossier');
    if (dossier && meta){
      const mono = dossier.querySelector('.ds-mono');
      if (mono) mono.textContent = meta.mono;
      const name = dossier.querySelector('.ds-name');
      if (name) name.innerHTML = `${meta.mono === 'ECHO' ? 'ECHO' : meta.mono} <em>// ${meta.cn}</em>`;
      const role = dossier.querySelector('.ds-role');
      if (role) role.textContent = meta.role;
    }
    this.selectedSkin = kind;
    if (this.state !== 'menu') return;
    const old = this.player.fighter;
    const pos = old.group.position.clone();
    const rot = old.group.rotation.y;
    this.scene.remove(old.group);
    const f = new Fighter(this.assets, { kind, team: 'blue', name: 'ECHO', isPlayer: true });
    this.scene.add(f.group);
    f.group.position.copy(pos);
    f.group.rotation.y = rot;
    this.player.fighter = f;
    this.player.heading = rot;
    f.setWetness(0);
    this.placeMenuActors();
  }

  placeMenuActors(){
    // hide match-only pickups in the attract screen
    for (const it of this.pickups) it.group.visible = false;
    this.map.setMenuStage(true);
    // hero duo on the open right side of frame, clear of the menu rail
    this.player.fighter.group.position.set(2.2, 0, 16.0);
    this.player.fighter.group.rotation.y = 0.16;
    this.player.heading = 0.16;
    this.player.fighter.group.scale.setScalar(1.0);
    this.ally.fighter.group.position.set(5.9, 0, 13.9);
    this.ally.fighter.group.rotation.y = 0.3;
    this.ally.heading = 0.3;
    this.ally.fighter.group.scale.setScalar(1.0);
    this.player.fighter.setMotion(0, 0);
    this.ally.fighter.setMotion(0, 0);
    this.player.fighter.cheer = true;
    this.ally.fighter.cheer = true;
    // hostiles stay off the attract screen
    this.enemies.forEach((e) => {
      e.fighter.group.visible = false;
    });
  }

  /* ================= actions & flow ================= */
  handleAction(action){
    this.audio && this.audio.ensure();
    if (this.audio && this.audio.ctx) this.ui.setAudioUnlocked(true);
    if (this.state === 'menu' && action !== 'start'){
      this.audio.startAmbient();
      this.audio.startMenuMusic();
    }
    if (action === 'start'){
      this.audio.ui();
      this.audio.startAmbient();
      this.startMatch();
    } else if (action === 'resume'){
      this.audio.ui();
      this.resume();
    } else if (action === 'restart'){
      this.audio.ui();
      this.startMatch(true);
    } else if (action === 'menu'){
      this.audio.ui();
      this.backToMenu();
    } else if (action === 'quality'){
      this.quality = this.quality === 'ultra' ? 'high' : 'ultra';
      this.ui.setMenuQuality(this.quality);
      this.engine.setQuality(this.quality);
      this.env.setQuality(this.quality);
      this.ui.showToast('画质已切换至 ' + (this.quality === 'ultra' ? 'ULTRA' : 'HIGH'));
    } else if (action.startsWith('quality:')){
      this.quality = action.split(':')[1];
      this.engine.setQuality(this.quality);
      this.env.setQuality(this.quality);
      this.ui.setMenuQuality(this.quality);
    } else if (action.startsWith('sensitivity:')){
      this.rig.sensitivity = 0.0022 * Number(action.split(':')[1]);
    } else if (action.startsWith('volume:')){
      this.audio.setVolume(Number(action.split(':')[1]));
    }
  }

  startMatch(isRestart = false){
    this.audio.ensure();
    this.audio.stopMenuMusic();
    this.audio.startAmbient();
    this.audio.startMatchMusic();
    this.audio.startBattleAmbient();
    this.audio.setLowHealth(false);
    this.ui.bubbleWipe();
    this.resetMatch();
    this.map.setMenuStage(false);
    for (const a of this.actors) a.fighter.cheer = false;
    this.ui.showScreen(null);
    this.ui.setHUDVisible(false);
    this.ui.setLetterbox(true);
    this.ui.refs.controlsModal.classList.remove('open');
    this.input.requestLock();
    this.state = 'intro';
    this.introT = 0;
    this.rig.initialized = false;
    this.introDone = false;
    this.ui.hideBanner();
    this.ui.hideCountdown();

    // cinematic insertion: the duo starts behind their spawn and walks into place
    const ps = this.map.playerSpawn.clone();
    const as = this.map.allySpawn.clone();
    this.introPlayerZ = ps.z;
    this.introAllyZ = as.z;
    this.player.fighter.group.position.set(ps.x, 0, ps.z + 2.7);
    this.player.fighter.group.rotation.y = Math.PI;
    this.player.heading = Math.PI;
    this.player.fighter.setMotion(2.4, 0);
    this.ally.fighter.group.position.set(as.x, 0, as.z + 2.4);
    this.ally.fighter.group.rotation.y = Math.PI;
    this.ally.heading = Math.PI;
    this.ally.fighter.setMotion(2.4, 0);
    for (const e of this.enemies) e.fighter.group.visible = false;

    this.cine.start.set(ps.x + 3.1, 1.25, ps.z + 5.1);
    this.cine.startLook.set(ps.x, 1.32, ps.z - 1.5);
    this.cine.end.set(ps.x + 0.95, 2.22, ps.z + 3.25);
    this.cine.endLook.set(ps.x, 1.35, ps.z - 12);
    this.stateTimer = 0;
  }

  resetMatch(){
    this.matchTime = 300;
    this.matchElapsed = 0;
    this.scoreBlue = 0;
    this.scoreRed = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboMax = 0;
    this.damageTaken = 0;
    this.pendingEnd = false;
    this.slowmo = 0;
    this.timeScale = 1;
    this.hintTimer = 0;
    this.projectiles.clear();
    this.player.stats = { score: 0, bubbles: 0, pops: 0, rescues: 0, shots: 0, hits: 0 };
    this.ally.stats = { score: 0, bubbles: 0, pops: 0, rescues: 0, shots: 0, hits: 0 };
    this.redStats = { score: 0, bubbles: 0, pops: 0, rescues: 0, shots: 0, hits: 0 };
    this.enemies.forEach((e, i) => {
      e.stats = { score: 0, bubbles: 0, pops: 0, rescues: 0, shots: 0, hits: 0 };
    });
    resetActor(this.player, this.map.playerSpawn, Math.PI);
    resetActor(this.ally, this.map.allySpawn, Math.PI);
    this.wave = 0;
    this.waveDelay = 0;
    this.waveCleared = false;
    this.objective.integrity = 100;
    this._depotBlown = false;
    if (this.objective.crystal) this.objective.crystal.visible = true;
    if (this.objective.halo) this.objective.halo.visible = true;
    if (this.objective.bubbleMesh) this.objective.bubbleMesh.visible = true;
    if (this.objective.visual) this.objective.visual.visible = true;
    this.player.water = 100;
    this.player.waterReserve = 3;
    this.player.weapon = 'rifle';
    this.player.fighter && this.player.fighter.setWeapon('rifle');
    this.player.weaponTimer = 0;
    this.activateWave(0, false);
    this.resetPickups();
    this.player.pumpCd = 0;
    this.rig.yaw = 0;
    this.rig.pitch = 0.02;
    this.rig.initialized = false;
    this.rig.trauma = 0;
    this.aimBlend = 0;
    this.ui.setLetterbox(false);
    this.ui.refs.floaters.innerHTML = '';
    this.ui.refs.killfeed.innerHTML = '';
    this.ui.refs.damageDirs.innerHTML = '';
    this.ui.refs.bubbleScreen.classList.remove('on');
    this.ui.setHUDVisible(false);
  }

  beginCountdown(){
    this.state = 'countdown';
    this.countdownT = 0;
    this.countdownStep = 3;
    this.player.fighter.group.position.z = this.introPlayerZ;
    this.ally.fighter.group.position.z = this.introAllyZ;
    this.player.fighter.setMotion(0, 0);
    this.ally.fighter.setMotion(0, 0);
    for (const e of this.enemies) e.fighter.group.visible = !!e.alive;
    this.ui.setHUDVisible(true);
    this.ui.countdown('3', '准备!', 14);
    this.audio.countdown(false);
    this.rig.initialized = false;
  }

  updateIntro(dt){
    this.introT += dt;
    const t = Math.min(1, this.introT / 3.0);
    const e = t * t * (3 - 2 * t);
    const walkT = Math.min(1, this.introT / 1.9);
    const we = walkT * walkT * (3 - 2 * walkT);

    this.player.fighter.group.position.z = THREE.MathUtils.lerp(this.introPlayerZ + 2.7, this.introPlayerZ, we);
    this.ally.fighter.group.position.z = THREE.MathUtils.lerp(this.introAllyZ + 2.4, this.introAllyZ, we);
    const walking = this.introT < 2.05;
    this.player.fighter.setMotion(walking ? 2.4 : 0, 0);
    this.ally.fighter.setMotion(walking ? 2.4 : 0, 0);

    const p = this.player.fighter.group.position;
    const pos = new THREE.Vector3().lerpVectors(this.cine.start, this.cine.end, e);
    pos.x += Math.sin(t * Math.PI) * 0.55;
    pos.y += Math.sin(t * Math.PI) * 0.18;
    const look = new THREE.Vector3().lerpVectors(this.cine.startLook, this.cine.endLook, e);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.camera.fov = THREE.MathUtils.lerp(54, 66, e);
    this.camera.updateProjectionMatrix();

    // idle actors animate
    for (const a of this.actors) a.fighter.update(dt, this.time);
    this.env.update(dt, this.time, p, this.camera);
    this.map.update(dt, this.time, p);
    this.effects.update(dt, this.camera);

    if (this.introT >= 3.0){
      this.beginCountdown();
    }
    this.render();
    this.updateHUDFrame();
  }

  updateCountdown(dt){
    const p = this.player.fighter.group.position;
    for (const a of this.actors){
      a.fighter.setMotion(0, 0);
      a.fighter.update(dt, this.time);
    }
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 66, 1 - Math.pow(0.01, dt));
    this.camera.updateProjectionMatrix();
    this.env.update(dt, this.time, p, this.camera);
    this.map.update(dt, this.time, p);
    this.effects.update(dt, this.camera);

    this.countdownT += dt;
    this.rig.updateCombat(dt, this.player.fighter.group.position, 0, this.time);
    const t = this.countdownT;
    let step = 3;
    if (t > 0.9) step = 2;
    if (t > 1.8) step = 1;
    if (t > 2.7) step = 0;
    if (step !== this.countdownStep){
      this.countdownStep = step;
      if (step > 0){
        this.ui.countdown(String(step), '准备!', 0.9);
        this.audio.countdown(false);
      } else {
        this.ui.countdown('GO!', '出发！', 0.9);
        this.audio.countdown(true);
        this.ui.setLetterbox(false);
      }
    }
    if (t > 3.35){
      this.state = 'playing';
      this.ui.hideCountdown();
      this.ui.setHUDVisible(true);
      this.rig.initialized = false;
      this.ally.ai.sayCd = 3;
      this.say('红队正在进攻 A 点！守住泡泡核心！', 'NOVA', 4);
      this.ui.showBanner('第 1 波 · 守住 A 点', 'SECURE SITE A', false, 3);
      this.hintTimer = 18;
    }
    this.render();
    this.updateHUDFrame();
  }

  pause(){
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._programmaticUnlock = true;
    this.input.releaseLock();
    this.input.keys.clear();
    this.input.lmb = false;
    this.input.rmb = false;
    this.ui.setLetterbox(false);
    this.ui.setPauseStats({
      score: Math.round(this.scoreBlue), pops: this.player.stats.pops, melee: this.player.stats.melee,
    });
    this.ui.showScreen('pause');
    this.ui.setHUDVisible(true);
    this._programmaticUnlock = false;
    this.audio.ui(true);
    this.audio.setMusicPaused(true);
    this.audio.setLowHealth(false);
  }

  resume(){
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.showScreen(null);
    this.ui.setHUDVisible(true);
    this.input.requestLock();
    this.audio.ui();
    this.audio.setMusicPaused(false);
  }

  togglePause(){
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  backToMenu(){
    this.state = 'menu';
    this.ui.showScreen('menu');
    this.ui.setHUDVisible(false);
    this.ui.setLetterbox(false);
    this.ui.hideCountdown();
    this.ui.hideBanner();
    this._programmaticUnlock = true;
    this.input.releaseLock();
    this._programmaticUnlock = false;
    this.projectiles.clear();
    this.audio.stopMatchMusic();
    this.audio.stopBattleAmbient();
    this.audio.setLowHealth(false);
    this.audio.startAmbient();
    this.audio.startMenuMusic();
    this.resetVitalsForMenu();
    this.placeMenuActors();
  }

  resetVitalsForMenu(){
    for (const a of this.actors){
      a.wet = 0; a.hp = 100; a.alive = true; a.bubbled = false; a.invuln = 0;
      a.fighter.group.visible = true;
      a.fighter.setBubbled(false);
      a.fighter.setWetness(0);
      a.fighter.bubbleT = 0;
      a.fighter.update(0, this.time);
    }
    this.ui.refs.bubbleScreen.classList.remove('on');
  }

  endMatch(victory){
    if (this.state === 'results') return;
    this.state = 'results';
    this._programmaticUnlock = true;
    this.input.releaseLock();
    this._programmaticUnlock = false;
    this.ui.hideCountdown();
    this.ui.hideBanner();
    this.ui.setLetterbox(false);
    this.ui.setHUDVisible(false);
    this.ui.showScreen('results');
    const p = this.player.stats, a = this.ally.stats, rs = this.redStats;
    const acc = p.shots > 0 ? Math.round(p.hits / p.shots * 100) : 0;
    const aAcc = a.shots > 0 ? Math.round(a.hits / a.shots * 100) : 0;
    this.ui.showResults({
      victory,
      scoreBlue: this.scoreBlue,
      scoreRed: this.scoreRed,
      duration: formatTime(this.matchElapsed),
      combo: this.comboMax,
      damageTaken: this.damageTaken,
      player: { ...p, accuracy: acc },
      ally: { ...a, accuracy: aAcc },
      enemy: { score: this.scoreRed, bubbles: rs.bubbles, pops: rs.pops, rescues: rs.rescues },
      mvpName: p.score >= a.score ? 'ECHO' : 'NOVA',
    });
    this.ui.showBanner(victory ? '红队被击退 · 泡泡核心完好' : '泡泡核心被摧毁 · 任务失败', victory ? 'MISSION COMPLETE' : 'MISSION FAILED', !victory, 3);
    this.audio.stopMatchMusic();
    this.audio.stopBattleAmbient();
    this.audio.setLowHealth(false);
    this.audio.sting(victory);
  }

  /* ================= loop ================= */
  loop(){
    requestAnimationFrame(() => this.loop());
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, raw);
    this.dt = dt;
    this.time += dt;

    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'intro') this.updateIntro(dt);
    else if (this.state === 'countdown') this.updateCountdown(dt);
    else if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'paused'){
      this.env.update(0, this.time, this.player.fighter.group.position, this.camera);
      this.map.update(0, this.time, this.player.fighter.group.position);
      this.effects.update(0, this.camera);
      this.render();
      this.input.endFrame();
      return;
    } else if (this.state === 'results'){
      this.updateResults(dt);
    } else {
      this.render();
      this.input.endFrame();
      return;
    }
    this.input.endFrame();
  }

  updateMenu(dt){
    this.menuTime += dt;
    this.menuAngle += dt * 0.035;
    const t = this.menuTime * 0.18;
    const pos = new THREE.Vector3(Math.sin(t) * 0.4, 3.7 + Math.sin(t * 0.7) * 0.08, 23.4);
    const look = new THREE.Vector3(1.6 + Math.sin(t * 0.6) * 0.3, 1.95, 6.0);
    this.rig.setShot(pos, look, dt, false, 50);
    // breathe some life into the lineup
    for (const a of this.actors){
      a.fighter.setMotion(0, 0);
      a.fighter.update(dt, this.time);
    }
    this.env.update(dt, this.time, new THREE.Vector3(0, 0, 0), this.camera);
    this.map.update(dt, this.time, this.player.fighter.group.position);
    this.effects.update(dt, this.camera);
    this.render();
  }

  updateResults(dt){
    this.menuAngle += dt * 0.05;
    const p = this.player.fighter.group.position;
    const pos = new THREE.Vector3(p.x + Math.cos(this.menuAngle) * 9, p.y + 5.4, p.z + Math.sin(this.menuAngle) * 9);
    this.rig.setShot(pos, new THREE.Vector3(p.x, p.y + 1.2, p.z), dt, false, 60);
    for (const a of this.actors) a.fighter.update(dt, this.time);
    this.env.update(dt, this.time, p, this.camera);
    this.map.update(dt, this.time, p);
    this.effects.update(dt, this.camera);
    this.render();
  }

  updatePlaying(dt){
    const scaled = dt * this.timeScale;
    this.matchElapsed += scaled;
    this.matchTime = Math.max(0, 180 - this.matchElapsed);

    if (this.slowmo > 0){
      this.slowmo -= dt;
      this.timeScale = 0.3;
    } else {
      this.timeScale = 1;
    }

    // input look
    const m = this.input.consumeMouse();
    this.rig.addLook(m.dx, m.dy);
    this.aimBlend = THREE.MathUtils.lerp(this.aimBlend, this.input.rmb ? 1 : 0, 1 - Math.pow(0.0005, dt));
    this.rig.setAim(this.aimBlend);

    updatePlayerCombat(this, scaled, dt);
    updateAllyAI(this, this.ally, scaled);
    for (const e of this.enemies) updateEnemyAI(this, e, scaled);

    updateActorStates(this, scaled, dt);
    updateBubbleState(this, scaled);
    this.separateActors(scaled);
    this.projectiles.update(scaled, this.actors);
    for (const a of this.actors){
      a.fighter.updateBubbleBar(a.bubbled ? 1 - a.bubbleTimer / 12 : 0);
    }
    this.updateObjective(scaled);
    this.updatePickups(scaled);
    this.checkWave(scaled);
    this.updateAudioMix(scaled);

    // combo decay
    if (this.comboTimer > 0){
      this.comboTimer -= scaled;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // interact
    const interact = computeInteractTarget(this);
    if (interact && this.input.pressed('KeyF')) tryPlayerInteract(this);
    if (this.input.pressed('KeyR')) tryPump(this);
    if (this.input.pressed('Space') && this.player.bubbled){
      this.player.struggle = Math.min(0.35, (this.player.struggle || 0) + 0.05);
    }

    // camera
    const p = this.player.fighter.group.position;
    if (this.player.bubbled){
      this.rig.updateBubble(dt, p.clone().setY(p.y + 1.25), this.time);
    } else {
      this.rig.updateCombat(dt, p, Math.min(1, this.player.moveSpeed / 6), this.time);
    }

    // world systems
    this.env.update(scaled, this.time, p, this.camera);
    this.map.update(scaled, this.time, p);
    this.effects.update(scaled, this.camera);
    this.updateCinematicFX(dt);
    this.updateHUDFrame();
    this.ui.update(dt);
    this.ui.updateMinimap(this.minimapState(), dt);

    // match end
    if (!this.pendingEnd && this.matchTime <= 0){
      this.pendingEnd = true;
      this.ui.showBanner('泡泡核心仍未脱离威胁', 'TIME UP', true, 2.6);
      setTimeout(() => this.endMatch(false), 900);
    }

    this.render();
  }

  render(){
    const persp = this.engine.renderer.getSize(new THREE.Vector2()).y /
      (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.effects.setPerspective(persp);
    this.engine.render(this.dt, this.time);
  }

  /* ================= waves · objective · pickups ================= */
  activateWave(n, announce = true){
    this.wave = n;
    const size = this.waveSizes[n];
    const spawns = this.map.enemySpawns;
    this.enemies.forEach((e, i) => {
      if (i < size){
        const s = spawns[i % spawns.length].clone();
        s.x += (Math.random() - 0.5) * 2.4;
        s.z += (Math.random() - 0.5) * 2.2;
        resetActor(e, s, Math.random() * Math.PI * 2);
        e.invuln = 1.4;
        e.ai.role = i % 2 === 0 ? 'siege' : 'hunter';
      } else {
        e.alive = false;
        e.bubbled = false;
        e.fighter.setBubbled(false);
        e.fighter.group.visible = false;
      }
    });
    if (announce){
      this.ui.showBanner('红队从村落北侧压上来了', 'WAVE 0' + (n + 1), n === 2, 2.6);
      this.audio.alarm();
    }
  }

  checkWave(dt){
    if (this.pendingEnd) return;
    const size = this.waveSizes[this.wave];
    const alive = this.enemies.slice(0, size).filter((e) => e.alive).length;
    if (!this.waveCleared && alive === 0){
      this.waveCleared = true;
      const last = this.wave >= this.waveSizes.length - 1;
      if (last){
        this.pendingEnd = true;
        this.ui.showBanner('红队全数击退', 'WAVE CLEAR', false, 3);
        this.audio.sting(true);
        setTimeout(() => this.endMatch(true), 1400);
      } else {
        this.waveDelay = 3.0;
        this.player.waterReserve = Math.min(5, (this.player.waterReserve || 0) + 1);
        this.player.water = 100;
        this.ui.showBanner('补给 +1 · 下一波即将抵达', 'RESUPPLY', false, 2.4);
        this.say('干得漂亮！补充弹药，下一波要来了。', 'NOVA', 3);
      }
    }
    if (this.waveCleared && !this.pendingEnd){
      this.waveDelay -= dt;
      if (this.waveDelay <= 0 && this.wave < this.waveSizes.length - 1){
        this.waveCleared = false;
        this.activateWave(this.wave + 1, true);
      }
    }
  }

  updateAudioMix(dt){
    if (!this.audio || !this.audio.ctx) return;
    const p = this.player;
    const pos = p.fighter.group.position;
    let near = 0, engaged = 0;
    for (const e of this.enemies){
      if (!e.alive) continue;
      const d = e.fighter.group.position.distanceTo(pos);
      if (d < 20) near++;
      if (e.ai && e.ai.state === 'engage' && d < 34) engaged++;
    }
    const core = 1 - Math.max(0, this.objective.integrity) / 100;
    const hp = 1 - Math.max(0, p.hp) / 100;
    const intensity = Math.min(1, 0.22 + near * 0.13 + engaged * 0.16 + core * 0.45 + hp * 0.25);
    this.audio.setMusicIntensity(intensity);
    this.audio.setLowHealth(p.alive && p.hp < 32);

    // spatial footsteps for everyone but the player
    const cam = this.camera.position;
    for (const a of this.actors){
      if (a === p || !a.alive || a.bubbled) continue;
      const speed = a.moveSpeed || 0;
      if (speed < 0.9) continue;
      const d = a.fighter.group.position.distanceTo(cam);
      if (d > 26) continue;
      a.stepT = (a.stepT || 0) - dt;
      if (a.stepT <= 0){
        a.stepT = speed > 4 ? 0.3 : 0.4;
        const vol = Math.max(0.06, 0.55 * (1 - d / 26)) * (a.team === 'red' ? 1 : 0.8);
        this.audio.footstep(this.getPan(a.fighter.group.position), vol, speed > 4);
      }
    }
  }

  updateObjective(dt){
    const o = this.objective;
    let red = 0, blue = 0;
    for (const a of this.actors){
      if (!a.alive || a.bubbled) continue;
      if (a.fighter.group.position.distanceTo(o.pos) < o.radius){
        if (a.team === 'red') red++; else blue++;
      }
    }
    const drain = red * 2.2 - blue * 1.7;
    if (drain > 0 && !this._objWarn){
      this._objWarn = true;
      this.ui.showBanner('红队正在入侵核心', 'CORE UNDER ATTACK', true, 2.4);
      this.audio.alarm();
    } else if (drain <= 0){
      this._objWarn = false;
    }
    if (drain !== 0) o.integrity = THREE.MathUtils.clamp(o.integrity - drain * dt, 0, 100);

    // bubble visual reacts to integrity
    if (o.visual){
      o.visual.rotation.y += dt * 0.18;
      o.crystal.rotation.y += dt * 0.7;
      if (o.halo) o.halo.rotation.z += dt * 0.8;
      const t = 1 - o.integrity / 100;
      const col = new THREE.Color(0xffcf8a).lerp(new THREE.Color(0xff5f52), t);
      if (o.crystalMat){
        o.crystalMat.color.copy(col);
        o.crystalMat.emissive.copy(col).multiplyScalar(0.45);
      }
      if (o.crystal){
        const s = 1 + Math.sin(this.time * 2.2) * 0.03;
        o.crystal.scale.setScalar(s);
      }
      if (o.bubbleMesh && o.bubbleMat){
        o.bubbleMat.opacity = 0.16 + Math.sin(this.time * 1.7) * 0.03 + t * 0.08;
        o.bubbleMesh.scale.setScalar(1 + Math.sin(this.time * 1.5) * 0.012);
      }
    }

    if (o.integrity <= 0 && !this.pendingEnd){
      this.pendingEnd = true;
      if (!this._depotBlown){
        this._depotBlown = true;
        const c = o.pos.clone();
        this.effects.explosion(c.clone().setY(0.4), 'blue');
        this.effects.explosion(c.clone().add(new THREE.Vector3(0, 2.6, 0)), 'blue');
        this.effects.explosion(c.clone().add(new THREE.Vector3(0, 5.2, 0)), 'red');
        this.flashPulse = 1.2;
        this.rig.addShake(1);
        this.ui.flashDamage();
        this.audio.alarm();
        this.audio.explosion();
        this.audio.bubble();
        if (o.crystal) o.crystal.visible = false;
        if (o.halo) o.halo.visible = false;
        if (o.bubbleMesh) o.bubbleMesh.visible = false;
        if (o.visual){
          o.visual.traverse((v) => {
            if (v !== o.visual && v.material && v.material.emissive) v.material.emissive.setHex(0x000000);
          });
        }
      }
      this.ui.showBanner('泡泡核心被击破 · 任务失败', 'CORE DESTROYED', true, 3);
      setTimeout(() => this.endMatch(false), 2600);
    }
  }

  buildPickups(){
    const defs = [
      { type: 'ammo', x: 2.6, z: 18.6 },
      { type: 'ammo', x: -4.2, z: 5.4 },
      { type: 'ammo', x: 4.2, z: 9.0 },
      { type: 'ammo', x: 0, z: 12.2 },
      { type: 'sniper', x: -5.8, z: 12.2 },
      { type: 'smg', x: 5.8, z: 12.2 },
    ];
    for (const d of defs){
      const g = new THREE.Group();
      g.position.set(d.x, 0, d.z);
      const col = d.type === 'ammo' ? 0xd8b25a : d.type === 'sniper' ? 0xc9a45a : 0xa8703c;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.44, 0.64, 26),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);

      const visual = new THREE.Group();
      visual.position.y = 0.72;
      g.add(visual);
      const source = d.type === 'ammo'
        ? null
        : (this.player.fighter.guns && this.player.fighter.guns[d.type]);
      if (d.type === 'ammo'){
        // military ammo crate: olive body, stencilled lid, brass clasps
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x3f4735, roughness: 0.82, metalness: 0.28 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x22261d, roughness: 0.7, metalness: 0.5 });
        const crate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.3, 0.34), boxMat);
        crate.castShadow = crate.receiveShadow = true;
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.045, 0.36), trimMat);
        lid.position.y = 0.16;
        crate.add(lid);
        for (const sx of [-0.17, 0.17]){
          const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.02), trimMat);
          clasp.position.set(sx, 0.14, 0.175);
          crate.add(clasp);
        }
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0xb99b52, roughness: 0.6, metalness: 0.3 }));
        band.position.set(0, -0.02, 0.175);
        crate.add(band);
        visual.add(crate);
      } else if (source){
        // reuse the fully-detailed held weapon / tank so pickups match in-game fidelity
        const model = source.clone(true);
        model.visible = true;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const ctr = box.getCenter(new THREE.Vector3());
        model.position.sub(ctr);
        model.scale.setScalar(1.02);
        model.rotation.set(0, -0.45, 0.1);
        visual.add(model);
      }
      // soft extraction beam so the pickup reads from across the plaza
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.28, 1.65, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.028,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      beam.position.y = 0.9;
      g.add(beam);
      const ring2 = new THREE.Mesh(
        new THREE.RingGeometry(0.62, 0.69, 28),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      ring2.rotation.x = -Math.PI / 2;
      ring2.position.y = 0.02;
      g.add(ring2);
      this.scene.add(g);
      this.pickups.push({ ...d, group: g, visual, active: true, cd: 0 });
    }

    // bomb-site objective: a sealed bubble core at A site
    if (!this.objective.visual){
      const og = new THREE.Group();
      og.position.copy(this.objective.pos).setY(0.04);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0xcfe9ff, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.2,
        transmission: 0.55, thickness: 0.8, iridescence: 1.0, iridescenceIOR: 1.32,
        clearcoat: 1.0, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false,
      });
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.95, 44, 30), bubbleMat);
      bubble.position.y = 4.2;
      bubble.renderOrder = 2;

      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xc9a45a, emissive: 0x6b4a12, emissiveIntensity: 0.6, roughness: 0.32, metalness: 0.8,
      });
      const crystal = new THREE.Group();
      const caseBody = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.95, 18), coreMat);
      caseBody.position.set(0, 4.05, 0);
      const caseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.2, 18), coreMat);
      caseTop.position.set(0, 4.6, 0);
      const caseBand = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 24), coreMat);
      caseBand.rotation.x = Math.PI / 2;
      caseBand.position.set(0, 4.05, 0);
      crystal.add(caseBody, caseTop, caseBand);

      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.024, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 4.2;

      const ringMatA = new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const groundRing = new THREE.Mesh(new THREE.RingGeometry(2.1, 2.22, 64), ringMatA);
      groundRing.rotation.x = -Math.PI / 2;
      groundRing.position.y = 0.03;
      const groundRing2 = new THREE.Mesh(new THREE.RingGeometry(6.7, 6.85, 72), ringMatA);
      groundRing2.rotation.x = -Math.PI / 2;
      groundRing2.position.y = 0.028;

      const glow = new THREE.PointLight(0xffd08a, 5.5, 13, 2);
      glow.position.y = 3.9;
      og.add(bubble, crystal, halo, groundRing, groundRing2, glow);
      this.scene.add(og);
      this.objective.visual = og;
      this.objective.crystal = crystal;
      this.objective.crystalMat = coreMat;
      this.objective.halo = halo;
      this.objective.bubbleMesh = bubble;
      this.objective.bubbleMat = bubbleMat;
    }
  }

  resetPickups(){
    for (const it of this.pickups){
      it.active = true;
      it.cd = 0;
      it.group.visible = true;
    }
  }

  updatePickups(dt){
    const p = this.player.fighter.group.position;
    for (const it of this.pickups){
      it.cd = Math.max(0, it.cd - dt);
      if (!it.active && it.cd <= 0){
        it.active = true;
        it.group.visible = true;
      }
      if (!it.active) continue;
      it.visual.rotation.y += dt * 1.5;
      it.visual.position.y = 0.72 + Math.sin(this.time * 2.1 + it.x) * 0.08;
      if (p.distanceTo(it.group.position) < 1.6) this.collectPickup(it);
    }
  }

  collectPickup(it){
    if (!it.active) return;
    const p = this.player;
    if (it.type === 'ammo'){
      p.waterReserve = Math.min(5, (p.waterReserve || 0) + 1);
      p.water = 100;
      this.ui.showToast('弹药补给 · 弹匣 ×' + p.waterReserve, 1.6);
      this.audio.pump();
    } else if (it.type === 'sniper'){
      p.weapon = 'sniper';
      p.weaponTimer = 30;
      p.fighter.setWeapon('sniper');
      this.ui.showBanner('30 秒 · 单发高伤', 'M24 DMR ACQUIRED', false, 2.2);
      this.audio.ui();
    } else {
      p.weapon = 'smg';
      p.weaponTimer = 30;
      p.fighter.setWeapon('smg');
      this.ui.showBanner('30 秒 · 持续压制', 'MP5 SMG ACQUIRED', false, 2.2);
      this.audio.ui();
    }
    it.active = false;
    it.group.visible = false;
    it.cd = it.type === 'ammo' ? 14 : 30;
  }

  updateCinematicFX(dt){
    const cu = this.engine.cinematic.uniforms;
    this.damagePulse = Math.max(0, (this.damagePulse || 0) - dt * 2.4);
    cu.uDamage.value = this.player.bubbled ? 0.12 : this.damagePulse * 0.85;
    cu.uBubble.value = THREE.MathUtils.lerp(cu.uBubble.value, 0, 1 - Math.pow(0.002, dt));
    cu.uFlash.value = Math.max(0, (this.flashPulse || 0) - dt * 3.5);
    cu.uSlow.value = this.timeScale < 1 ? 1 : 0;
    cu.uSaturation.value = 1.1;

    // project the sun direction to screen space for the lens glow
    if (!this._sunTmp){
      this._sunTmp = new THREE.Vector3();
      this._sunDirTmp = new THREE.Vector3();
    }
    this._sunTmp.copy(this.env.sunDir).multiplyScalar(180).add(this.camera.position).project(this.camera);
    cu.uSunScreen.value.set(this._sunTmp.x * 0.5 + 0.5, this._sunTmp.y * 0.5 + 0.5);
    this.camera.getWorldDirection(this._sunDirTmp);
    cu.uSunVis.value = THREE.MathUtils.smoothstep(this._sunDirTmp.dot(this.env.sunDir), 0.1, 0.72);
  }

  /* ================= movement & queries ================= */
  moveActor(actor, dir, speed, dt, faceDir = null){
    const pos = actor.fighter.group.position;
    const d = dir.clone().setY(0);
    if (d.lengthSq() < 0.000001) return;
    d.normalize();
    pos.x += d.x * speed * dt;
    pos.z += d.z * speed * dt;
    pos.x = THREE.MathUtils.clamp(pos.x, -43, 43);
    pos.z = THREE.MathUtils.clamp(pos.z, -39, 39);
    const stepped = this.map.resolveCircle(pos, 0.38, pos.y, 1.62);
    if (stepped > 0 && pos.y < stepped) pos.y = stepped;
    const support = this.map.getSupportHeight(pos.x, pos.z, pos.y, 0.38, 0.5);
    if (pos.y < support) pos.y = support;
    if (pos.y > support) pos.y = Math.max(pos.y - 9 * dt, support);
    actor.moveSpeed = speed;
    const targetHeading = faceDir ? Math.atan2(faceDir.x, faceDir.z) : Math.atan2(d.x, d.z);
    actor.heading = lerpAngle(actor.heading, targetHeading, 1 - Math.pow(0.001, dt));
    actor.fighter.group.rotation.y = actor.heading;
  }

  separateActors(dt){
    const list = this.actors;
    for (let i = 0; i < list.length; i++){
      const a = list[i];
      if (!a.alive || a.bubbled) continue;
      for (let j = i + 1; j < list.length; j++){
        const b = list[j];
        if (!b.alive || b.bubbled) continue;
        const pa = a.fighter.group.position, pb = b.fighter.group.position;
        let dx = pa.x - pb.x, dz = pa.z - pb.z;
        let d2 = dx * dx + dz * dz;
        const min = 0.72;
        if (d2 < min * min && d2 > 0.00001){
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          dx /= d; dz /= d;
          pa.x += dx * push; pa.z += dz * push;
          pb.x -= dx * push; pb.z -= dz * push;
        }
      }
    }
  }

  canSee(a, b){
    const pa = a.fighter.group.position, pb = b.fighter.group.position;
    const from = new THREE.Vector3(pa.x, pa.y + 1.2, pa.z);
    const to = new THREE.Vector3(pb.x, pb.y + 1.2, pb.z);
    return this.map.hasLineOfSight(from, to);
  }

  pickTargetFor(actor, range){
    let best = null, bestD = range;
    for (const a of this.actors){
      if (a === actor || !a.alive || a.bubbled) continue;
      if (a.team === actor.team) continue;
      const d = a.fighter.group.position.distanceTo(actor.fighter.group.position);
      if (d < bestD && this.canSee(actor, a)){
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  nearestFoe(actor, range){
    let best = null, bestD = range;
    for (const a of this.actors){
      if (a === actor || !a.alive || a.bubbled) continue;
      if (a.team === actor.team) continue;
      const d = a.fighter.group.position.distanceTo(actor.fighter.group.position);
      if (d < bestD){ bestD = d; best = a; }
    }
    return best;
  }

  say(text, name = 'NOVA', duration = 3){
    this.ui.showSubtitle(text, name, duration);
    this.audio.ui(true);
  }

  addScore(actor, amount){
    if (!actor) return;
    const v = amount;
    actor.stats.score += v;
    if (actor.team === 'blue') this.scoreBlue += v;
    else this.scoreRed += v;
  }

  getPan(pos){
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const dir = pos.clone().sub(this.camera.position).normalize();
    return THREE.MathUtils.clamp(dir.dot(right), -1, 1) * 0.7;
  }

  spawnFloater(worldPos, text, cls = ''){
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1 || v.z < -1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    this.ui.addFloater(x, y, text, cls);
  }

  minimapState(){
    const p = this.player.fighter.group.position;
    return {
      playerBlip: { x: p.x, z: p.z, angle: this.player.heading + Math.PI },
      allyBlip: { x: this.ally.fighter.group.position.x, z: this.ally.fighter.group.position.z, bubbled: this.ally.bubbled },
      enemyBlips: this.enemies.map(e => {
        const ep = e.fighter.group.position;
        const d = ep.distanceTo(p);
        return { x: ep.x, z: ep.z, bubbled: e.bubbled, visible: e.alive && (e.bubbled || d < 32) };
      }),
    };
  }

  updateHUDFrame(){
    const p = this.player;
    const a = this.ally;
    const interact = computeInteractTarget(this);
    const waveSize = this.waveSizes[this.wave] || 0;
    const waveLeft = this.enemies.slice(0, waveSize).filter((e) => e.alive).length;
    let objective = '守住 <b>A 点</b> · 击退红队 · 保护泡泡核心';
    if (p.bubbled) objective = '你被压制了 · 等待重新部署';
    else if (a.bubbled) objective = 'NOVA 失去战斗力 · 掩护她重新部署';
    else if (interact && interact.actor.team === 'red') objective = '按 <b>F</b> 近身击倒 · +' + Math.round(45 * this.comboMult());
    else if (this.objective.integrity < 99) objective = '红队正在入侵核心 · 立即回防 <b>A 点</b>';
    const weaponName = p.weapon === 'sniper' ? 'M24 <b>«DMR»</b>'
      : p.weapon === 'smg' ? 'MP5 <b>«SMG»</b>'
      : 'M4A1 <b>«CARBINE»</b>';
    const state = {
      time: this.matchTime,
      scoreBlue: this.scoreBlue,
      scoreRed: this.scoreRed,
      heading: this.rig ? this.rig.yaw : 0,
      playerPos: p.fighter.group.position,
      objectivePos: this.objective.pos,
      objective,
      objectiveIntegrity: this.objective.integrity,
      wave: this.wave,
      waveLeft,
      weaponName,
      playerName: ({ player: 'ECHO', sunny: 'VIPER', mint: 'NOVA', berry: 'SABLE', rocky: 'RAZOR' })[p.fighter.kind] || 'ECHO',
      player: {
        wet: p.wet, hp: p.hp, bubbled: p.bubbled, score: p.stats.score,
        stateText: p.bubbled ? '泡封中' : (p.hp < 40 ? '重伤' : '作战中'),
        stateClass: p.bubbled ? 'bad' : p.hp < 40 ? 'warn' : '',
      },
      ally: {
        wet: a.wet, hp: a.hp, bubbled: a.bubbled, score: a.stats.score,
        stateText: a.bubbled ? '泡封中' : a.state === 'engage' ? '交火中' : a.state === 'rescue' ? '救援中' : a.state === 'retreat' ? '撤退中' : '跟随中',
        stateClass: a.bubbled ? 'bad' : a.state === 'engage' ? 'warn' : a.state === 'rescue' ? 'good' : '',
      },
      water: p.water ?? 100,
      reserve: p.waterReserve ?? 0,
      pumpCooldown: p.pumpCd ?? 0,
      aiming: this.aimBlend > 0.5,
      combo: this.combo,
      comboMult: this.comboMult(),
      crosshairBubble: this.crosshairOnBubble(),
      interact: interact ? interact.label : null,
      rescueRemaining: Math.max(0, 12 - (p.bubbleTimer || 0)),
      rescueProgress: Math.max(0, 1 - (p.bubbleTimer || 0) / 12),
      matchElapsed: this.matchElapsed,
    };
    this.ui.updateHUD(state);
  }

  compositeState(){ /* hook for QA */ }

  comboMult(){
    return 1 + Math.min(20, this.combo) * 0.05;
  }

  // shooting delegates used by the AI layer
  enemyShoot(actor, target){ return enemyShoot(this, actor, target); }
  allyShoot(actor, target){ return allyShoot(this, actor, target); }
  enemyShootBubble(actor, bubble){ return enemyShootBubble(this, actor, bubble); }
  allyShootBubble(actor, bubble){ return allyShootBubble(this, actor, bubble); }
  enemyKick(actor, victim){ return enemyKick(this, actor, victim); }

  crosshairOnBubble(){
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    for (const e of this.enemies){
      if (!e.alive || !e.bubbled) continue;
      const c = e.fighter.group.position.clone().add(new THREE.Vector3(0, 1.35, 0));
      const to = c.clone().sub(this.camera.position);
      const d = to.length();
      const ang = to.normalize().angleTo(dir);
      if (ang < Math.atan(1.3 / d)) return true;
    }
    return false;
  }

  updateHint(dt){
    if (this.hintTimer > 0){
      this.hintTimer -= dt;
    }
  }
}

/* ================= helpers ================= */
function resetActor(actor, spawn, heading){
  const f = actor.fighter;
  actor.alive = true;
  actor.bubbled = false;
  actor.wet = 0;
  actor.hp = 100;
  actor.invuln = 1.2;
  actor.respawnTimer = 0;
  actor.bubbleTimer = 0;
  actor.rescueProgress = 0;
  actor.struggle = 0;
  actor.fly = null;
  actor.bubbleInflate = 0;
  actor.heading = heading;
  actor.vy = 0;
  actor.grounded = true;
  actor.moveSpeed = 0;
  actor.water = 100;
  actor.pumpCd = 0;
  actor.fireCooldown = 0;
  actor.aimBlend = 0;
  actor.dryT = 0;
  actor.lastStep = 0;
  f.group.position.copy(spawn);
  f.group.position.y = 0;
  f.group.rotation.y = heading;
  f.group.visible = true;
  f.group.scale.setScalar(1);
  f.root.position.set(0, 0, 0);
  f.root.rotation.set(0, 0, 0);
  f.setBubbled(false);
  f.resetPose();
  f.bubble.visible = false;
  f.bubbleInner.visible = false;
  f.setWetness(0);
  f.recoil = 0;
  f.kickT = 0;
  if (actor.ai){
    actor.ai.state = 'patrol';
    actor.ai.target = null;
    actor.ai.shootCd = 1 + Math.random() * 1.8;
    actor.ai.burst = 0;
    actor.ai.patrol = null;
    actor.ai.patrolT = 0;
    actor.ai.kickT = 0;
    actor.ai.rescueT = 0;
    actor.ai.sayCd = 8 + Math.random() * 8;
  }
}

function lerpAngle(a, b, t){
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function frame(){
  return new Promise((r) => requestAnimationFrame(() => r()));
}
function wait(ms){
  return new Promise((r) => setTimeout(r, ms));
}
function formatTime(sec){
  sec = Math.max(0, Math.floor(sec));
  return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
}

export { resetActor };
