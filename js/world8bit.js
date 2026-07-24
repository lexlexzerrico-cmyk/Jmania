/* ============================================================
   world8bit.js — 8-bit open-world overworld for JerkWorld
   ------------------------------------------------------------
   A top-down retro overworld drawn on a low-res canvas scaled
   up (pixelated). Walk with WASD/arrows or the on-screen D-pad,
   collide with water/trees/rocks, and step onto a boss to
   trigger its clap-battle. Camera follows the player.
   ============================================================ */

export const TILE = 16;          // source pixels per tile
const MAP_W = 40, MAP_H = 28;

// Palette (NES-ish)
const C = {
  grass1: "#3aa63a", grass2: "#2f8f34", path: "#c9a86a", pathEdge: "#a8894f",
  water1: "#3a6ede", water2: "#2e5ac0", sand: "#e6d08a",
  tree: "#1f7a2e", treeDark: "#155a22", trunk: "#6b431f",
  rock: "#8a8f9a", rockDark: "#5a606b", flower: "#ff5b8f",
};

// Tile codes: 0 grass, 1 path, 2 water, 3 tree, 4 rock, 5 sand, 6 flower
function buildMap() {
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) {
      let t = (x * 7 + y * 13) % 11 === 0 ? 6 : 0; // sparse flowers
      row.push(t);
    }
    m.push(row);
  }
  // Winding main path (snake) connecting boss nodes
  let px = 3;
  for (let y = 2; y < MAP_H - 2; y++) {
    px += (y % 4 === 0) ? 2 : (y % 5 === 0 ? -1 : 0);
    px = Math.max(2, Math.min(MAP_W - 3, px));
    for (let w = -1; w <= 1; w++) if (m[y][px + w] !== undefined) m[y][px + w] = 1;
  }
  // A lake
  for (let y = 5; y < 10; y++) for (let x = 26; x < 34; x++) {
    if ((x - 30) ** 2 + (y - 7) ** 2 < 12) m[y][x] = 2;
  }
  for (let y = 4; y < 11; y++) for (let x = 25; x < 35; x++) {
    if (m[y][x] === 0 && (x - 30) ** 2 + (y - 7) ** 2 < 20) m[y][x] = 5; // sand shore
  }
  // Tree clusters & rocks (avoid path)
  const seedRnd = (n) => (Math.sin(n * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(Math.abs(seedRnd(i + 1)) * MAP_W);
    const y = Math.floor(Math.abs(seedRnd(i + 99)) * MAP_H);
    if (m[y] && m[y][x] === 0) m[y][x] = Math.abs(seedRnd(i + 7)) > 0.7 ? 4 : 3;
  }
  // Border of trees
  for (let x = 0; x < MAP_W; x++) { m[0][x] = 3; m[MAP_H - 1][x] = 3; }
  for (let y = 0; y < MAP_H; y++) { m[y][0] = 3; m[y][MAP_W - 1] = 3; }
  return m;
}

const SOLID = new Set([2, 3, 4]); // water, tree, rock block movement

// Boss node positions on the map (tile coords), in fight order.
export const BOSS_SPOTS = [
  { x: 3, y: 4 }, { x: 5, y: 8 }, { x: 4, y: 13 }, { x: 6, y: 17 },
  { x: 9, y: 21 }, { x: 14, y: 23 }, { x: 20, y: 20 }, { x: 30, y: 22 },
];

export class World8Bit {
  constructor(canvas, profile, bosses, onEncounter) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.profile = profile;
    this.bosses = bosses;
    this.onEncounter = onEncounter;
    this.map = buildMap();
    this.beaten = profile.rpgBeaten || 0;

