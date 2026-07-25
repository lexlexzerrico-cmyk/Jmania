/* ============================================================
   world8bit.js — INFINITE procedural overworld for JerkWorld
   ------------------------------------------------------------
   A top-down 8-bit world with NO edges: tiles are generated on
   the fly from seeded noise as you walk, so it scrolls forever.
   Biomes (plains, forest, desert, lakes) blend across the map,
   and villages of little houses appear in clearings.

   Each RUN has its own seed. Bosses, roaming entities and
   treasure are scattered deterministically across the world and
   get tougher the farther you roam from spawn. Beating them is
   tracked per-run, so progress persists within a run.
   ============================================================ */
import { BOSS_ROSTER, bossForTier, entityForTier, ENTITIES } from "./rpg.js";

export const TILE = 16;
const SPAWN_CELL = 6;     // world is diced into 6×6-tile cells; each may spawn something
const TIER_TILES = 42;    // every this-many tiles from spawn = +1 difficulty tier

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

// Tile codes: 0 grass,1 path,2 water,3 tree,4 rock,5 sand,6 flower,7 tallgrass,
// 8 wall,9 roof,10 door,11 window-wall,12 fence,13 sign
const SOLID = new Set([2, 3, 4, 8, 9, 11, 12]);

// ---- seeded value-noise (deterministic, infinite) -------------------------
function hash2(x, y, seed) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const tl = hash2(xi, yi, seed), tr = hash2(xi + 1, yi, seed);
  const bl = hash2(xi, yi + 1, seed), br = hash2(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v;
}
function fbm(x, y, seed) {
  let n = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 4; o++) { n += vnoise(x * freq, y * freq, seed + o * 97) * amp; amp *= 0.5; freq *= 2; }
  return n;
}

export function newRunState() {
  return { seed: (Math.random() * 1e9) | 0, defeated: {}, px: 8, py: 8, steps: 0,
    bossKills: 0, entityKills: 0, treasures: 0, jcEarned: 0, started: Date.now() };
}

export class World8Bit {
  constructor(canvas, profile, onEncounter) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.profile = profile;
    this.onEncounter = onEncounter;   // (spawn) => void

    if (!profile.run || typeof profile.run.seed !== "number") profile.run = newRunState();
    this.run = profile.run;
    if (!this.run.defeated) this.run.defeated = {};
    this.seed = this.run.seed;

