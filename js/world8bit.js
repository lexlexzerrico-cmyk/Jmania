/* ============================================================
   world8bit.js — 8-bit open-world overworld for JerkWorld
   ------------------------------------------------------------
   A top-down retro overworld drawn on a low-res canvas scaled
   up (pixelated). Walk with WASD/arrows or the on-screen D-pad,
   collide with water/trees/rocks, and step onto a boss to
   trigger its clap-battle. Camera follows the player.
   ============================================================ */

export const TILE = 16;          // source pixels per tile
const MAP_W = 44, MAP_H = 44;

// Pokémon-DS-ish palette
const C = {
  grass1: "#7cc24a", grass2: "#6fb840", grassEdge: "#5a9c34",
  path: "#e0c98a", path2: "#d4ba74", pathEdge: "#b89a5c",
  water1: "#4aa8e0", water2: "#3a90d0", waterFoam: "#bfe8ff",
  sand: "#ecd9a0",
  tree: "#2f9a3e", treeDark: "#1e7030", treeHi: "#5fc24e", trunk: "#7a4a22",
  rock: "#9aa0ac", rockDark: "#6a7080",
  flowerR: "#ff5b7f", flowerY: "#ffd24a", flowerW: "#ffffff",
  tall1: "#4f9c2f", tall2: "#3f861f",
  roof: "#e05b4a", roofDark: "#b83a2c", roofHi: "#ff7d63",
  wall: "#e8d8b0", wallDark: "#c8b487", door: "#7a4a22", win: "#8fe0ff",
  fence: "#c9a86a", fenceDark: "#9c7c48", sign: "#a06a3a", signPost: "#7a4a22",
};

// Tile codes:
// 0 grass, 1 path, 2 water, 3 tree, 4 rock, 5 sand, 6 flower, 7 tallgrass,
// 8 wall, 9 roof, 10 door, 11 window-wall, 12 fence, 13 sign
const SOLID = new Set([2, 3, 4, 8, 9, 11, 12]); // door(10)/sign(13)/tallgrass(7) walkable

// Boss node positions along the route (tile coords), in fight order.
export const BOSS_SPOTS = [
  { x: 22, y: 11 }, { x: 15, y: 15 }, { x: 28, y: 17 }, { x: 20, y: 22 },
  { x: 31, y: 24 }, { x: 14, y: 27 }, { x: 25, y: 29 }, { x: 34, y: 31 },
  { x: 18, y: 34 }, { x: 30, y: 36 }, { x: 12, y: 38 }, { x: 24, y: 40 },
];

function hpath(m, x0, x1, y, w = 1) { // horizontal path band
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let d = -(w - 1); d <= (w - 1); d++) if (m[y + d]) m[y + d][x] = 1;
}
function vpath(m, y0, y1, x, w = 1) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let d = -(w - 1); d <= (w - 1); d++) if (m[y]) m[y][x + d] = 1;
}
function placeHouse(m, x, y, w) { // w tiles wide, 3 tall (roof + 2 walls)
  for (let i = 0; i < w; i++) {
    if (m[y]) m[y][x + i] = 9;                 // roof
    if (m[y + 1]) m[y + 1][x + i] = 8;         // wall
    if (m[y + 2]) m[y + 2][x + i] = 8;         // wall
  }
  const dx = x + Math.floor(w / 2);
  if (m[y + 2]) m[y + 2][dx] = 10;             // door
  if (w >= 3 && m[y + 1]) { m[y + 1][x] = 11; m[y + 1][x + w - 1] = 11; } // windows
}
function tallPatch(m, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const cx = x + dx, cy = y + dy;
    if (m[cy] && m[cy][cx] === 0) m[cy][cx] = 7;
  }
}