    // Guarantee every boss tile (and its neighbours) and the spawn are walkable.
    const clear = (tx, ty) => { if (this.map[ty] && this.map[ty][tx] !== undefined && this.map[ty][tx] !== 2) this.map[ty][tx] = 1; };
    BOSS_SPOTS.forEach((s) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clear(s.x + dx, s.y + dy); });
    [[3, 6], [3, 5], [4, 6], [2, 6]].forEach(([x, y]) => clear(x, y));

    // Player starts near first boss
    this.px = 3 * TILE + 4; this.py = 6 * TILE;
    this.dir = "down"; this.moving = false; this.animT = 0;
    this.keys = new Set();
    this.touchVec = { x: 0, y: 0 };
    this.running = true;
    this.encounterLock = false;
    this.t = 0;

    this._key = (e) => {
      const map = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" };
      if (map[e.code]) { e.preventDefault(); if (e.type === "keydown") this.keys.add(map[e.code]); else this.keys.delete(map[e.code]); }
    };
    addEventListener("keydown", this._key);
    addEventListener("keyup", this._key);
    this._loop = this._loop.bind(this);
    this._resize();
    this._ro = () => this._resize();
    addEventListener("resize", this._ro);
    requestAnimationFrame(this._loop);
  }

  setTouch(x, y) { this.touchVec.x = x; this.touchVec.y = y; }

  _resize() {
    // Render at a fixed source resolution, CSS scales up (pixelated)
    this.vw = 22 * TILE;   // ~visible tiles
    this.vh = 16 * TILE;
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;  // reset by width change above
  }

  destroy() {
    this.running = false;
    removeEventListener("keydown", this._key);
    removeEventListener("keyup", this._key);
    removeEventListener("resize", this._ro);
  }

  _solidAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return SOLID.has(this.map[ty][tx]);
  }

  _move(dt) {
    let dx = 0, dy = 0;
    if (this.keys.has("up")) dy -= 1;
    if (this.keys.has("down")) dy += 1;
    if (this.keys.has("left")) dx -= 1;
    if (this.keys.has("right")) dx += 1;
    dx += this.touchVec.x; dy += this.touchVec.y;
    const len = Math.hypot(dx, dy);
    this.moving = len > 0.1;
    if (!this.moving) return;
    dx /= len; dy /= len;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx < 0 ? "left" : "right";
    else this.dir = dy < 0 ? "up" : "down";
    const spd = 62 * dt;
    // Axis-separated collision using a small hitbox
    const hw = 4, hh = 3;
    const nx = this.px + dx * spd;
    if (!this._solidAt(nx - hw, this.py + 6) && !this._solidAt(nx + hw, this.py + 6)) this.px = nx;
    const ny = this.py + dy * spd;
    if (!this._solidAt(this.px - hw, ny + 6) && !this._solidAt(this.px + hw, ny + 6)) this.py = ny;
    this.animT += dt * 8;
  }

  _checkEncounter() {
    if (this.encounterLock) return;
    for (let i = 0; i <= this.beaten && i < BOSS_SPOTS.length; i++) {
      const s = BOSS_SPOTS[i];
      const bx = s.x * TILE + TILE / 2, by = s.y * TILE + TILE / 2;
      if (Math.hypot(this.px - bx, this.py - by) < 11) {
        this.encounterLock = true;
        this.onEncounter(i);
        return;
      }
    }
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now; this.t += dt;
    this._move(dt);
    this._checkEncounter();
    this._draw();
    requestAnimationFrame(this._loop);
  }

  _draw() {
    const ctx = this.ctx;
    // Camera (clamped)
    let camx = Math.round(this.px - this.vw / 2);
    let camy = Math.round(this.py - this.vh / 2);
    camx = Math.max(0, Math.min(MAP_W * TILE - this.vw, camx));
    camy = Math.max(0, Math.min(MAP_H * TILE - this.vh, camy));

    const x0 = Math.floor(camx / TILE), y0 = Math.floor(camy / TILE);
    for (let ty = y0; ty <= y0 + this.vh / TILE + 1 && ty < MAP_H; ty++) {
      for (let tx = x0; tx <= x0 + this.vw / TILE + 1 && tx < MAP_W; tx++) {
        this._tile(tx, ty, tx * TILE - camx, ty * TILE - camy);
      }
    }

    // Boss sprites
    for (let i = 0; i < BOSS_SPOTS.length; i++) {
      const s = BOSS_SPOTS[i];
      const sx = s.x * TILE - camx, sy = s.y * TILE - camy;
      if (sx < -TILE || sx > this.vw || sy < -TILE || sy > this.vh) continue;
      this._bossSprite(i, sx, sy);
    }

    // Player
    this._player(Math.round(this.px - camx), Math.round(this.py - camy));
  }

  _tile(tx, ty, sx, sy) {
    const ctx = this.ctx;
    const t = this.map[ty][tx];
    const alt = (tx + ty) % 2;
    if (t === 2) { // water (animated)
      ctx.fillStyle = (Math.floor(this.t * 3) + tx + ty) % 2 ? C.water1 : C.water2;
      ctx.fillRect(sx, sy, TILE, TILE);
      return;
    }
    // grass base under everything
    ctx.fillStyle = alt ? C.grass1 : C.grass2;
    ctx.fillRect(sx, sy, TILE, TILE);
    if (t === 1) { ctx.fillStyle = C.path; ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2); ctx.fillStyle = C.pathEdge; ctx.fillRect(sx + 1, sy + TILE - 3, TILE - 2, 2); }
    else if (t === 5) { ctx.fillStyle = C.sand; ctx.fillRect(sx, sy, TILE, TILE); }
    else if (t === 6) { ctx.fillStyle = C.flower; ctx.fillRect(sx + 5, sy + 6, 2, 2); ctx.fillRect(sx + 9, sy + 9, 2, 2); }
    else if (t === 3) { // tree
      ctx.fillStyle = C.trunk; ctx.fillRect(sx + 6, sy + 10, 4, 5);
      ctx.fillStyle = C.treeDark; ctx.fillRect(sx + 2, sy + 2, 12, 9);
      ctx.fillStyle = C.tree; ctx.fillRect(sx + 3, sy + 1, 10, 8);
      ctx.fillStyle = "#59c24a"; ctx.fillRect(sx + 4, sy + 2, 3, 2);
    } else if (t === 4) { // rock
      ctx.fillStyle = C.rockDark; ctx.fillRect(sx + 3, sy + 6, 10, 7);
      ctx.fillStyle = C.rock; ctx.fillRect(sx + 4, sy + 5, 8, 5);
    }
  }

  _bossSprite(i, sx, sy) {
    const ctx = this.ctx;
    const cx = sx + TILE / 2, cy = sy + TILE / 2;
    const state = i < this.beaten ? "beaten" : i === this.beaten ? "next" : "locked";
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(sx + 3, sy + TILE - 2, TILE - 6, 2);
    if (state === "locked") {
      ctx.fillStyle = "#555"; ctx.fillRect(sx + 4, sy + 4, 8, 8); // rock/lock
      ctx.fillStyle = "#333"; ctx.fillRect(sx + 6, sy + 7, 4, 3);
      return;
    }
    const bob = Math.sin(this.t * 3 + i) * 1.5;
    // emoji-ish blob boss (colored, bobbing)
    const cols = ["#ff5b6e", "#c9a0ff", "#ffd05a", "#9fe8ff", "#a6ff3a", "#ff9f3a", "#ff3d7f", "#b14dff"];
    ctx.fillStyle = state === "beaten" ? "#5a606b" : cols[i % cols.length];
    ctx.fillRect(sx + 3, sy + 2 + bob, 10, 11);
    ctx.fillStyle = "#000"; ctx.fillRect(sx + 5, sy + 5 + bob, 2, 2); ctx.fillRect(sx + 9, sy + 5 + bob, 2, 2);
    ctx.fillStyle = state === "beaten" ? "#333" : "#fff"; ctx.fillRect(sx + 5, sy + 9 + bob, 6, 1);
    if (state === "next") { // exclamation marker
      const p = Math.sin(this.t * 6) > 0;
      if (p) { ctx.fillStyle = "#ffd05a"; ctx.fillRect(cx - 1, sy - 6, 2, 4); ctx.fillRect(cx - 1, sy - 1, 2, 2); }
    }
    if (state === "beaten") { ctx.fillStyle = "#3ee08a"; ctx.fillRect(sx + 5, sy, 2, 2); ctx.fillRect(sx + 7, sy + 2, 2, 2); ctx.fillRect(sx + 9, sy, 2, 2); }
  }

  _player(x, y) {
    const ctx = this.ctx;
    const step = this.moving ? Math.floor(this.animT) % 2 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(x - 4, y + 7, 8, 2);
    // body
    ctx.fillStyle = "#b14dff"; ctx.fillRect(x - 4, y - 2, 8, 8);
    // head
    ctx.fillStyle = "#ffd9a8"; ctx.fillRect(x - 3, y - 8, 6, 6);
    // hair
    ctx.fillStyle = "#3a2a55"; ctx.fillRect(x - 3, y - 8, 6, 2);
    // eyes by facing
    ctx.fillStyle = "#000";
    if (this.dir === "down") { ctx.fillRect(x - 2, y - 5, 1, 2); ctx.fillRect(x + 1, y - 5, 1, 2); }
    else if (this.dir === "up") { /* back of head */ }
    else if (this.dir === "left") { ctx.fillRect(x - 2, y - 5, 1, 2); }
    else { ctx.fillRect(x + 1, y - 5, 1, 2); }
    // legs (walk)
    ctx.fillStyle = "#22203a";
    ctx.fillRect(x - 4, y + 6, 3, 2 + (step ? 1 : 0));
    ctx.fillRect(x + 1, y + 6, 3, 2 + (step ? 0 : 1));
    // little clap hands sparkle
    ctx.fillStyle = "#ffe79a"; ctx.fillRect(x - 5, y, 2, 2); ctx.fillRect(x + 3, y, 2, 2);
  }
}