    this.px = this.run.px ?? 8;
    this.py = this.run.py ?? 8;
    this.dir = "down"; this.moving = false; this.animT = 0;
    this.keys = new Set();
    this.touchVec = { x: 0, y: 0 };
    this.running = true;
    this.encounterLock = false;
    this.noclip = false; this.eventsOn = true;
    this.t = 0; this._saveT = 0;
    this._spawnCache = new Map();

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
    this.vw = 22 * TILE;
    this.vh = 16 * TILE;
    this.canvas.width = this.vw;
    this.canvas.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
  }

  destroy() {
    this.running = false;
    this._saveRun();
    removeEventListener("keydown", this._key);
    removeEventListener("keyup", this._key);
    removeEventListener("resize", this._ro);
  }

  // ---- world generation --------------------------------------------------
  tileAt(tx, ty) {
    // small guaranteed clearing at the run's spawn so you never start stuck
    if (Math.abs(tx) <= 3 && Math.abs(ty) <= 3) return (tx === 0 && ty === 0) ? 1 : 0;
    const v = this._villageTile(tx, ty);
    if (v !== null) return v;
    const e = fbm(tx * 0.045, ty * 0.045, this.seed);
    const m = fbm((tx + 500) * 0.05, (ty + 500) * 0.05, this.seed + 17);
    const d = hash2(tx, ty, this.seed + 3);
    if (e < 0.30) return 2;                 // lake / water
    if (e < 0.34) return 5;                 // beach
    if (m < 0.30) {                         // desert
      if (d < 0.03) return 4;
      if (d < 0.05) return 3;
      return 5;
    }
    if (m > 0.66) {                         // dense forest
      if (d < 0.42) return 3;
      if (d < 0.48) return 7;
      if (d < 0.50) return 4;
      return 0;
    }
    // plains / light woods
    if (d < 0.07) return 3;
    if (d < 0.13) return 7;
    if (d < 0.16) return 6;
    if (d < 0.175) return 4;
    return 0;
  }

  _villageTile(tx, ty) {
    const R = 46;
    const cx = Math.floor(tx / R), cy = Math.floor(ty / R);
    if (hash2(cx, cy, this.seed + 555) > 0.5) return null;   // ~half the regions have a village
    const ox = 12 + Math.floor(hash2(cx, cy, this.seed + 11) * (R - 24));
    const oy = 12 + Math.floor(hash2(cx, cy, this.seed + 22) * (R - 24));
    const vcx = cx * R + ox, vcy = cy * R + oy;
    const dx = tx - vcx, dy = ty - vcy;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return null;
    if (dx === 0 || dy === 0) return 1;                      // plaza cross
    if (Math.abs(dx) === 9 || Math.abs(dy) === 9) return 1;  // ring road
    const spots = [[-7, -6], [3, -7], [-8, 2], [4, 3], [-2, 5], [6, -2]];
    for (let i = 0; i < spots.length; i++) {
      const lx = dx - spots[i][0], ly = dy - spots[i][1];    // 0..2 within a 3×3 house
      if (lx >= 0 && lx <= 2 && ly >= 0 && ly <= 2) {
        if (ly === 0) return 9;                              // roof
        if (ly === 2 && lx === 1) return 10;                 // door
        if (ly === 1 && lx === 1) return 11;                 // window
        return 8;                                            // wall
      }
    }
    if (dx === 1 && dy === 1) return 13;                     // village sign
    return 0;                                                // village green
  }

  biomeName(tx, ty) {
    if (this._villageTile(tx, ty) !== null) return "Village";
    const e = fbm(tx * 0.045, ty * 0.045, this.seed);
    const m = fbm((tx + 500) * 0.05, (ty + 500) * 0.05, this.seed + 17);
    if (e < 0.30) return "Lakeside";
    if (e < 0.34) return "Beach";
    if (m < 0.30) return "Desert";
    if (m > 0.66) return "Deep Forest";
    return "Plains";
  }

  _tileSolid(tx, ty) { return SOLID.has(this.tileAt(tx, ty)); }

  // ---- spawns (bosses / entities / treasure) -----------------------------
  _spawnFor(gx, gy) {
    const key = gx + "," + gy;
    if (this._spawnCache.has(key)) return this._spawnCache.get(key);
    const s = this._computeSpawn(gx, gy, key);
    this._spawnCache.set(key, s);
    return s;
  }
  _computeSpawn(gx, gy, key) {
    if (Math.abs(gx) <= 1 && Math.abs(gy) <= 1) return null;   // keep spawn area calm
    if (this.run.defeated[key]) return null;
    const tx = gx * SPAWN_CELL + 2 + Math.floor(hash2(gx, gy, this.seed + 5) * (SPAWN_CELL - 4));
    const ty = gy * SPAWN_CELL + 2 + Math.floor(hash2(gx, gy, this.seed + 6) * (SPAWN_CELL - 4));
    if (this._tileSolid(tx, ty)) return null;                  // don't spawn in a tree/lake
    const dist = Math.hypot(tx, ty);
    const tier = Math.min(BOSS_ROSTER.length - 1, Math.floor(dist / TIER_TILES));
    const r = hash2(gx, gy, this.seed + 900);
    if (r < 0.03) {
      const t = Math.max(0, Math.min(BOSS_ROSTER.length - 1, tier + Math.floor(hash2(gx, gy, this.seed + 8) * 3) - 1));
      return { kind: "boss", key, tx, ty, def: bossForTier(t), tier: t };
    }
    if (r < 0.055) {
      return { kind: "treasure", key, tx, ty, jc: Math.round(40 + tier * 22 + hash2(gx, gy, this.seed + 9) * 130) };
    }
    if (r < 0.17) {
      const eidx = Math.floor(hash2(gx, gy, this.seed + 10) * ENTITIES.length);
      return { kind: "entity", key, tx, ty, def: entityForTier(eidx, tier), tier };
    }
    return null;
  }

  clearSpawn(key) {                 // called after a spawn is defeated/collected
    this.run.defeated[key] = 1;
    this._spawnCache.set(key, null);
    this.encounterLock = false;
    this._saveRun();
  }

  _saveRun() {
    this.run.px = this.px; this.run.py = this.py; this.run.steps = this.steps || 0;
    try { localStorage.setItem("jerkmania.profile.v1", JSON.stringify(this.profile)); } catch {}
  }

  _solidAt(x, y) {
    if (this.noclip) return false;
    return this._tileSolid(Math.floor(x / TILE), Math.floor(y / TILE));
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
    const spd = 64 * dt;
    const hw = 4;
    const nx = this.px + dx * spd;
    if (!this._solidAt(nx - hw, this.py + 6) && !this._solidAt(nx + hw, this.py + 6)) this.px = nx;
    const ny = this.py + dy * spd;
    if (!this._solidAt(this.px - hw, ny + 6) && !this._solidAt(this.px + hw, ny + 6)) this.py = ny;
    this.animT += dt * 8;
    this.steps = (this.steps || 0) + spd;
  }

  _checkEncounter() {
    if (this.encounterLock) return;
    const pgx = Math.floor((this.px / TILE) / SPAWN_CELL), pgy = Math.floor((this.py / TILE) / SPAWN_CELL);
    for (let gy = pgy - 1; gy <= pgy + 1; gy++) {
      for (let gx = pgx - 1; gx <= pgx + 1; gx++) {
        const s = this._spawnFor(gx, gy);
        if (!s) continue;
        const bx = s.tx * TILE + TILE / 2, by = s.ty * TILE + TILE / 2;
        if (Math.hypot(this.px - bx, this.py - by) < 11) {
          this.encounterLock = true;
          this._saveRun();
          this.onEncounter(s);
          return;
        }
      }
    }
  }

  runInfo() {
    const distTiles = Math.round(Math.hypot(this.px / TILE, this.py / TILE));
    return {
      seed: this.seed >>> 0,
      bossKills: this.run.bossKills || 0,
      entityKills: this.run.entityKills || 0,
      treasures: this.run.treasures || 0,
      dist: distTiles,
      tier: Math.floor(distTiles / TIER_TILES),
      biome: this.biomeName(Math.round(this.px / TILE), Math.round(this.py / TILE)),
    };
  }

  _loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now; this.t += dt; this._saveT += dt;
    this._move(dt);
    this._checkEncounter();
    this._draw();
    if (this._saveT > 2) { this._saveT = 0; this._saveRun(); }
    requestAnimationFrame(this._loop);
  }

  _draw() {
    const ctx = this.ctx;
    const camx = Math.round(this.px - this.vw / 2);
    const camy = Math.round(this.py - this.vh / 2);
    const x0 = Math.floor(camx / TILE) - 1, y0 = Math.floor(camy / TILE) - 1;
    const x1 = x0 + Math.ceil(this.vw / TILE) + 3, y1 = y0 + Math.ceil(this.vh / TILE) + 3;

    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        this._tile(tx, ty, tx * TILE - camx, ty * TILE - camy);

    // spawn sprites in view
    const gx0 = Math.floor(x0 / SPAWN_CELL) - 1, gx1 = Math.floor(x1 / SPAWN_CELL) + 1;
    const gy0 = Math.floor(y0 / SPAWN_CELL) - 1, gy1 = Math.floor(y1 / SPAWN_CELL) + 1;
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const s = this._spawnFor(gx, gy);
        if (!s) continue;
        this._spawnSprite(s, s.tx * TILE - camx, s.ty * TILE - camy);
      }

    this._player(Math.round(this.px - camx), Math.round(this.py - camy));
  }

  _tile(tx, ty, sx, sy) {
    const ctx = this.ctx;
    const t = this.tileAt(tx, ty);
    const alt = ((tx * 3 + ty * 5) % 2 + 2) % 2;
    if (t === 2) {
      ctx.fillStyle = C.water2; ctx.fillRect(sx, sy, TILE, TILE);
      ctx.fillStyle = C.water1;
      const off = (((Math.floor(this.t * 4) + tx) % 4) + 4) % 4;
      ctx.fillRect(sx, sy + off * 4, TILE, 2);
      ctx.fillStyle = C.waterFoam; ctx.globalAlpha = 0.5;
      if ((((tx + ty + Math.floor(this.t * 2)) % 5) + 5) % 5 === 0) ctx.fillRect(sx + 3, sy + 6, 4, 1);
      ctx.globalAlpha = 1; return;
    }
    ctx.fillStyle = alt ? C.grass1 : C.grass2; ctx.fillRect(sx, sy, TILE, TILE);
    ctx.fillStyle = C.grassEdge; if ((((tx * 7 + ty * 11) % 6) + 6) % 6 === 0) ctx.fillRect(sx + 3, sy + 11, 3, 1);

    switch (t) {
      case 1:
        ctx.fillStyle = C.path; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.path2; if (alt) ctx.fillRect(sx + 2, sy + 2, 3, 3);
        ctx.fillStyle = C.pathEdge; ctx.fillRect(sx, sy + TILE - 2, TILE, 2); break;
      case 5:
        ctx.fillStyle = C.sand; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#d8c088"; if (alt) ctx.fillRect(sx + 4, sy + 5, 2, 2); break;
      case 6:
        { const cols = [C.flowerR, C.flowerY, C.flowerW]; const c1 = cols[(((tx + ty) % 3) + 3) % 3];
          ctx.fillStyle = c1; ctx.fillRect(sx + 4, sy + 5, 3, 3); ctx.fillRect(sx + 9, sy + 9, 3, 3);
          ctx.fillStyle = "#ffe98a"; ctx.fillRect(sx + 5, sy + 6, 1, 1); ctx.fillRect(sx + 10, sy + 10, 1, 1); } break;
      case 7:
        { const sway = Math.sin(this.t * 4 + tx) > 0 ? 1 : 0;
          ctx.fillStyle = C.tall2; ctx.fillRect(sx, sy + 6, TILE, TILE - 6);
          ctx.fillStyle = C.tall1;
          for (let b = 0; b < 4; b++) { const bx = sx + 1 + b * 4 + sway; ctx.fillRect(bx, sy + 3, 2, 11); }
        } break;
      case 3:
        ctx.fillStyle = C.trunk; ctx.fillRect(sx + 6, sy + 11, 4, 5);
        ctx.fillStyle = C.treeDark; ctx.fillRect(sx + 2, sy + 3, 12, 9); ctx.fillRect(sx + 3, sy + 2, 10, 1); ctx.fillRect(sx + 3, sy + 12, 10, 1);
        ctx.fillStyle = C.tree; ctx.fillRect(sx + 3, sy + 3, 10, 7);
        ctx.fillStyle = C.treeHi; ctx.fillRect(sx + 4, sy + 4, 3, 2); ctx.fillRect(sx + 9, sy + 6, 2, 2); break;
      case 4:
        ctx.fillStyle = C.rockDark; ctx.fillRect(sx + 3, sy + 7, 10, 6);
        ctx.fillStyle = C.rock; ctx.fillRect(sx + 4, sy + 5, 8, 5);
        ctx.fillStyle = "#b6bcc8"; ctx.fillRect(sx + 5, sy + 6, 2, 1); break;
      case 8:
        ctx.fillStyle = C.wallDark; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE - 2);
        ctx.fillStyle = C.wallDark; for (let by = 2; by < TILE; by += 5) ctx.fillRect(sx, sy + by, TILE, 1); break;
      case 11:
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = "#5a8ab0"; ctx.fillRect(sx + 3, sy + 3, TILE - 6, TILE - 6);
        ctx.fillStyle = C.win; ctx.fillRect(sx + 4, sy + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = "#fff"; ctx.fillRect(sx + 4, sy + 4, 2, 2); break;
      case 9:
        ctx.fillStyle = C.roofDark; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.roof; ctx.fillRect(sx, sy + 2, TILE, TILE - 4);
        ctx.fillStyle = C.roofHi; ctx.fillRect(sx, sy + 2, TILE, 2);
        ctx.fillStyle = C.roofDark; for (let bx = 0; bx < TILE; bx += 4) ctx.fillRect(sx + bx, sy, 1, TILE); break;
      case 10:
        ctx.fillStyle = C.wall; ctx.fillRect(sx, sy, TILE, TILE);
        ctx.fillStyle = C.door; ctx.fillRect(sx + 3, sy + 2, TILE - 6, TILE - 2);
        ctx.fillStyle = "#ffd05a"; ctx.fillRect(sx + TILE - 6, sy + 8, 1, 2); break;
      case 12:
        ctx.fillStyle = C.fenceDark; ctx.fillRect(sx + 1, sy + 4, TILE - 2, 2); ctx.fillRect(sx + 1, sy + 9, TILE - 2, 2);
        ctx.fillStyle = C.fence; ctx.fillRect(sx + 2, sy + 2, 2, 11); ctx.fillRect(sx + TILE - 4, sy + 2, 2, 11); break;
      case 13:
        ctx.fillStyle = C.signPost; ctx.fillRect(sx + 7, sy + 8, 2, 6);
        ctx.fillStyle = C.sign; ctx.fillRect(sx + 2, sy + 2, TILE - 4, 7);
        ctx.fillStyle = "#5a3a1a"; ctx.fillRect(sx + 4, sy + 4, TILE - 8, 1); ctx.fillRect(sx + 4, sy + 6, TILE - 9, 1); break;
    }
  }

  _spawnSprite(s, sx, sy) {
    const ctx = this.ctx;
    const cx = sx + TILE / 2;
    const bob = Math.sin(this.t * 3 + s.tx * 0.7) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(sx + 3, sy + TILE - 2, TILE - 6, 2);

    if (s.kind === "treasure") {
      ctx.fillStyle = "#8a5f10"; ctx.fillRect(sx + 3, sy + 6 + bob, 10, 7);
      ctx.fillStyle = "#ffd05a"; ctx.fillRect(sx + 3, sy + 5 + bob, 10, 3);
      ctx.fillStyle = "#b8871a"; ctx.fillRect(sx + 7, sy + 6 + bob, 2, 6);
      ctx.fillStyle = "#fff8c4"; ctx.fillRect(sx + 7, sy + 8 + bob, 2, 1);
      return;
    }
    // boss = big red blob + "!" ; entity = smaller coloured blob
    const boss = s.kind === "boss";
    const cols = ["#ff5b6e", "#c9a0ff", "#ffd05a", "#9fe8ff", "#a6ff3a", "#ff9f3a", "#ff3d7f", "#b14dff"];
    const col = boss ? "#ff4d4d" : cols[(((s.tx * 3 + s.ty * 7) % cols.length) + cols.length) % cols.length];
    const w = boss ? 11 : 8, h = boss ? 12 : 9;
    const ox = sx + (TILE - w) / 2;
    ctx.fillStyle = col; ctx.fillRect(ox, sy + 2 + bob, w, h);
    ctx.fillStyle = "#000";
    ctx.fillRect(ox + 2, sy + 5 + bob, 2, 2); ctx.fillRect(ox + w - 4, sy + 5 + bob, 2, 2);
    ctx.fillStyle = "#fff"; ctx.fillRect(ox + 3, sy + 2 + h + bob - 3, w - 6, 1);
    if (boss) {
      const blink = Math.sin(this.t * 6) > 0;
      if (blink) { ctx.fillStyle = "#ffd05a"; ctx.fillRect(cx - 1, sy - 6, 2, 4); ctx.fillRect(cx - 1, sy - 1, 2, 2); }
    }
  }

  _player(x, y) {
    const ctx = this.ctx;
    const step = this.moving ? Math.floor(this.animT) % 2 : 0;
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x - 5, y + 8, 10, 2);
    ctx.fillStyle = "#2a2440";
    ctx.fillRect(x - 4, y + 5, 3, 3 + (step ? 1 : 0));
    ctx.fillRect(x + 1, y + 5, 3, 3 + (step ? 0 : 1));
    ctx.fillStyle = "#7b3dff"; ctx.fillRect(x - 5, y - 2, 10, 8);
    ctx.fillStyle = "#a06bff"; ctx.fillRect(x - 5, y - 2, 10, 2);
    ctx.fillStyle = "#22e0d6"; ctx.fillRect(x - 1, y, 2, 5);
    ctx.fillStyle = "#6a2fe0"; ctx.fillRect(x - 6, y - 1, 2, 5); ctx.fillRect(x + 4, y - 1, 2, 5);
    ctx.fillStyle = "#ffd9a8"; ctx.fillRect(x - 3, y - 8, 6, 6);
    ctx.fillStyle = "#ff2d6f"; ctx.fillRect(x - 4, y - 10, 8, 3);
    ctx.fillStyle = "#ff6a94"; ctx.fillRect(x - 3, y - 10, 3, 1);
    ctx.fillStyle = "#d81f57";
    if (this.dir === "down") ctx.fillRect(x - 3, y - 7, 6, 1);
    else if (this.dir === "left") ctx.fillRect(x - 6, y - 8, 3, 2);
    else if (this.dir === "right") ctx.fillRect(x + 3, y - 8, 3, 2);
    ctx.fillStyle = "#221830";
    if (this.dir === "down") { ctx.fillRect(x - 2, y - 5, 1, 2); ctx.fillRect(x + 1, y - 5, 1, 2); }
    else if (this.dir === "left") ctx.fillRect(x - 2, y - 5, 1, 2);
    else if (this.dir === "right") ctx.fillRect(x + 1, y - 5, 1, 2);
    const tx = Math.floor(this.px / TILE), ty = Math.floor((this.py + 6) / TILE);
    if (this.tileAt(tx, ty) === 7) {
      ctx.fillStyle = "#3f861f"; ctx.fillRect(x - 6, y + 6, 12, 4);
      ctx.fillStyle = "#5aa62f"; ctx.fillRect(x - 5 + step, y + 5, 2, 4); ctx.fillRect(x + 3 - step, y + 5, 2, 4);
    }
  }
}