function buildMap() {
  const m = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push((x * 7 + y * 13) % 17 === 0 ? 6 : 0);
    m.push(row);
  }
  // Tree border
  for (let x = 0; x < MAP_W; x++) { m[0][x] = 3; m[1][x] = 3; m[MAP_H - 1][x] = 3; m[MAP_H - 2][x] = 3; }
  for (let y = 0; y < MAP_H; y++) { m[y][0] = 3; m[y][1] = 3; m[y][MAP_W - 1] = 3; m[y][MAP_W - 2] = 3; }

  // --- Town (top) : a plaza with houses, fences and a sign ---
  for (let y = 4; y < 11; y++) for (let x = 4; x < 20; x++) m[y][x] = (x + y) % 2 ? 0 : 0;
  placeHouse(m, 5, 4, 4);
  placeHouse(m, 12, 4, 4);
  placeHouse(m, 16, 8, 4);
  // town plaza paths
  hpath(m, 5, 20, 9, 2);
  vpath(m, 7, 9, 7);           // to house 1 door
  vpath(m, 7, 9, 14);          // to house 2 door
  // fences framing the town
  for (let x = 4; x <= 19; x++) { if (m[11][x] === 0) m[11][x] = 12; }
  m[10][20] = 0; // gate gap
  // welcome sign
  m[9][4] = 13;

  // --- Main route: a winding path down through the wild, past boss spots ---
  const waypoints = [[13, 9], [22, 11], [15, 15], [22, 18], [28, 17], [20, 22],
    [26, 24], [30, 26], [18, 28], [14, 30], [22, 32], [24, 34], [30, 36], [33, 38]];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, ay] = waypoints[i], [bx, by] = waypoints[i + 1];
    hpath(m, ax, bx, ay, 2); vpath(m, ay, by, bx, 2);
  }

  // --- Water: a pond with sandy shore on the east ---
  for (let y = 18; y < 27; y++) for (let x = 33; x < 41; x++) {
    if ((x - 37) ** 2 + ((y - 22) * 1.1) ** 2 < 14) m[y][x] = 2;
  }
  for (let y = 16; y < 29; y++) for (let x = 31; x < 42; x++) {
    if (m[y][x] === 0 && (x - 37) ** 2 + ((y - 22) * 1.1) ** 2 < 26) m[y][x] = 5;
  }

  // --- Tall-grass encounter patches near boss spots ---
  tallPatch(m, 24, 12, 5, 4); tallPatch(m, 12, 24, 5, 4);
  tallPatch(m, 27, 30, 6, 5); tallPatch(m, 8, 33, 5, 4);
  tallPatch(m, 20, 36, 6, 4);

  // --- Scatter trees, rocks, flowers on plain grass (deterministic) ---
  const rndS = (n) => Math.abs((Math.sin(n * 12.9898) * 43758.5453) % 1);
  for (let i = 0; i < 200; i++) {
    const x = 2 + Math.floor(rndS(i + 1) * (MAP_W - 4));
    const y = 3 + Math.floor(rndS(i + 777) * (MAP_H - 6));
    if (m[y][x] === 0) m[y][x] = rndS(i + 7) > 0.82 ? 4 : (rndS(i + 7) > 0.55 ? 3 : (rndS(i + 3) > 0.7 ? 6 : 0));
  }
  // signs along the route
  m[13][20] = 13; m[27][25] = 13; m[35][31] = 13;
  return m;
}

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
    // spawn area in the town plaza
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) clear(10 + dx, 10 + dy);

    // Player starts in the town plaza, facing the route
    this.px = 10 * TILE + 4; this.py = 10 * TILE;
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
    if (this.noclip) return false;   // admin: walk through everything
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
    const alt = (tx * 3 + ty * 5) % 2;
    if (t === 2) { // water (animated bands + foam)
      ctx.fillStyle = C.water2; ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = C.water1;
      const off = (Math.floor(this.t * 4) + tx) % 4;
      ctx.fillRect(sx, sy + off * 4, TILE, 2);
      ctx.fillStyle = C.waterFoam; ctx.globalAlpha = 0.5;
      if ((tx + ty + Math.floor(this.t * 2)) % 5 === 0) ctx.fillRect(sx + 3, sy + 6, 4, 1);
      ctx.globalAlpha = 1; return;
    }
    // grass base under everything (soft checker)
    ctx.fillStyle = alt ? C.grass1 : C.grass2; ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = C.grassEdge; if ((tx * 7 + ty * 11) % 6 === 0) ctx.fillRect(sx + 3, sy + 11, 3, 1);

    switch (t) {
      case 1: // path
        ctx.fillStyle = C.path; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.path2; if (alt) ctx.fillRect(sx + 2, sy + 2, 3, 3);
        ctx.fillStyle = C.pathEdge; ctx.fillRect(sx, sy + TILE - 2, TILE, 2); break;
      case 5: // sand
        ctx.fillStyle = C.sand; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#d8c088"; if (alt) ctx.fillRect(sx + 4, sy + 5, 2, 2); break;
      case 6: // flowers
        { const cols = [C.flowerR, C.flowerY, C.flowerW]; const c1 = cols[(tx + ty) % 3];
          ctx.fillStyle = c1; ctx.fillRect(sx + 4, sy + 5, 3, 3); ctx.fillRect(sx + 9, sy + 9, 3, 3);
          ctx.fillStyle = "#ffe98a"; ctx.fillRect(sx + 5, sy + 6, 1, 1); ctx.fillRect(sx + 10, sy + 10, 1, 1); } break;
      case 7: // tall grass (encounter)
        { const sway = Math.sin(this.t * 4 + tx) > 0 ? 1 : 0;
          ctx.fillStyle = C.tall2; ctx.fillRect(sx, sy + 6, TILE, TILE - 6);
          ctx.fillStyle = C.tall1;
          for (let b = 0; b < 4; b++) { const bx = sx + 1 + b * 4 + sway; ctx.fillRect(bx, sy + 3, 2, 11); }
        } break;
      case 3: // tree (rounded canopy)
        ctx.fillStyle = C.trunk; ctx.fillRect(sx + 6, sy + 11, 4, 5);
        ctx.fillStyle = C.treeDark; ctx.fillRect(sx + 2, sy + 3, 12, 9); ctx.fillRect(sx + 3, sy + 2, 10, 1); ctx.fillRect(sx + 3, sy + 12, 10, 1);
        ctx.fillStyle = C.tree; ctx.fillRect(sx + 3, sy + 3, 10, 7);
        ctx.fillStyle = C.treeHi; ctx.fillRect(sx + 4, sy + 4, 3, 2); ctx.fillRect(sx + 9, sy + 6, 2, 2); break;
      case 4: // rock
        ctx.fillStyle = C.rockDark; ctx.fillRect(sx + 3, sy + 7, 10, 6);
        ctx.fillStyle = C.rock; ctx.fillRect(sx + 4, sy + 5, 8, 5);
        ctx.fillStyle = "#b6bcc8"; ctx.fillRect(sx + 5, sy + 6, 2, 1); break;
      case 8: // house wall
        ctx.fillStyle = C.wallDark; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE - 2);
        ctx.fillStyle = C.wallDark; for (let by = 2; by < TILE; by += 5) ctx.fillRect(sx, sy + by, TILE, 1); break;
      case 11: // wall with window
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#5a8ab0"; ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = C.win; ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = "#fff"; ctx.fillRect(sx + 4, sy + 4, 2, 2); break;
      case 9: // roof
        ctx.fillStyle = C.roofDark; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.roof; ctx.fillRect(sx, sy + 2, TILE, TILE - 4);
        ctx.fillStyle = C.roofHi; ctx.fillRect(sx, sy + 2, TILE, 2);
        ctx.fillStyle = C.roofDark; for (let bx = 0; bx < TILE; bx += 4) ctx.fillRect(sx + bx, sy, 1, TILE); break;
      case 10: // door
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.door; ctx.fillRect(sx + 3, sy + 2, TILE - 6, TILE - 2);
        ctx.fillStyle = "#ffd05a"; ctx.fillRect(sx + TILE - 6, sy + 8, 1, 2); break;
      case 12: // fence
        ctx.fillStyle = C.fenceDark; ctx.fillRect(sx + 1, sy + 4, TILE - 2, 2); ctx.fillRect(sx + 1, sy + 9, TILE - 2, 2);
        ctx.fillStyle = C.fence; ctx.fillRect(sx + 2, sy + 2, 2, 11); ctx.fillRect(sx + TILE - 4, sy + 2, 2, 11); break;
      case 13: // sign
        ctx.fillStyle = C.signPost; ctx.fillRect(sx + 7, sy + 8, 2, 6);
        ctx.fillStyle = C.sign; ctx.fillRect(sx + 2, sy + 2, TILE - 4, 7);
        ctx.fillStyle = "#5a3a1a"; ctx.fillRect(sx + 4, sy + 4, TILE - 8, 1); ctx.fillRect(sx + 4, sy + 6, TILE - 9, 1); break;
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
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 5, y + 8, 10, 2);
    // legs (walk cycle)
    ctx.fillStyle = "#2a2440";
    ctx.fillRect(x - 4, y + 5, 3, 3 + (step ? 1 : 0));
    ctx.fillRect(x + 1, y + 5, 3, 3 + (step ? 0 : 1));
    // torso — purple jacket
    ctx.fillStyle = "#7b3dff"; ctx.fillRect(x - 5, y - 2, 10, 8);
    ctx.fillStyle = "#a06bff"; ctx.fillRect(x - 5, y - 2, 10, 2);          // collar highlight
    ctx.fillStyle = "#22e0d6"; ctx.fillRect(x - 1, y, 2, 5);              // zipper
    // arms
    ctx.fillStyle = "#6a2fe0"; ctx.fillRect(x - 6, y - 1, 2, 5); ctx.fillRect(x + 4, y - 1, 2, 5);
    // head
    ctx.fillStyle = "#ffd9a8"; ctx.fillRect(x - 3, y - 8, 6, 6);
    // cap (brim faces movement dir)
    ctx.fillStyle = "#ff2d6f"; ctx.fillRect(x - 4, y - 10, 8, 3);
    ctx.fillStyle = "#ff6a94"; ctx.fillRect(x - 3, y - 10, 3, 1);
    ctx.fillStyle = "#d81f57";
    if (this.dir === "down") ctx.fillRect(x - 3, y - 7, 6, 1);
    else if (this.dir === "left") ctx.fillRect(x - 6, y - 8, 3, 2);
    else if (this.dir === "right") ctx.fillRect(x + 3, y - 8, 3, 2);
    // eyes
    ctx.fillStyle = "#221830";
    if (this.dir === "down") { ctx.fillRect(x - 2, y - 5, 1, 2); ctx.fillRect(x + 1, y - 5, 1, 2); }
    else if (this.dir === "left") ctx.fillRect(x - 2, y - 5, 1, 2);
    else if (this.dir === "right") ctx.fillRect(x + 1, y - 5, 1, 2);
    // rustle when standing in tall grass
    const tx = Math.floor(this.px / TILE), ty = Math.floor((this.py + 6) / TILE);
    if (this.map[ty] && this.map[ty][tx] === 7) {
      ctx.fillStyle = "#3f861f"; ctx.fillRect(x - 6, y + 6, 12, 4);
      ctx.fillStyle = "#5aa62f"; ctx.fillRect(x - 5 + step, y + 5, 2, 4); ctx.fillRect(x + 3 - step, y + 5, 2, 4);
    }
  }
}
