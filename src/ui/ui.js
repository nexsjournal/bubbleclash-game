/* ============================================================
   UI — screens, HUD, minimap, feedback
   ============================================================ */
import { OperatorPreview } from './operatorPreview.js';
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(map){
    this.map = map;
    this.actionHandler = null;
    this.refs = {
      screens: {
        loading: $('screen-loading'),
        menu: $('screen-menu'),
        pause: $('screen-pause'),
        results: $('screen-results'),
      },
      loading: {
        fill: $('load-bar-fill'), pct: $('load-pct'), assets: $('load-assets'),
        tip: $('load-tip'), count: $('load-count'),
      },
      hud: $('hud'),
      hm: {
        blue: $('hm-blue'), red: $('hm-red'), timer: $('hm-timer'),
        core: $('hm-core'), coreFill: $('hm-corefill'), corePct: $('hm-corepct'),
        hp: $('hm-hp'), hpFill: $('hm-hpfill'), objective: $('hm-objective'),
        weapon: $('hm-weapon'), ammo: $('hm-ammo'), reserve: $('hm-reserve'), reload: $('hm-reload'),
      },
      scores: { blue: $('score-blue'), red: $('score-red') },
      timer: $('match-timer'),
      round: document.querySelector('.mc-round'),
      objectiveBar: $('boss-bar'), objectiveFill: $('bb-fill'), objectiveName: document.querySelector('.bb-name'),
      objective: $('objective-text'),
      weaponName: document.querySelector('.wp-name'),
      squad: {
        playerWet: $('sc-player-wet'), playerHp: $('sc-player-hp'),
        allyWet: $('sc-ally-wet'), allyHp: $('sc-ally-hp'),
        playerState: $('sc-player-state'), allyState: $('sc-ally-state'),
        playerScore: $('sc-player-score'), allyScore: $('sc-ally-score'),
      },
      water: { liquid: $('tank-liquid'), value: $('tank-value'), status: $('weapon-status'), pump: $('tank-pump'), dot: document.querySelector('.wp-status .dot') },
      pressure: { fill: $('pressure-fill'), val: $('pressure-val') },
      bubbleBuild: $('bubble-build'), bbWarn: $('bb-warn'), ads: $('ads-overlay'),
      abilities: { aim: $('ab-aim'), wet: $('ab-wet'), wetFill: $('ab-wet-fill'), wetVal: $('ab-wet-val') },
      telemetry: { fps: $('tel-fps'), bar: $('tel-fps-bar'), hpP: $('rr-hp-player'), hpA: $('rr-hp-ally') },
      vitals: { wet: $('wet-value'), hp: $('hp-value'), state: $('vitals-state'), ringWet: $('vr-wet'), ringHp: $('vr-hp') },
      combo: { panel: $('combo-panel'), num: $('combo-num'), mult: $('combo-mult') },
      crosshair: $('crosshair'), chHit: $('ch-hit'), chBubble: $('ch-bubble'),
      interact: $('interact-prompt'), interactText: $('interact-text'),
      banner: $('banner'), bannerSub: $('banner-sub'), bannerMain: $('banner-main'),
      tutorial: $('tutorial'), subtitle: $('subtitle'), floaters: $('floaters'),
      damageDirs: $('damage-dirs'), damageFlash: $('damage-flash'),
      killfeed: $('killfeed'), minimap: $('minimap'),
      bubbleScreen: $('bubble-screen'), bubbleStatus: $('bubble-status'),
      rescueTimer: $('rescue-timer'), rescueFill: $('rescue-bar-fill'),
      countdown: $('countdown'), countdownNum: $('countdown-num'), countdownSub: $('countdown-sub'),
      toast: $('hint-toast'), letterbox: $('letterbox'),
      wipe: $('bubble-wipe'),
      pause: { score: $('pause-score'), elim: $('pause-elim'), rescue: $('pause-rescue') },
      menuQuality: $('menu-quality-label'),
      menuQualitySub: null,
      controlsModal: $('controls-modal'),
      results: {
        kicker: $('res-kicker'), title: $('res-title'), sub: $('res-sub'),
        pScore: $('rs-p-score'), pBubble: $('rs-p-bubble'), pPop: $('rs-p-pop'), pRescue: $('rs-p-rescue'), pAcc: $('rs-p-acc'),
        aScore: $('rs-a-score'), aBubble: $('rs-a-bubble'), aPop: $('rs-a-pop'), aRescue: $('rs-a-rescue'), aAcc: $('rs-a-acc'),
        eScore: $('rs-e-score'), eBubble: $('rs-e-bubble'), ePop: $('rs-e-pop'), eRescue: $('rs-e-rescue'),
        mvpName: $('mvp-name'), mvpCombo: $('mvp-combo'), mvpBubble: $('mvp-bubble'),
        duration: $('res-duration'), score: $('res-score'), combo: $('res-combo'),
        acc: $('res-acc'), taken: $('res-taken'), mvpAvatar: $('mvp-avatar'),
      },
      stamina: { fill: $('stamina-fill'), item: $('item-count') },
      compassTrack: $('compass-track'), compassObj: $('compass-obj'),
      playerName: $('sc-player-name'),
      overlays: { characters: $('screen-characters'), settings: $('screen-settings') },
      cs: {
        list: $('cs-list'), face: $('cs-bigface'), name: $('cs-name'), role: $('cs-role'),
        power: $('cs-power'), speed: $('cs-speed'), defense: $('cs-defense'),
      },
      settings: {
        volume: $('set-volume'), volumeVal: $('set-volume-val'),
        music: $('set-music'), musicVal: $('set-music-val'),
        sfx: $('set-sfx'), sfxVal: $('set-sfx-val'),
        voice: $('set-voice'), voiceVal: $('set-voice-val'),
        sens: $('set-sens'), sensVal: $('set-sens-val'),
        invert: $('set-invert'), fullscreen: $('set-fullscreen'),
      },
    };
    this.selectedSkin = 'player';
    this.characterOpen = false;
    this.settingsOpen = false;
    this.preview = null;
    this._origVolume = 70;
    this.activeScreen = 'loading';
    this.bannerTimer = 0;
    this.subtitleTimer = 0;
    this.toastTimer = 0;
    this.feedItems = [];
    this.tutorialTimer = 0;
    this.countdownTimer = 0;
    this.minimapBase = null;
    this.bubbleOn = false;
    this.lastMinimap = 0;
    this.tipIndex = 0;
    this.tips = [
      '红队会从长 A、中门和猫道三路推进。优先卡住长 A。',
      '弹匣打空后按 R 换弹；备用弹匣有限，记得捡补给箱。',
      '连续命中会提升连击倍率，击杀与近身击倒得分都会翻倍。',
      '利用木箱、矮墙和沙袋做掩体，别在开阔地久留。',
      '被击倒后会在出生点重新部署，注意别让红队趁机占点。',
      '靠近敌人按 F 挥拳，可以直接近身击倒。',
      'AI 队友 NOVA 会跟着你。守住 A 点的泡泡核心。',
    ];
    this.tipTimer = setInterval(() => {
      if (this.activeScreen !== 'loading') return;
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      this.refs.loading.tip.textContent = this.tips[this.tipIndex];
    }, 4200);

    this.bindUI();
    this.buildMinimapBase();
    this.buildCompass();
    this.startAmbientTimer = null;
  }

  buildCompass(){
    const track = this.refs.compassTrack;
    if (!track) return;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const pxPerDeg = 2.4;
    const cycle = 360 * pxPerDeg;
    this.cpPxPerDeg = pxPerDeg;
    this.cpCycle = cycle;
    let html = '';
    for (let c = 0; c < 3; c++){
      for (let d = 0; d < 360; d += 15){
        const x = c * cycle + d * pxPerDeg;
        const major = d % 45 === 0;
        html += `<span class="cp-tick${major ? ' major' : ''}" style="left:${x}px"></span>`;
        if (major) html += `<span class="cp-label ${d % 90 === 0 ? 'major' : ''}" style="left:${x}px">${dirs[d / 45]}</span>`;
      }
    }
    track.innerHTML = html;
    track.style.width = cycle * 3 + 'px';
  }

  updateCompass(state){
    const track = this.refs.compassTrack;
    if (!track || !state) return;
    const px = this.cpPxPerDeg || 2.4;
    let deg = (-(state.heading || 0) * 180 / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const half = (track.parentElement ? track.parentElement.clientWidth : 460) / 2;
    const x = -deg * px + half - this.cpCycle;
    track.style.transform = `translateX(${x.toFixed(1)}px)`;
    const obj = this.refs.compassObj;
    if (obj && state.objectivePos && state.playerPos){
      const dx = state.objectivePos.x - state.playerPos.x;
      const dz = state.objectivePos.z - state.playerPos.z;
      let bearing = Math.atan2(dx, -dz) * 180 / Math.PI;
      let rel = bearing - deg;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      if (Math.abs(rel) < 66){
        obj.style.opacity = '1';
        obj.style.transform = `translateX(${(rel * px).toFixed(1)}px) rotate(45deg)`;
      } else {
        obj.style.opacity = '0';
      }
    }
  }

  bindUI(){
    document.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        const action = el.getAttribute('data-action');
        if (action === 'controls'){
          this.refs.controlsModal.classList.add('open');
          return;
        }
        if (action === 'close-controls'){
          this.refs.controlsModal.classList.remove('open');
          return;
        }
        if (action === 'characters'){ this.openCharacters(); return; }
        if (action === 'settings'){ this.openSettings(); return; }
        if (action === 'close-characters'){ this.closeOverlay('characters'); return; }
        if (action === 'close-settings'){ this.closeOverlay('settings'); return; }
        if (action === 'confirm-characters'){ this.confirmCharacter(); return; }
        if (action === 'apply-settings'){ this.applySettings(true); this.closeOverlay('settings'); return; }
        if (action === 'quit'){ this.showToast('CHANNEL LOCKED · 返回部署中继续行动'); return; }
        if (this.actionHandler) this.actionHandler(action);
      });
    });
    document.querySelectorAll('.ps-seg button[data-q]').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.ps-seg button[data-q]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (this.actionHandler) this.actionHandler('quality:' + b.dataset.q);
      });
    });
    const sens = $('sens-slider');
    const sensVal = $('sens-val');
    if (sens) sens.addEventListener('input', () => {
      const v = Number(sens.value) / 100;
      sensVal.textContent = v.toFixed(2);
      if (this.actionHandler) this.actionHandler('sensitivity:' + v);
    });
    const vol = $('vol-slider');
    const volVal = $('vol-val');
    if (vol) vol.addEventListener('input', () => {
      volVal.textContent = vol.value;
      if (this.actionHandler) this.actionHandler('volume:' + (Number(vol.value) / 100));
    });
    // settings controls
    const S = this.refs.settings;
    const bindRange = (el, valEl, fmt, onInput) => {
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (valEl) valEl.textContent = fmt(v);
        if (onInput) onInput(v);
      });
    };
    bindRange(S.volume, S.volumeVal, (v) => v + '%', (v) => {
      const g = window.__bubbleclash; if (g && g.audio) g.audio.setVolume(v / 100);
    });
    bindRange(S.music, S.musicVal, (v) => v + '%', (v) => {
      const g = window.__bubbleclash; if (g && g.audio) g.audio.setMusicVolume(v / 100);
    });
    bindRange(S.sfx, S.sfxVal, (v) => v + '%', (v) => {
      const g = window.__bubbleclash; if (g && g.audio) g.audio.setSfxVolume(v / 100);
    });
    bindRange(S.voice, S.voiceVal, (v) => v + '%');
    bindRange(S.sens, S.sensVal, (v) => (v / 100).toFixed(2), (v) => {
      const g = window.__bubbleclash; if (g && g.rig) g.rig.sensitivity = 0.0022 * (v / 100);
    });
    document.querySelectorAll('.seg-pills button[data-q]').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg-pills button[data-q]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (this.actionHandler) this.actionHandler('quality:' + b.dataset.q);
      });
    });
    if (S.invert) S.invert.addEventListener('click', () => {
      const on = !S.invert.classList.contains('on');
      S.invert.classList.toggle('on', on);
      const g = window.__bubbleclash; if (g && g.rig) g.rig.invertY = on;
    });
    if (S.fullscreen) S.fullscreen.addEventListener('click', () => {
      const on = !S.fullscreen.classList.contains('on');
      S.fullscreen.classList.toggle('on', on);
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!on && document.fullscreenElement) document.exitFullscreen();
      } catch (e) { /* ignore */ }
    });
    // chinese fallback note
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.refs.controlsModal.classList.contains('open')){
        this.refs.controlsModal.classList.remove('open');
      }
    });
  }

  setActionHandler(fn){ this.actionHandler = fn; }

  /* ---------------- screens ---------------- */
  showScreen(name){
    for (const [key, el] of Object.entries(this.refs.screens)){
      if (!el) continue;
      const on = key === name;
      el.classList.toggle('active', on);
    }
    this.activeScreen = name || null;
    const playing = name === null;
    this.refs.hud.classList.toggle('hidden', !playing);
    this.refs.letterbox.classList.toggle('on', name === null ? this._letterbox : false);
  }

  setHUDVisible(v){ this.refs.hud.classList.toggle('hidden', !v); }
  setLetterbox(on){ this._letterbox = on; this.refs.letterbox.classList.toggle('on', on); }
  bubbleWipe(){
    const w = this.refs.wipe;
    if (!w) return;
    w.classList.remove('on');
    void w.offsetWidth;
    w.classList.add('on');
    clearTimeout(this._wipeT);
    this._wipeT = setTimeout(() => w.classList.remove('on'), 1250);
  }

  setLoading(pct, label){
    const p = Math.round(pct * 100);
    this.refs.loading.fill.style.width = p + '%';
    this.refs.loading.pct.textContent = p;
    if (label){
      const line = document.createElement('div');
      line.className = 'la-line';
      line.textContent = '> ' + label + '  ·  OK';
      this.refs.loading.assets.appendChild(line);
      while (this.refs.loading.assets.children.length > 2) this.refs.loading.assets.removeChild(this.refs.loading.assets.firstChild);
      this.refs.loading.count.textContent = String(Math.min(42, Math.round(pct * 42))).padStart(3, '0');
    }
  }

  setMenuQuality(q){
    if (this.refs.menuQuality) this.refs.menuQuality.textContent = 'GFX · ' + (q === 'ultra' ? 'ULTRA' : 'HIGH');
  }

  setAudioUnlocked(on){
    const el = document.getElementById('audio-unlock');
    if (el) el.classList.toggle('armed', !!on);
  }

  /* ---------------- character select & settings ---------------- */
  skins(){
    return [
      { key: 'player', name: 'ECHO', cn: '回声', mono: 'ECHO', role: 'ASSAULT · 突击手', c1: '#9fe8ff', c2: '#1d5f86', power: 3, speed: 3, defense: 3,
        file: 'FILE 01', weapon: 'M4A1 CARBINE', weaponSub: '30 / 90 · 5.56 毫米',
        bio: '回声小组的突击核心，习惯在中门与猫道之间快速换位，用稳定火力替队友打开通道。',
        trait: '稳定压制', traitDesc: '移动射击散布更低，适合边推边打。',
        notes: ['长 A 卡点优先，别在开阔地久留。', '弹匣 30 发，打空按 R 换弹。', '靠近敌人按 F 挥拳可直接击倒。'] },
      { key: 'sunny', name: 'VIPER', cn: '毒蛇', mono: 'VPR', role: 'BREACHER · 破阵手', c1: '#ffe6a8', c2: '#8a5c12', power: 4, speed: 3, defense: 2,
        file: 'FILE 02', weapon: 'M4A1 · CQ 配置', weaponSub: '短管近战 · 高射速',
        bio: '爆破组出身的破阵手，负责用火力撕开 A 点正面，习惯第一个撞进掩体群。',
        trait: '正面突破', traitDesc: '冲刺启动更快，近距离交火容错更高。',
        notes: ['带头压长 A，用身体替队友开路。', '转角先预瞄，再闪身出去。', '残血时先退回掩体等回血。'] },
      { key: 'mint', name: 'NOVA', cn: '新星', mono: 'NVA', role: 'SUPPORT · 支援手', c1: '#c8fff0', c2: '#1c6b56', power: 2, speed: 3, defense: 4,
        file: 'FILE 03', weapon: 'M4A1 CARBINE', weaponSub: '30 / 90 · 稳定型',
        bio: '支援位，负责看住猫道侧翼并在队友倒下时补位，是全队最可靠的后盾。',
        trait: '侧翼支援', traitDesc: '受击后回复更快，更适合驻守核心。',
        notes: ['猫道和 A 点长椅是天然卡点。', '核心告急时优先回防，不要追人。', '队友被泡泡困住时射击泡泡救援。'] },
      { key: 'berry', name: 'SABLE', cn: '黑貂', mono: 'SBL', role: 'SKIRMISHER · 游击手', c1: '#ffd3e4', c2: '#6b2a44', power: 3, speed: 4, defense: 2,
        file: 'FILE 04', weapon: 'M4A1 · LIGHT', weaponSub: '轻量化 · 高机动',
        bio: '游击手，擅长绕后和快速转移，靠机动性把红队的推进阵型拉扯开。',
        trait: '机动游走', traitDesc: '横移与转向更快，适合打一枪换一个点。',
        notes: ['别站桩对枪，打完一轮立刻换位。', '利用木箱和沙袋切角进攻。', '绕后优先打掉红队的后排。'] },
      { key: 'rocky', name: 'RAZOR', cn: '剃刀', mono: 'RZR', role: 'TANK · 重装手', c1: '#e6eef5', c2: '#3d4d5a', power: 3, speed: 2, defense: 4,
        file: 'FILE 05', weapon: 'M4A1 · HEAVY', weaponSub: '重枪管 · 稳定压制',
        bio: '重装手，负责站在最前面吃伤害，替队伍把核心周围的火力全部接下来。',
        trait: '重装驻守', traitDesc: '护甲更厚，站在核心旁能扛住更多火力。',
        notes: ['站在核心前沿，吸引红队火力。', '不要追远，守住 A 点台阶即可。', '低血量时退到箱子后等队友补位。'] },
    ];
  }

  renderDossier(sk){
    if (!sk) return;
    const $id = (id) => document.getElementById(id);
    const set = (id, txt) => { const el = $id(id); if (el) el.textContent = txt; };
    set('cd-file', sk.file);
    set('cd-name', sk.name);
    set('cd-cn', sk.cn);
    set('cd-role', sk.role);
    set('cd-bio', sk.bio);
    set('cd-weapon', sk.weapon || 'M4A1 CARBINE');
    set('cd-weapon-sub', sk.weaponSub || '30 / 90 · 5.56 毫米');
    set('cd-trait', sk.trait);
    set('cd-trait-desc', sk.traitDesc);
    const notes = $id('cd-notes');
    if (notes){
      notes.innerHTML = (sk.notes || []).map((n) => `<li>${n}</li>`).join('');
    }
    const pct = (n) => Math.max(18, Math.round(n / 4 * 100)) + '%';
    const bar = (id, n) => { const el = $id(id); if (el) el.style.width = pct(n); };
    bar('cd-bar-pow', sk.power);
    bar('cd-bar-spd', sk.speed);
    bar('cd-bar-def', sk.defense);
    set('cd-pow', String(sk.power).padStart(2, '0'));
    set('cd-spd', String(sk.speed).padStart(2, '0'));
    set('cd-def', String(sk.defense).padStart(2, '0'));
  }

  openCharacters(){
    const list = this.refs.cs.list;
    if (list && !list.children.length){
      for (const sk of this.skins()){
        const card = document.createElement('button');
        card.className = 'cs-card';
        card.dataset.skin = sk.key;
        card.innerHTML = `<span class="cc-face" style="background:
            repeating-linear-gradient(180deg, rgba(255,255,255,.05) 0 1px, transparent 1px 4px),
            radial-gradient(circle at 50% 30%, ${sk.c1}, ${sk.c2} 78%)">
            <span class="cc-mono">${sk.mono}</span>
          </span><span class="cc-name">${sk.name}</span><span class="cc-role">${sk.cn} · ${sk.role.split(' · ')[0]}</span><span class="cc-check">✓</span>`;
        card.addEventListener('click', () => this.selectSkin(sk.key));
        list.appendChild(card);
      }
    }
    this.selectSkin(this.selectedSkin || 'player');
    this.openOverlay('characters');
    requestAnimationFrame(() => this.ensurePreview());
  }

  ensurePreview(){
    const canvas = document.getElementById('cs-preview');
    const g = window.__bubbleclash;
    if (!canvas || !g || !g.assets) return;
    if (!this.preview) this.preview = new OperatorPreview(canvas, g.assets);
    this.preview.setSkin(this.selectedSkin || 'player');
    this.preview.start();
  }

  selectSkin(key){
    this.selectedSkin = key;
    const sk = this.skins().find(s => s.key === key) || this.skins()[0];
    const f = this.refs.cs.face;
    if (f){
      f.dataset.skin = key;
      f.style.background = `repeating-linear-gradient(180deg, rgba(95,240,255,.06) 0 1px, transparent 1px 5px),
        radial-gradient(80% 70% at 50% 18%, ${sk.c1}55, transparent 62%),
        linear-gradient(180deg, #0a151d, #050a0f)`;
      const mono = f.querySelector('.cs-mono');
      if (mono) mono.textContent = sk.mono;
    }
    if (this.refs.cs.name) this.refs.cs.name.textContent = sk.name;
    if (this.refs.cs.role) this.refs.cs.role.textContent = sk.role;
    const pips = (el, n) => { if (!el) return; [...el.children].forEach((i, idx) => i.classList.toggle('on', idx < n)); };
    pips(this.refs.cs.power, sk.power);
    pips(this.refs.cs.speed, sk.speed);
    pips(this.refs.cs.defense, sk.defense);
    this.renderDossier(sk);
    if (this.refs.cs.list) [...this.refs.cs.list.children].forEach(c => c.classList.toggle('sel', c.dataset.skin === key));
    if (this.preview) this.preview.setSkin(key);
  }

  confirmCharacter(){
    const g = window.__bubbleclash;
    if (g && g.setPlayerSkin) g.setPlayerSkin(this.selectedSkin);
    const sk = this.skins().find(s => s.key === this.selectedSkin);
    if (sk){
      const av = document.getElementById('vitals-avatar');
      if (av){
        av.style.setProperty('--skin-a', sk.c1);
        av.style.setProperty('--skin-b', sk.c2);
      }
    }
    if (sk) this.showToast('OPERATOR LOCKED · ' + sk.name, 2);
    this.closeOverlay('characters');
  }

  openSettings(){
    const S = this.refs.settings;
    if (S.volume){
      const g = window.__bubbleclash;
      const v = Math.round((g && g.audio ? g.audio.volume : 0.7) * 100);
      S.volume.value = v;
      if (S.volumeVal) S.volumeVal.textContent = v + '%';
    }
    this.openOverlay('settings');
  }

  applySettings(){
    const S = this.refs.settings;
    const g = window.__bubbleclash;
    if (S.volume && g && g.audio) g.audio.setVolume(Number(S.volume.value) / 100);
    if (S.music && g && g.audio) g.audio.setMusicVolume(Number(S.music.value) / 100);
    if (S.sfx && g && g.audio) g.audio.setSfxVolume(Number(S.sfx.value) / 100);
    if (S.sens && g && g.rig) g.rig.sensitivity = 0.0022 * (Number(S.sens.value) / 100);
    this.saveSettings();
    this.showToast('设置已保存', 1.6);
  }

  saveSettings(){
    try {
      const S = this.refs.settings;
      localStorage.setItem('bubbleclash.settings', JSON.stringify({
        volume: S.volume ? S.volume.value : 70,
        music: S.music ? S.music.value : 60,
        sfx: S.sfx ? S.sfx.value : 85,
        voice: S.voice ? S.voice.value : 50,
        sens: S.sens ? S.sens.value : 100,
        invert: S.invert ? S.invert.classList.contains('on') : false,
      }));
    } catch (e) { /* ignore */ }
  }

  openOverlay(name){
    const el = this.refs.overlays[name];
    if (!el) return;
    el.classList.add('open');
    if (name === 'characters') this.characterOpen = true;
    if (name === 'settings') this.settingsOpen = true;
    const g = window.__bubbleclash;
    if (g && g.input) g.input.releaseLock();
  }

  closeOverlay(name){
    const el = this.refs.overlays[name];
    if (!el) return;
    el.classList.remove('open');
    if (name === 'characters') this.characterOpen = false;
    if (name === 'characters' && this.preview) this.preview.stop();
    if (name === 'settings') this.settingsOpen = false;
  }

  setPauseStats(s){
    this.refs.pause.score.textContent = s.score;
    this.refs.pause.elim.textContent = s.pops;
    this.refs.pause.rescue.textContent = s.melee ?? 0;
  }

  /* ---------------- HUD ---------------- */
  updateHUD(state){
    const r = this.refs;
    this.updateCompass(state);
    r.scores.blue.textContent = Math.floor(state.scoreBlue);
    r.scores.red.textContent = Math.floor(state.scoreRed);
    r.timer.textContent = formatTime(state.time);
    r.timer.classList.toggle('danger', state.time <= 30);
    if (state.objective) r.objective.innerHTML = state.objective;

    // minimal combat HUD (reference layout)
    const hm = r.hm;
    if (hm && hm.hp){
      hm.blue.textContent = String(Math.floor(state.scoreBlue));
      hm.red.textContent = String(Math.floor(state.scoreRed));
      hm.timer.textContent = formatTime(state.time);
      hm.timer.classList.toggle('danger', state.time <= 30);
      hm.hp.textContent = String(Math.round(state.player.hp));
      hm.hpFill.style.width = Math.max(0, Math.min(100, state.player.hp)) + '%';
      hm.hpFill.style.background = state.player.hp < 35 ? '#d9614f' : '#d9e3d2';
      const rounds = Math.max(0, Math.round((state.water ?? 0) * 0.3));
      hm.ammo.textContent = String(rounds);
      hm.reserve.textContent = String(state.reserve ?? 0);
      hm.ammo.style.color = rounds <= 3 ? '#d9614f' : '';
      const rawName = (state.weaponName || 'M4A1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      hm.weapon.textContent = rawName.toUpperCase();
      const integ = state.objectiveIntegrity ?? 100;
      const showCore = integ < 99.5;
      hm.core.classList.toggle('hidden', !showCore);
      hm.coreFill.style.width = Math.max(0, Math.min(100, integ)) + '%';
      hm.corePct.textContent = Math.round(Math.max(0, integ)) + '%';
      hm.coreFill.style.background = integ < 55 ? '#d9614f' : '#e2c68a';
      hm.objective.textContent = state.player.hp < 35
        ? '重伤 · 寻找掩体'
        : showCore
          ? '核心告急 · 立即回防 A 点'
          : '守住 A 点 · 保护泡泡核心';
      if (state.pumpCooldown > 0){
        hm.reload.textContent = '换弹中 ' + state.pumpCooldown.toFixed(1) + 's';
        hm.reload.classList.add('cool');
      } else if ((state.reserve ?? 0) <= 0){
        hm.reload.textContent = '备用弹药耗尽';
        hm.reload.classList.add('cool');
      } else {
        hm.reload.textContent = 'R 换弹 · 备用 ×' + (state.reserve ?? 0);
        hm.reload.classList.remove('cool');
      }
    }

    const p = state.player;
    r.vitals.wet.textContent = String(Math.floor(p.score));
    r.vitals.hp.textContent = String(Math.round(p.hp));
    r.vitals.ringWet.style.strokeDashoffset = String(327 * (1 - p.hp / 100));
    r.vitals.ringHp.style.strokeDashoffset = String(283 * (1 - p.hp / 100));
    r.vitals.state.textContent = p.hp < 30 ? 'CRITICAL · 重伤' : p.hp < 65 ? 'WOUNDED · 负伤' : 'OPERATIONAL · 作战中';
    r.vitals.state.className = 'vr-state' + (p.hp < 30 ? ' danger' : '');

    r.squad.playerWet.style.width = Math.min(100, p.hp) + '%';
    r.squad.playerHp.style.width = Math.min(100, p.hp) + '%';
    r.squad.playerState.textContent = p.stateText;
    r.squad.playerState.className = 'state ' + (p.stateClass || '');
    r.squad.playerScore.textContent = Math.floor(p.score) + ' 分';

    const a = state.ally;
    r.squad.allyWet.style.width = Math.min(100, a.wet) + '%';
    r.squad.allyHp.style.width = Math.min(100, a.hp) + '%';
    r.squad.allyState.textContent = a.stateText;
    r.squad.allyState.className = 'state ' + (a.stateClass || '');
    r.squad.allyScore.textContent = Math.floor(a.score) + ' 分';

    const water = state.water;
    r.water.liquid.style.width = Math.max(0, Math.min(100, water)) + '%';
    r.water.value.textContent = String(Math.round(water * 0.3));
    if (water < 8){
      r.water.status.textContent = 'DRY / 弹匣空';
      r.water.dot.className = 'dot empty';
    } else if (water < 30){
      r.water.status.textContent = 'LOW / 低弹药';
      r.water.dot.className = 'dot low';
    } else {
      r.water.status.textContent = state.aiming ? 'AIM / 瞄准中' : 'READY / 就绪';
      r.water.dot.className = 'dot';
    }
    const reserve = state.reserve ?? 0;
    if (this.refs.pressure.fill){
      this.refs.pressure.fill.style.width = Math.max(0, Math.min(100, water)) + '%';
      this.refs.pressure.val.textContent = '5.56';
    }
    if (this.refs.telemetry.hpP) this.refs.telemetry.hpP.style.width = Math.max(0, Math.min(100, p.hp)) + '%';
    if (this.refs.telemetry.hpA) this.refs.telemetry.hpA.style.width = Math.max(0, Math.min(100, a.hp)) + '%';

    const wet = Math.max(0, Math.min(100, p.hp || 0));
    if (this.refs.bubbleBuild){
      this.refs.bubbleBuild.style.opacity = '0';
      this.refs.bubbleBuild.classList.remove('near');
    }
    const ab = this.refs.abilities;
    if (ab.wet){
      if (ab.wetFill) ab.wetFill.style.height = wet + '%';
      if (ab.wetVal) ab.wetVal.textContent = String(Math.round(wet));
      ab.wet.classList.toggle('danger', wet < 34);
    }
    if (ab.aim) ab.aim.classList.toggle('active', !!state.aiming);
    if (this.refs.ads) this.refs.ads.classList.toggle('on', !!state.aiming && !p.bubbled);
    if (state.pumpCooldown > 0){
      r.water.pump.textContent = '换弹中 ' + state.pumpCooldown.toFixed(1) + 's';
      r.water.pump.classList.add('cool');
    } else if (reserve <= 0){
      r.water.pump.textContent = '弹匣空 · 寻找补给箱';
      r.water.pump.classList.add('cool');
    } else {
      r.water.pump.textContent = 'R · 换弹 · 弹匣 ×' + reserve;
      r.water.pump.classList.remove('cool');
    }

    if (state.wave !== undefined && r.round){
      const left = state.waveLeft ?? 0;
      r.round.textContent = 'WAVE 0' + (state.wave + 1) + ' · 剩余 ' + left + ' 个红队目标';
    }
    if (r.objectiveBar){
      const integ = state.objectiveIntegrity ?? 100;
      const danger = integ < 55;
      r.objectiveBar.classList.toggle('hidden', integ > 99.5);
      r.objectiveFill.style.width = Math.max(0, integ) + '%';
      r.objectiveFill.style.background = danger
        ? 'linear-gradient(90deg,#c5442f,#e0a84a)'
        : 'linear-gradient(90deg,#d8b25a,#9fbf8a)';
      if (r.objectiveName) r.objectiveName.textContent = danger ? 'BUBBLE CORE · CRITICAL' : 'BUBBLE CORE · 守住 A 点';
      const pct = r.objectiveBar.querySelector('.bb-pct');
      if (pct) pct.textContent = Math.round(Math.max(0, integ)) + '%';
    }
    if (r.weaponName && state.weaponName) r.weaponName.innerHTML = state.weaponName;

    if (r.stamina.fill) r.stamina.fill.style.width = Math.max(0, Math.min(100, p.hp)) + '%';
    if (r.stamina.item) r.stamina.item.textContent = '×' + (state.reserve ?? 0);
    if (r.playerName && state.playerName) r.playerName.textContent = state.playerName;

    r.combo.panel.classList.toggle('on', state.combo > 1);
    if (state.combo > 1){
      r.combo.num.textContent = state.combo;
      r.combo.mult.textContent = 'x' + state.comboMult.toFixed(1);
    }

    r.crosshair.classList.toggle('aim', state.aiming);
    r.chBubble.classList.toggle('on', state.crosshairBubble);

    if (state.interact){
      r.interact.classList.remove('hidden');
      r.interactText.textContent = state.interact;
    } else {
      r.interact.classList.add('hidden');
    }

    if (!this._bubble && state.player.bubbled !== this.bubbleOn){
      this.bubbleOn = state.player.bubbled;
      r.bubbleScreen.classList.toggle('on', this.bubbleOn);
    }
    if (state.player.bubbled){
      r.rescueTimer.textContent = Math.max(0, state.rescueRemaining).toFixed(1);
      r.rescueFill.style.width = (state.rescueProgress * 100) + '%';
    }

    if (state.comboState === 0 && this.bannerTimer <= 0){ /* noop */ }

    // tutorial fade after some seconds of play
    if (state.matchElapsed > 14 && !r.tutorial.classList.contains('fade')) r.tutorial.classList.add('fade');
    if (state.matchElapsed < 14) r.tutorial.classList.remove('fade');
  }

  updateMinimap(state, dt){
    if (this.activeScreen !== null) return;
    this.lastMinimap += dt;
    if (this.lastMinimap < 0.08) return;
    this.lastMinimap = 0;
    const canvas = this.refs.minimap;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (this.minimapBase) ctx.drawImage(this.minimapBase, 0, 0);

    const toX = (x) => (x + 46) / 92 * W;
    const toY = (z) => (z + 46) / 92 * H;
    // small world pulse rings
    const t = performance.now() / 1000;
    for (const e of state.enemyBlips){
      if (!e.visible) continue;
      const x = toX(e.x), y = toY(e.z);
      ctx.save();
      ctx.translate(x, y);
      if (e.bubbled){
        ctx.strokeStyle = 'rgba(255,182,72,.9)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#e04a5f';
        ctx.shadowColor = 'rgba(224,74,95,.5)'; ctx.shadowBlur = 4;
        ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
      }
      ctx.restore();
    }
    // ally
    {
      const a = state.allyBlip;
      ctx.save();
      ctx.translate(toX(a.x), toY(a.z));
      ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = a.bubbled ? '#ffb648' : '#4fc46c';
      ctx.shadowColor = 'rgba(79,196,108,.45)'; ctx.shadowBlur = 4;
      ctx.fill();
      ctx.restore();
    }
    // player arrow
    {
      const p = state.playerBlip;
      ctx.save();
      ctx.translate(toX(p.x), toY(p.z));
      ctx.rotate(p.angle);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7.2, 7);
      ctx.lineTo(0, 3.2);
      ctx.lineTo(-7.2, 7);
      ctx.closePath();
      ctx.fillStyle = '#1c86d8'; ctx.shadowColor = 'rgba(28,134,216,.5)'; ctx.shadowBlur = 5;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  buildMinimapBase(){
    const c = document.createElement('canvas');
    c.width = 360; c.height = 360;
    const ctx = c.getContext('2d');
    const toX = (x) => (x + 46) / 92 * c.width;
    const toY = (z) => (z + 46) / 92 * c.height;
    const W = c.width;

    // dark tactical terrain
    ctx.fillStyle = '#0a1418';
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(60,48,30,.34)';
    ctx.fillRect(0, 0, W, W);
    // sand contour shading
    for (let i = 0; i < 26; i++){
      ctx.strokeStyle = 'rgba(160,190,190,.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(W / 2 + Math.sin(i * 2.1) * 30, W / 2 + Math.cos(i * 1.7) * 30, 22 + i * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    // perimeter walls
    ctx.strokeStyle = 'rgba(120,205,225,.7)';
    ctx.lineWidth = 5;
    ctx.strokeRect(toX(-44), toY(-41), toX(44) - toX(-44), toY(41) - toY(-41));
    // building blocks
    const block = (x, z, w, d) => {
      ctx.fillStyle = 'rgba(130,190,205,.24)';
      ctx.fillRect(toX(x - w / 2), toY(z - d / 2), (w / 92) * W, (d / 92) * W);
      ctx.strokeStyle = 'rgba(150,220,235,.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(toX(x - w / 2), toY(z - d / 2), (w / 92) * W, (d / 92) * W);
    };
    block(-27, -8, 16, 14);
    block(27, -11, 18, 12);
    block(0, -30, 26, 10);
    block(-14, -22, 12, 8);
    block(15, -22, 12, 8);
    block(-33, 12, 12, 12);
    block(33, 10, 12, 14);
    block(0, 32, 12, 10);
    // plaza ring
    ctx.strokeStyle = 'rgba(120,205,225,.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(toX(0), toY(7), 24, 0, Math.PI * 2);
    ctx.stroke();
    // main road
    ctx.strokeStyle = 'rgba(200,220,225,.2)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(40));
    ctx.lineTo(toX(0), toY(8));
    ctx.stroke();
    // water station objective
    ctx.strokeStyle = 'rgba(95,240,255,.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(toX(0), toY(7), 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(95,240,255,.4)';
    ctx.beginPath(); ctx.arc(toX(0), toY(7), 4, 0, Math.PI * 2); ctx.fill();
    // border
    ctx.strokeStyle = 'rgba(95,240,255,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, W - 4, W - 4);
    this.minimapBase = c;
  }

  /* ---------------- feedback ---------------- */
  showBanner(sub, main, warn = false, duration = 2.2){
    const r = this.refs;
    r.bannerSub.textContent = sub;
    r.bannerMain.textContent = main;
    r.banner.classList.toggle('warn', warn);
    r.banner.classList.add('on');
    this.bannerTimer = duration;
  }

  hideBanner(){
    this.refs.banner.classList.remove('on');
    this.bannerTimer = 0;
  }

  addKillfeed(a, b, verb, icon = '◈', side = 'blue'){
    const el = document.createElement('div');
    el.className = 'kf-item';
    el.innerHTML = `<span class="kf-ico">${icon}</span><span class="kf-a">${a}</span><span class="kf-act">${verb}</span><span class="kf-b">${b}</span>`;
    this.refs.killfeed.appendChild(el);
    while (this.refs.killfeed.children.length > 5) this.refs.killfeed.removeChild(this.refs.killfeed.firstChild);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 420);
    }, 4200);
  }

  addFloater(x, y, text, cls = ''){
    if (x < -100 || y < -100 || x > window.innerWidth + 100 || y > window.innerHeight + 100) return;
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.textContent = text;
    this.refs.floaters.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  damageFrom(angle){
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    this.refs.damageDirs.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  hitmarker(crit = false){
    const hit = this.refs.chHit;
    hit.classList.remove('on');
    void hit.offsetWidth;
    hit.classList.add('on');
    if (crit) hit.style.filter = 'hue-rotate(-30deg) brightness(1.5)';
    setTimeout(() => { hit.classList.remove('on'); hit.style.filter = ''; }, 130);
  }

  flashDamage(){
    const f = this.refs.damageFlash;
    f.classList.add('hit');
    setTimeout(() => f.classList.remove('hit'), 90);
  }

  showSubtitle(text, name = 'NOVA', duration = 3.2){
    const el = this.refs.subtitle;
    el.innerHTML = `<b>${name}</b>${text}`;
    el.classList.add('on');
    clearTimeout(this.subtitleTO);
    this.subtitleTO = setTimeout(() => el.classList.remove('on'), duration * 1000);
  }

  showToast(text, duration = 2.4){
    const el = this.refs.toast;
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTO);
    this.toastTO = setTimeout(() => el.classList.remove('on'), duration * 1000);
  }

  countdown(value, sub = '', duration = 0.9){
    const r = this.refs;
    r.countdownNum.textContent = value;
    r.countdownSub.textContent = sub;
    r.countdown.classList.add('on');
    r.countdownNum.style.animation = 'none';
    void r.countdownNum.offsetWidth;
    r.countdownNum.style.animation = 'cdPop .9s cubic-bezier(.2,.8,.2,1)';
    clearTimeout(this.cdTO);
    if (duration > 0){
      this.cdTO = setTimeout(() => r.countdown.classList.remove('on'), duration * 1000);
    }
  }

  hideCountdown(){ this.refs.countdown.classList.remove('on'); }

  update(dt){
    if (this.bannerTimer > 0){
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hideBanner();
    }
    // render telemetry (smoothed, updated 4×/s)
    this._fpsFrames = (this._fpsFrames || 0) + 1;
    this._fpsTime = (this._fpsTime || 0) + dt;
    if (this._fpsTime >= 0.25){
      const fps = Math.round(this._fpsFrames / this._fpsTime);
      this._fpsFrames = 0;
      this._fpsTime = 0;
      const tel = this.refs.telemetry;
      if (tel && tel.fps){
        tel.fps.textContent = fps;
        if (tel.bar) tel.bar.style.width = Math.max(8, Math.min(100, (fps / 60) * 100)) + '%';
      }
    }
  }

  /* ---------------- results ---------------- */
  showResults(data){
    const r = this.refs.results;
    r.kicker.textContent = data.victory ? 'MISSION COMPLETE · A 点守住了' : 'MISSION FAILED · 核心被摧毁';
    r.title.textContent = data.victory ? 'VICTORY' : 'DEFEAT';
    r.title.className = data.victory ? 'victory' : 'defeat';
    const stars = document.getElementById('res-stars');
    if (stars) [...stars.children].forEach((el, i) => { el.style.opacity = data.victory ? '1' : (i === 0 ? '1' : '.25'); });
    r.sub.textContent = data.victory ? '蓝队完成清剿 · 泡泡核心完好' : '红队摧毁了核心 · 重新部署';
    r.pScore.textContent = Math.round(data.player.score);
    r.pBubble.textContent = data.player.bubbles;
    r.pPop.textContent = data.player.pops;
    r.pRescue.textContent = data.player.melee ?? 0;
    r.pAcc.textContent = data.player.accuracy + '%';
    r.aScore.textContent = Math.round(data.ally.score);
    r.aBubble.textContent = data.ally.bubbles;
    r.aPop.textContent = data.ally.pops;
    r.aRescue.textContent = data.ally.melee ?? 0;
    r.aAcc.textContent = data.ally.accuracy + '%';
    r.eScore.textContent = Math.round(data.enemy.score);
    r.eBubble.textContent = data.enemy.bubbles;
    r.ePop.textContent = data.enemy.pops;
    r.eRescue.textContent = data.enemy.rescues;
    r.mvpName.textContent = data.mvpName || 'ECHO';
    r.mvpCombo.textContent = data.combo;
    r.mvpBubble.textContent = data.player.pops;
    r.mvpAvatar.style.background = data.victory
      ? 'radial-gradient(circle at 50% 35%,#2d78b8,#123a5e 55%,#081a2a)'
      : 'radial-gradient(circle at 50% 35%,#8a3a44,#4a1a22 55%,#1a0a0e)';
    r.duration.textContent = data.duration;
    r.score.textContent = Math.round(data.scoreBlue) + ' : ' + Math.round(data.scoreRed);
    r.combo.textContent = data.combo;
    r.acc.textContent = data.player.accuracy + '%';
    r.taken.textContent = Math.round(data.damageTaken);
  }

  setBubbleCamera(on){ /* HUD toggle handled by Game via CSS */ }
}

function formatTime(sec){
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
