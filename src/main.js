import { Game } from './game/game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
window.__bubbleclash = game;

game.init().catch((err) => {
  console.error('[BUBBLE CLASH] boot failure', err);
  const el = document.getElementById('load-assets');
  if (el) el.innerHTML = '<div style="color:#ff6b7d">BOOT ERROR · ' + String(err.message || err) + '</div>';
  const pct = document.getElementById('load-pct');
  if (pct) pct.textContent = 'ERR';
});
