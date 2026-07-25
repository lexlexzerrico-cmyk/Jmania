/* ============================================================
   ui.js — screen templates + small view helpers
   ============================================================ */
import { LADDER, rankFromIndex, levelProgress, levelTitle, RR_PER_DIVISION } from "./ranks.js";
import { ACHIEVEMENTS, isUnlocked } from "./achievements.js";
import { comboToMult } from "./game.js";
import { EFFECTS, effectById, RARITY_COLOR } from "./fx.js";
import { BOSSES } from "./rpg.js";
import { gradeFor, GRADES } from "./grade.js";
import { TITLES, titleById, unlockedTitles, titleChip } from "./titles.js";
import { ensureQuests, questDef } from "./quests.js";
import {
  SKILLS, RARITIES, RARITY_ORDER, skillById, TYPES,
  SUMMON_COST, SUMMON_COST_10, PITY, DUST_VALUE, STARTER_LOADOUT,
} from "./goons.js";
import {
  dailyInfo, playtimeInfo, boostActive, boostRemainMin,
  BOOST_COST_GEMS, PREMIUM_COST_GEMS,
} from "./economy.js";

export const jcBadge = (size = 18) =>
  `<span class="jc-badge" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px">JC</span>`;

export const THEMES = [
  { key: "violet",  name: "Neon Violet", grad: "linear-gradient(135deg,#ff3d7f,#b14dff,#6a5bff)" },
  { key: "cyber",   name: "Cyber Cyan",  grad: "linear-gradient(135deg,#22e0d6,#4d7cff,#7b5bff)" },
  { key: "inferno", name: "Inferno",     grad: "linear-gradient(135deg,#ffb03a,#ff5b3a,#ff2d6f)" },
  { key: "toxic",   name: "Toxic",       grad: "linear-gradient(135deg,#a6ff3a,#3ee08a,#22c8b0)" },
  { key: "sunset",  name: "Sunset",      grad: "linear-gradient(135deg,#ffcf5a,#ff7a3d,#ff3d9f)" },
  { key: "ice",     name: "Arctic",      grad: "linear-gradient(135deg,#9fe8ff,#7fb0ff,#b8a8ff)" },
];

export const AVATARS = ["🫵", "😎", "🔥", "👑", "🤖", "🦾", "⚡", "🐐", "💪", "🎯", "👻", "🦊"];


export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============================================================
   Valorant-style rank emblem (custom inline SVG)
   Faceted metallic gem + division chevrons; Radiant gets rays.
   ============================================================ */
let _emblemSeq = 0;
export function rankEmblem(rank, size = 48) {
  const uid = `re${_emblemSeq++}`;
  const [hi, mid, lo] = rank.metal || ["#9aa0ab", "#5c626e", "#33373f"];

  // Faceted gem body (angular hexagon)
  const gem = "M50,5 L87,31 L75,71 L50,90 L25,71 L13,31 Z";
  const facetTop = "M50,5 L87,31 L50,48 L13,31 Z";       // top-lit face
  const facetLeft = "M13,31 L50,48 L50,90 L25,71 Z";     // shaded left
  const facetRight = "M87,31 L75,71 L50,90 L50,48 Z";    // mid right

  // Division chevrons (1–3) or Radiant rays
  let marks = "";
  if (rank.isRadiant) {
    let rays = "";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x1 = 50 + Math.cos(a) * 44, y1 = 46 + Math.sin(a) * 44;
      const x2 = 50 + Math.cos(a) * 56, y2 = 46 + Math.sin(a) * 56;
      const a2 = a + 0.06, a3 = a - 0.06;
      const bx = 50 + Math.cos(a2) * 44, by = 46 + Math.sin(a2) * 44;
      const cx = 50 + Math.cos(a3) * 44, cy = 46 + Math.sin(a3) * 44;
      rays += `<path d="M${bx.toFixed(1)},${by.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)} L${cx.toFixed(1)},${cy.toFixed(1)} Z" fill="url(#${uid}g)" opacity="0.9"/>`;
    }
    marks = rays;
  } else {
    const n = rank.division || 1;
    const xs = n === 3 ? [36, 50, 64] : n === 2 ? [43, 57] : [50];
    marks = xs.map((cx) =>
      `<path d="M${cx - 9},101 L${cx},92 L${cx + 9},101 L${cx},97 Z" fill="${hi}" stroke="${lo}" stroke-width="1"/>`
    ).join("");
  }

  return `
  <svg class="rank-svg" viewBox="0 0 100 112" width="${size}" height="${size * 1.12}" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}g" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="${hi}"/>
        <stop offset="0.5" stop-color="${mid}"/>
        <stop offset="1" stop-color="${lo}"/>
      </linearGradient>
      <radialGradient id="${uid}c" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${rank.isRadiant ? `<circle cx="50" cy="46" r="30" fill="url(#${uid}c)"/>` : ""}
    ${marks}
    <path d="${gem}" fill="url(#${uid}g)" stroke="${hi}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="${facetTop}" fill="${hi}" opacity="0.45"/>
    <path d="${facetLeft}" fill="${lo}" opacity="0.35"/>
    <path d="${facetRight}" fill="${mid}" opacity="0.25"/>
    <path d="M50,5 L50,90" stroke="${lo}" stroke-width="0.8" opacity="0.4"/>
    <path d="M13,31 L87,31" stroke="${hi}" stroke-width="0.8" opacity="0.35"/>
    ${rank.isRadiant ? `<circle cx="50" cy="46" r="6" fill="#fff"/>` : ""}
  </svg>`;
}

export function toast(msg, icon = "✨") {
  const host = $("#toast-host");
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="t-ic">${icon}</span><span>${msg}</span>`;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

// ---- Top-bar HUD -----------------------------------------------------------
export function renderHud(profile) {
  const lp = levelProgress(profile.xp);
  const rank = rankFromIndex(profile.rankIndex);
  const boost = boostActive(profile);
  return `
    <div class="hud-cash" data-nav="shop" title="Open shop">
      ${jcBadge(20)}<span class="cash-num">${(profile.jc || 0).toLocaleString()}</span>
      <span class="gem-ic">💎</span><span class="cash-num">${(profile.gems || 0).toLocaleString()}</span>
      ${boost ? `<span class="boost-pill" title="2x JC boost active">2×</span>` : ""}
      ${profile.premium ? `<span class="prem-pill" title="Premium">★</span>` : ""}
    </div>
    ${profile.adminUnlocked ? `<button class="hud-gear" data-nav="admin" title="Admin panel" aria-label="Admin panel">🛠️</button>` : ""}
    <div class="hud-level" data-nav="ranks" title="View progression">
      <div class="lvl-badge">${lp.level}</div>
      <div class="lvl-meta">
        <span class="lvl-name">${levelTitle(lp.level)}</span>
        <span class="lvl-xp">${lp.into} / ${lp.span} XP</span>
      </div>
    </div>
    <div class="hud-rank" data-nav="ranks" title="View rank">
      <span class="rank-emblem">${rankEmblem(rank, 30)}</span>
      <div class="rank-meta">
        <span class="rank-name">${rank.label}</span>
        <span class="rank-rr">${profile.rr} RR</span>
      </div>
    </div>
    <button class="hud-gear" data-nav="settings" title="Settings" aria-label="Settings">⚙️</button>`;
}

// ---- Lobby -----------------------------------------------------------------
export function renderLobby(profile) {
  const s = profile.stats;
  const winrate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
  const unlocked = (profile.achievements || []).length;
  return `
  <section class="screen">
    <div class="hero">
      <span class="kicker">🎧 Lobby online · music ready</span>
      <h1><span class="hero-av">${profile.settings?.avatar || "🫵"}</span> Welcome back, <span class="g">${escapeHtml(profile.name || "Player")}</span></h1>
      ${profile.equippedTitle ? `<div class="hero-title">${titleChip(titleById(profile.equippedTitle), true)}</div>` : ""}
      <p class="lead">The AI clap-speed arena. Turn on your mic, clap as fast as your hands can go, and let the neural onset detector turn raw applause into raw score. Climb from Iron to Radiant.</p>
      <div class="hero-cta">
        <button class="btn big" data-play="ranked">🏆 Play Ranked</button>
        <button class="btn ghost big" data-play="practice">🎯 Practice</button>
      </div>
    </div>

    <div class="section-title"><h2>Game Modes</h2><span class="sub">pick your battlefield</span></div>
    <div class="mode-grid">
      <div class="mode-card ranked" data-play="ranked">
        <span class="mc-tag">Competitive</span>
        <div class="mc-icon">🏆</div>
        <h3>Ranked</h3>
        <p>Every clap counts. Win to gain RR and climb divisions toward Radiant. Lose and drop.</p>
        <div class="mc-go">Enter queue <span class="arrow">→</span></div>
      </div>
      <div class="mode-card classic" data-play="classic">
        <span class="mc-tag">Casual</span>
        <div class="mc-icon">⚡</div>
        <h3>Classic</h3>
        <p>A clean 30-second sprint. No pressure — just you, your hands, and a high score to beat.</p>
        <div class="mc-go">Quick play <span class="arrow">→</span></div>
      </div>
      <div class="mode-card duel" data-play="duel">
        <span class="mc-tag">vs AI</span>
        <div class="mc-icon">🤖</div>
        <h3>Duel (AI)</h3>
        <p>Clash against a bot rival scaled to your rank. Drain their lightning bar to knock them out.</p>
        <div class="mc-go">Fight AI <span class="arrow">→</span></div>
      </div>
      <div class="mode-card" style="--mc:rgba(34,224,214,0.32)" data-play="versus">
        <span class="mc-tag">vs Player</span>
        <div class="mc-icon">🤜🤛</div>
        <h3>Versus (2P)</h3>
        <p>Real 1v1 on one device. Left player mashes <b>A</b>, right player mashes <b>L</b> — first to knock the other out wins.</p>
        <div class="mc-go">Local battle <span class="arrow">→</span></div>
      </div>
      <div class="mode-card practice" data-play="practice">
        <span class="mc-tag">Free play</span>
        <div class="mc-icon">🎯</div>
        <h3>Practice</h3>
        <p>Endless, no timer, no stakes. Warm up, tune your mic, and chase your top CPS.</p>
        <div class="mc-go">Warm up <span class="arrow">→</span></div>
      </div>
      <div class="mode-card" style="--mc:rgba(255,61,127,0.3)" data-nav="world">
        <span class="mc-tag">${profile.rpgBeaten || 0}/${BOSSES.length} bosses</span>
        <div class="mc-icon">🗺️</div>
        <h3>JerkWorld</h3>
        <p>The boss-rush RPG. Clap down Jerkling, Clapzilla, the Palmfather… all the way to OMEGA JERKGOD.</p>
        <div class="mc-go">Enter world <span class="arrow">→</span></div>
      </div>
      <div class="mode-card" style="--mc:rgba(255,208,90,0.3)" data-nav="shop">
        <span class="mc-tag">${(profile.jc || 0).toLocaleString()} JC</span>
        <div class="mc-icon">🛒</div>
        <h3>Shop</h3>
        <p>Spend Jerk Coins on auras — fire, ice, thunder, void — each with its own clap effects and sounds.</p>
        <div class="mc-go">Browse <span class="arrow">→</span></div>
      </div>
      <div class="mode-card" style="--mc:rgba(255,61,159,0.32)" data-nav="summon">
        <span class="mc-tag">${Object.keys(profile.goons?.owned || {}).length}/${SKILLS.length}</span>
        <div class="mc-icon">🃏</div>
        <h3>Goon Skills</h3>
        <p>Collect animated skill cards, equip a 3-slot loadout, and change how every match plays. Summon with Clap Coins.</p>
        <div class="mc-go">Summon <span class="arrow">→</span></div>
      </div>
      <div class="mode-card custom" data-play="custom">
        <span class="mc-tag">Your rules</span>
        <div class="mc-icon">🎛️</div>
        <h3>Custom</h3>
        <p>Set the duration and difficulty. Build a marathon or a 10-second frenzy of pure clapping.</p>
        <div class="mc-go">Configure <span class="arrow">→</span></div>
      </div>
      <div class="mode-card" style="--mc:rgba(255,208,90,0.26)" data-nav="achievements">
        <span class="mc-tag">${unlocked}/${ACHIEVEMENTS.length}</span>
        <div class="mc-icon">🏅</div>
        <h3>Achievements</h3>
        <p>Unlock badges for speed, knockouts, ranks and milestones. Track your legend.</p>
        <div class="mc-go">View badges <span class="arrow">→</span></div>
      </div>
    </div>

    ${renderRewardRow(profile)}

    ${renderQuests(profile)}

    <div class="stat-strip">
      <div class="stat-box"><div class="v">${s.bestScore.toLocaleString()}</div><div class="l">Best Score</div></div>
      <div class="stat-box"><div class="v">${s.bestCps}</div><div class="l">Top CPS</div></div>
      <div class="stat-box"><div class="v">x${comboToMult(s.bestCombo).toFixed(1)}</div><div class="l">Best Combo</div></div>
      <div class="stat-box"><div class="v">${winrate}%</div><div class="l">Win Rate</div></div>
      <div class="stat-box"><div class="v">${s.totalClaps.toLocaleString()}</div><div class="l">Total Claps</div></div>
    </div>

    ${renderHistory(profile)}

    <div class="center" style="margin-top:30px">
      <button class="btn ghost secret-keyhole" id="secret-keyhole" title="Something's here…">🔑</button>
    </div>
  </section>`;
}

function renderQuests(profile) {
  const q = ensureQuests(profile);
  const cards = q.items.map((item) => {
    const def = questDef(item.id);
    if (!def) return "";
    const done = item.prog >= def.target;
    return `
      <div class="quest-card ${done && !item.claimed ? "ready" : ""} ${item.claimed ? "claimed" : ""}">
        <div class="quest-body">
          <div class="quest-desc">${def.desc}</div>
          <div class="quest-bar"><i style="width:${Math.round((item.prog / def.target) * 100)}%"></i></div>
          <div class="quest-prog">${Math.min(item.prog, def.target)}/${def.target}</div>
        </div>
        <div class="quest-reward">
          ${item.claimed ? `<span class="quest-done">✓</span>` : `<button class="btn ${done ? "" : "ghost"}" data-claim-quest="${item.id}" ${done ? "" : "disabled"}>${jcBadge(15)} ${def.reward}</button>`}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="section-title" style="margin-top:30px"><h2 style="font-size:22px">Daily Quests</h2><span class="sub">resets every day</span></div>
    <div class="quest-grid">${cards}</div>`;
}

function renderRewardRow(profile) {
  const d = dailyInfo(profile);
  const pt = playtimeInfo(profile);
  const boost = boostActive(profile);
  return `
  <div class="reward-strip">
    <div class="rw-card ${d.claimable ? "ready" : ""}">
      <div class="rw-ic">📅</div>
      <div class="rw-body">
        <div class="rw-title">Daily Reward${d.streak > 1 ? ` · ${d.streak}🔥` : ""}</div>
        <div class="rw-sub">${d.claimable ? `${d.reward} JC waiting` : "Come back tomorrow"}</div>
      </div>
      <button class="btn ${d.claimable ? "" : "ghost"}" id="claim-daily" ${d.claimable ? "" : "disabled"}>${d.claimable ? "Claim" : "✓"}</button>
    </div>
    <div class="rw-card ${pt.chunks > 0 ? "ready" : ""}">
      <div class="rw-ic">⏱️</div>
      <div class="rw-body">
        <div class="rw-title">Playtime Reward</div>
        <div class="rw-sub">${pt.chunks > 0 ? `${pt.reward} JC ready` : `${pt.remainMin} min to next 50 JC`}</div>
        <div class="rw-bar"><i style="width:${Math.round(pt.progress * 100)}%"></i></div>
      </div>
      <button class="btn ${pt.chunks > 0 ? "" : "ghost"}" id="claim-playtime" ${pt.chunks > 0 ? "" : "disabled"}>${pt.chunks > 0 ? "Claim" : "…"}</button>
    </div>
    ${boost ? `
    <div class="rw-card ready">
      <div class="rw-ic">⚡</div>
      <div class="rw-body">
        <div class="rw-title">2× JC Boost</div>
        <div class="rw-sub">${boostRemainMin(profile)} min remaining</div>
      </div>
    </div>` : ""}
  </div>`;
}

function renderHistory(profile) {
  const h = profile.history || [];
  if (!h.length) return "";
  const rows = h.map((m) => {
    const icon = m.practice ? "🎯" : m.hasOpponent ? (m.won ? "🏆" : "💀") : "⚡";
    const label = m.practice ? "Practice"
      : m.mode === "ranked" ? "Ranked"
      : m.mode === "duel" ? "Duel"
      : m.mode === "custom" ? "Custom" : "Classic";
    const detail = m.hasOpponent
      ? `<span class="mh-outcome ${m.won ? "win" : "loss"}">${m.won ? (m.knockout ? "KO win" : "Win") : "Loss"}</span> · ${m.youBar ?? "?"}%–${m.foeBar ?? "?"}% vs ${escapeHtml(m.botName || "Rival")}`
      : `${m.score.toLocaleString()} pts · ${m.peakCps} peak CPS`;
    return `<div class="mh-row"><span class="mh-ic">${icon}</span><span class="mh-mode">${label}</span><span class="mh-detail">${detail}</span></div>`;
  }).join("");
  return `
    <div class="section-title" style="margin-top:30px"><h2 style="font-size:22px">Recent Matches</h2></div>
    <div class="mh-list">${rows}</div>`;
}

// ---- Ranks / progression ---------------------------------------------------
export function renderRanks(profile) {
  const rank = rankFromIndex(profile.rankIndex);
  const lp = levelProgress(profile.xp);
  const rows = LADDER.map((r, i) => `
    <div class="rank-row ${i === profile.rankIndex ? "current" : ""}">
      <span class="rr-emblem">${rankEmblem(r, 40)}</span>
      <span class="rr-name">${r.label}</span>
      <span class="rr-band">${i === profile.rankIndex ? `${profile.rr} RR` : (i < profile.rankIndex ? "unlocked" : "locked")}</span>
    </div>`).reverse().join("");

  return `
  <section class="screen">
    <div class="section-title"><h2>Progression</h2><span class="sub">rank & level</span></div>

    <div class="rank-hero" style="--rank-glow:${rank.glow}">
      <div class="rank-emblem-big">${rankEmblem(rank, 96)}</div>
      <div class="rh-info">
        <div class="rh-tier">${rank.label}</div>
        <div class="rh-rr-track"><i style="width:${profile.rr}%"></i></div>
        <div class="rh-rr-num">${profile.rr} / ${RR_PER_DIVISION} RR to next division</div>
      </div>
      <div class="rh-info">
        <div class="rh-tier">Lv ${lp.level} · ${levelTitle(lp.level)}</div>
        <div class="rh-rr-track"><i style="width:${Math.round(lp.pct*100)}%;background:var(--grad-hot)"></i></div>
        <div class="rh-rr-num">${lp.into} / ${lp.span} XP to Lv ${lp.level + 1}</div>
      </div>
    </div>

    <div class="section-title"><h2 style="font-size:22px">The Ladder</h2></div>
    <div class="rank-ladder">${rows}</div>

    <div class="center mt-24">
      <button class="btn ghost" data-nav="lobby">← Back to lobby</button>
    </div>
  </section>`;
}

// ---- Custom setup ----------------------------------------------------------
export function renderCustomSetup() {
  return `
  <section class="screen setup">
    <div class="section-title"><h2>Custom Match</h2><span class="sub">your rules</span></div>
    <div class="setup-card">
      <div class="field">
        <label>Duration</label>
        <div class="chip-row" id="dur-row">
          <div class="chip" data-dur="10">10s</div>
          <div class="chip active" data-dur="30">30s</div>
          <div class="chip" data-dur="60">60s</div>
          <div class="chip" data-dur="120">2 min</div>
        </div>
      </div>
      <div class="field">
        <label>Opponent</label>
        <div class="chip-row" id="foe-row">
          <div class="chip active" data-foe="none">Solo (beat your score)</div>
          <div class="chip" data-foe="bot">AI Rival</div>
        </div>
      </div>
      <div class="field" id="skill-field">
        <label>Rival difficulty · <span class="val-read" id="skill-read">5.0 CPS</span></label>
        <input type="range" id="skill-range" min="3" max="9" step="0.5" value="5" />
      </div>
      <div class="row">
        <button class="btn wide big" id="custom-start">Start Match →</button>
      </div>
      <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Back</button></div>
    </div>
  </section>`;
}

// ---- Achievements ----------------------------------------------------------
export function renderAchievements(profile) {
  const unlocked = (profile.achievements || []).length;
  const cards = ACHIEVEMENTS.map((a) => {
    const got = isUnlocked(profile, a.id);
    return `
      <div class="ach-card ${got ? "got" : "locked"}">
        <div class="ach-ic">${got ? a.icon : "🔒"}</div>
        <div class="ach-body">
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
        ${got ? '<div class="ach-check">✓</div>' : ""}
      </div>`;
  }).join("");
  return `
  <section class="screen">
    <div class="section-title"><h2>Achievements</h2><span class="sub">${unlocked} / ${ACHIEVEMENTS.length} unlocked</span></div>
    <div class="ach-grid">${cards}</div>
    <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Back to lobby</button></div>
  </section>`;
}

// Effects that support a custom user-uploaded image/GIF, with friendly names.
export const ART_SLOTS = [
  { id: "susanoo", name: "Spectral Guardian (Susanoo)" },
  { id: "chakra",  name: "Nine-Tailed Cloak" },
  { id: "domain",  name: "Domain Expansion" },
  { id: "void",    name: "Void Walker (black hole)" },
  { id: "galaxy",  name: "Galaxy" },
  { id: "katana",  name: "Katana" },
  { id: "bankai",  name: "Crimson Bankai" },
];

function renderCustomArt(profile) {
  if (!profile.adminUnlocked) return "";   // admin-only feature
  const art = profile.customArt || {};
  const rows = ART_SLOTS.map((slot) => {
    const has = !!art[slot.id];
    return `
      <div class="art-slot">
        <div class="art-thumb">${has ? `<img src="${art[slot.id]}" alt="" />` : "🖼️"}</div>
        <div class="art-info">
          <div class="art-name">${slot.name}</div>
          <div class="art-sub">${has ? "Custom art active" : "Using the built-in effect"}</div>
        </div>
        <input type="file" accept="image/*" id="art-in-${slot.id}" class="art-file" hidden />
        <label for="art-in-${slot.id}" class="btn ghost art-choose">${has ? "Replace" : "Choose"}</label>
        ${has ? `<button class="btn ghost art-remove" data-art-remove="${slot.id}">✕</button>` : ""}
      </div>`;
  }).join("");
  return `
    <div class="field" style="margin-top:22px">
      <label>🖼️ Custom Effect Art <span class="sub" style="font-size:11px">use your own image or GIF</span></label>
      <div class="art-note">Pick an image/GIF from your device — it plays as that clap effect. Stored only on your device. Use art you own or that's free to use. GIFs animate; keep files under ~4 MB.</div>
      <div class="art-list">${rows}</div>
    </div>`;
}

// ---- Settings --------------------------------------------------------------
export function renderSettings(profile) {
  const st = profile.settings;
  const toggle = (id, on, label, desc) => `
    <div class="set-row">
      <div class="set-info"><div class="set-label">${label}</div><div class="set-desc">${desc}</div></div>
      <button class="switch ${on ? "on" : ""}" id="${id}" role="switch" aria-checked="${on}"><span></span></button>
    </div>`;
  return `
  <section class="screen setup">
    <div class="section-title"><h2>Settings</h2><span class="sub">profile & audio</span></div>
    <div class="setup-card">
      <div class="field">
        <label>Display name</label>
        <input type="text" id="name-input" class="text-input" maxlength="18" value="${escapeHtml(profile.name || "Player")}" placeholder="Your name" />
      </div>

      <div class="field">
        <label>Avatar</label>
        <div class="avatar-row" id="avatar-row">
          ${AVATARS.map((a) => `<button class="avatar-chip ${a === (st.avatar || "🫵") ? "active" : ""}" data-avatar="${a}">${a}</button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>Title <span class="sub" style="font-size:11px">shown under your name</span></label>
        <div class="title-row" id="title-row">
          <button class="title-pick ${!profile.equippedTitle ? "active" : ""}" data-title="">None</button>
          ${unlockedTitles(profile, levelProgress(profile.xp).level).map((t) =>
            `<button class="title-pick ${profile.equippedTitle === t.id ? "active" : ""}" data-title="${t.id}">${titleChip(t)}</button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>Theme</label>
        <div class="theme-row" id="theme-row">
          ${THEMES.map((t) => `
            <button class="theme-chip ${t.key === (st.theme || "violet") ? "active" : ""}" data-theme-key="${t.key}" title="${t.name}">
              <span class="theme-swatch" style="background:${t.grad}"></span>
              <span class="theme-name">${t.name}</span>
            </button>`).join("")}
        </div>
      </div>

      <div class="field">
        <label>Mic sensitivity · <span class="val-read" id="set-sens-read">${Math.round(st.sensitivity * 100)}%</span></label>
        <input type="range" id="set-sens" min="0" max="1" step="0.01" value="${st.sensitivity}" />
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="recalibrate" style="font-size:13px">🎚️ Recalibrate mic</button></div>
      </div>
      ${toggle("set-music", st.musicOn, "Lobby music", "Procedural synth-wave loop")}
      ${toggle("set-sfx", st.sfxOn, "Sound effects", "Claps, countdown, knockout & win cues")}
      ${toggle("set-mute", st.muteAll, "Mute everything", "Silence all music and sound")}
      ${toggle("set-cam", st.camOn, "Webcam window", "Show your live camera while playing")}
      ${toggle("set-motion", st.reducedMotion, "Reduced motion", "Fewer particles & screen effects (accessibility)")}

      ${renderCustomArt(profile)}

      <div class="danger-zone">
        <div class="set-label" style="color:var(--bad)">Danger zone</div>
        <button class="btn ghost" id="reset-btn" style="border-color:var(--bad);color:var(--bad);margin-top:10px">🗑️ Reset all progress</button>
      </div>

      <div class="center" style="margin-top:18px">
        <button class="btn ghost" id="admin-access" style="font-size:12px;opacity:0.6">🛠️ Developer access</button>
      </div>

      <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Back</button></div>
    </div>
  </section>`;
}

// ---- Mic / calibration panel ----------------------------------------------
export function renderMicPanel(modeLabel, sensitivity, supported) {
  return `
  <section class="screen">
    <div class="mic-panel">
      <div class="mic-icon">🎙️</div>
      <h3>${modeLabel} · Choose your input</h3>
      <p><b>🎙️ Clap Mode</b> — real claps through your mic, detected by onset analysis. <b>⌨️ Keyboard Mode</b> is a totally different game: you "clap" by <b>alternating F and J like two hands</b> (or tapping left/right sides) — mashing one key does nothing. Pick your style.</p>
      <div class="mic-level"><i id="mic-level-fill"></i></div>
      <div class="sens-row">
        <label>Sensitivity</label>
        <input type="range" id="sens-range" min="0" max="1" step="0.01" value="${sensitivity}" />
      </div>
      <div class="row mt-24" style="justify-content:center">
        <button class="btn big" id="mic-enable">🎙️ Clap Mode (mic)</button>
        <button class="btn big cyan" id="mic-keyboard">⌨️ Keyboard Mode</button>
      </div>
      <div class="row center" style="margin-top:12px; gap:10px">
        <button class="btn ghost" id="mic-cam">📷 Turn on webcam</button>
      </div>
      <div class="no-mic-note" id="mic-note">${supported ? "Tip: in a noisy room, lower sensitivity — or use Keyboard Mode." : "No microphone here — Keyboard Mode (alternate F/J) will be used."}</div>
      <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Cancel</button></div>
    </div>
  </section>`;
}

// Vertical lightning bolt used as the clash divider.
const BOLT_SVG = `<svg viewBox="0 0 60 150" preserveAspectRatio="none" aria-hidden="true">
  <path d="M35 -2 L19 66 L31 66 L16 152 L46 60 L32 60 Z" fill="#eaffff"/>
</svg>`;

// ---- Arena -----------------------------------------------------------------
export function renderArena(cfg, profile) {
  const arenaTop = `
    <div class="arena-top">
      <div class="mode-badge">${cfg.label}</div>
      <div class="timer-ring">
        <svg width="108" height="108">
          <circle cx="54" cy="54" r="48" stroke="rgba(255,255,255,0.08)" stroke-width="8" fill="none"/>
          <circle id="timer-arc" cx="54" cy="54" r="48" stroke="url(#tg)" stroke-width="8" fill="none"
            stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="0"/>
          <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22e0d6"/><stop offset="1" stop-color="#b14dff"/>
          </linearGradient></defs>
        </svg>
        <div class="t-text" id="timer-text">${cfg.duration}</div>
      </div>
    </div>`;

  // -------- 1v1 CLASH layout (tug-of-war bar with lightning) --------
  if (cfg.bot) {
    return `
    <section class="screen arena">
      ${arenaTop}

      <div class="clash-arena">
        <div class="clash-heads">
          <div class="clash-head you">
            <span class="ch-av">${profile.settings?.avatar || "🫵"}</span>
            <div>
              <div class="ch-name">${escapeHtml(profile.name || "You")}</div>
              <div class="ch-cps"><b id="you-cps">0</b> cps</div>
            </div>
          </div>
          <div class="clash-head foe">
            <span class="ch-av">🤖</span>
            <div>
              <div class="ch-name">${cfg.bot.name}</div>
              <div class="ch-cps"><b id="foe-cps">0</b> cps</div>
            </div>
          </div>
        </div>

        <div class="clash-bar">
          <div class="clash-fill you" id="clash-you" style="width:50%">
            <span class="cf-king">👑</span><span class="cf-pct" id="you-pct">50</span>
          </div>
          <div class="clash-fill foe" id="clash-foe" style="width:50%">
            <span class="cf-king">👑</span><span class="cf-pct" id="foe-pct">50</span>
          </div>
          <div class="clash-bolt" id="clash-bolt" style="left:50%">${BOLT_SVG}</div>
        </div>

        <div class="clash-tagline">⚡ Clap faster to push the lightning — drain their bar to <b>KNOCKOUT</b>!</div>
      </div>

      <div class="clap-stage" style="max-width:520px;padding:22px 24px;margin-top:22px">
        <div class="clap-emoji" id="clap-emoji" style="font-size:clamp(60px,13vw,100px)">👏</div>
        <div class="combo-wrap">
          <div class="combo-line">
            <span class="combo-x" id="combo-x">x1.0</span>
            <span class="combo-txt">multiplier — sustain speed for a harder shove</span>
          </div>
        </div>
        <div class="cps-meter">
          <div class="cps-track"><div class="cps-fill" id="cps-fill"></div></div>
          <div class="cps-labels"><span>your claps / sec</span><span class="cps-now" id="cps-now">0</span></div>
        </div>
      </div>

      <div class="center mt-24">
        <button class="btn ghost" id="arena-quit">Forfeit</button>
      </div>
    </section>`;
  }

  // -------- Solo layout (high-score) --------
  return `
  <section class="screen arena">
    ${arenaTop}

    <div class="clap-stage">
      <div class="clap-emoji" id="clap-emoji">👏</div>
      <div class="score-label">Score</div>
      <div class="score-huge" id="score-huge">0</div>

      <div class="combo-wrap">
        <div class="combo-line">
          <span class="combo-x" id="combo-x">x1.0</span>
          <span class="combo-txt">multiplier — clap faster to raise it</span>
        </div>
      </div>

      <div class="cps-meter">
        <div class="cps-track"><div class="cps-fill" id="cps-fill"></div></div>
        <div class="cps-labels">
          <span>claps / sec</span>
          <span class="cps-now" id="cps-now">0</span>
        </div>
      </div>
    </div>

    <div class="center mt-24">
      <button class="btn ${cfg.endless ? "" : "ghost"}" id="arena-quit">${cfg.endless ? "✓ Finish Practice" : "Forfeit"}</button>
    </div>
  </section>`;
}

// ---- Results ---------------------------------------------------------------
export function renderResults(result, report, snapshot = null, jcReport = null) {
  const rc = report.rankChange;
  const rankLine = (result.ranked && !result.practice)
    ? (rc === 1
        ? `<div class="reward"><span class="r-ic">⬆️</span><div class="r-body"><div class="r-title">Promoted to ${report.rankAfter.label}!</div></div></div>`
        : rc === -1
        ? `<div class="reward"><span class="r-ic">⬇️</span><div class="r-body"><div class="r-title">Demoted to ${report.rankAfter.label}</div></div></div>`
        : "")
    : "";

  const verdict = result.practice
    ? "NICE WARMUP"
    : result.hasOpponent
    ? (result.knockout ? (result.won ? "KNOCKOUT!" : "KNOCKED OUT") : (result.won ? "VICTORY" : "DEFEAT"))
    : "MATCH COMPLETE";
  const verdictClass = (result.hasOpponent && !result.won) ? "loss" : "win";

  // 1v1: show the final clash bar; solo/practice: show the score.
  const hero = result.hasOpponent
    ? `<div class="res-clash">
         <div class="clash-bar" style="height:80px;margin-top:14px">
           <div class="clash-fill you" style="width:${result.youBar}%"><span class="cf-pct" style="left:16px;font-size:20px">${result.youBar}%</span></div>
           <div class="clash-fill foe" style="width:${result.foeBar}%"><span class="cf-pct" style="right:16px;font-size:20px">${result.foeBar}%</span></div>
           <div class="clash-bolt" style="left:${result.youBar}%">${BOLT_SVG}</div>
         </div>
         <div class="clash-tagline" style="margin-top:12px">You <b>${result.youBar}%</b> · ${result.botName} <b>${result.foeBar}%</b></div>
       </div>`
    : `<div class="res-score">${result.score.toLocaleString()}</div>`;

  const snap = snapshot
    ? `<div class="res-snap">
         <img src="${snapshot}" alt="Victory snapshot" />
         <div class="snap-cap">📸 Winner's snapshot</div>
         <a class="btn ghost snap-dl" href="${snapshot}" download="jerkmania-victory.png">⬇️ Save photo</a>
       </div>`
    : "";

  const g = gradeFor(result);
  const gradeBadge = `
    <div class="grade-badge" style="--gc:${g.color}">
      <div class="grade-letter">${g.key}</div>
      <div class="grade-label">${g.label}</div>
    </div>`;

  // "You were 0.4 CPS from A" near-miss line
  const nextGrade = [...GRADES].reverse().find((x) => x.min > g.pct);
  let nearMiss = "";
  if (nextGrade) {
    const needPct = nextGrade.min - g.pct;
    const cpsGap = (needPct / 100 * 12 / 0.4).toFixed(1); // rough CPS equivalent
    nearMiss = `<div class="near-miss">You were <b style="color:${nextGrade.color}">${cpsGap} CPS</b> from grade <b style="color:${nextGrade.color}">${nextGrade.key}</b></div>`;
  }

  // score breakdown (perfect / burst bonuses)
  const bd = result.breakdown;
  const breakdown = (bd && (bd.perfect || bd.burst) && !result.hasOpponent)
    ? `<div class="score-bd">
         <span>Base ${(bd.base - bd.perfect).toLocaleString()}</span>
         ${bd.burst ? `<span class="bd-burst">Burst +${bd.burst.toLocaleString()}</span>` : ""}
         ${bd.perfect ? `<span class="bd-perfect">Perfect ×${result.perfects} +${bd.perfect}</span>` : ""}
       </div>`
    : "";

  return `
  <section class="screen results">
    <div class="res-card">
      ${gradeBadge}
      <div class="res-verdict ${verdictClass}">${verdict}</div>
      ${hero}
      ${nearMiss}
      ${breakdown}
      ${snap}

      <div class="res-grid" style="margin-top:22px">
        <div class="rb"><div class="v">${result.totalClaps}</div><div class="l">Claps</div></div>
        <div class="rb"><div class="v">${result.peakCps}</div><div class="l">Peak CPS</div></div>
        <div class="rb"><div class="v">${result.perfects || 0}</div><div class="l">Perfects</div></div>
      </div>

      ${renderGoonResults(result)}

      <div class="reward-row">
        ${jcReport ? `
        <div class="reward">
          <span class="r-ic">${jcBadge(24)}</span>
          <div class="r-body">
            <div class="r-title">Jerk Coins${jcReport.mult > 1 ? ` <span style="color:var(--gold)">×${jcReport.mult} active</span>` : ""}</div>
          </div>
          <span class="r-delta up">+${jcReport.total.toLocaleString()}</span>
        </div>` : ""}
        <div class="reward xp">
          <span class="r-ic">⭐</span>
          <div class="r-body">
            <div class="r-title">Level ${report.after.level} · ${levelTitle(report.after.level)}</div>
            <div class="r-bar"><i id="xp-bar"></i></div>
          </div>
          <span class="r-delta up">+${report.xpGain}</span>
        </div>
        ${result.ranked ? `
        <div class="reward rr">
          <span class="r-ic">${rankEmblem(report.rankAfter, 30)}</span>
          <div class="r-body">
            <div class="r-title">${report.rankAfter.label} · ${report.after.rr} RR</div>
            <div class="r-bar"><i id="rr-bar"></i></div>
          </div>
          <span class="r-delta ${report.rrDelta >= 0 ? "up" : "down"}">${report.rrDelta >= 0 ? "+" : ""}${report.rrDelta}</span>
        </div>` : ""}
        ${rankLine}
      </div>

      <div class="row" style="justify-content:center">
        <button class="btn big" data-play="${result.mode}">🔁 Play Again</button>
        <button class="btn ghost big" data-nav="lobby">🏠 Lobby</button>
      </div>
    </div>
  </section>`;
}

// ---- Shop ------------------------------------------------------------------
export function renderShop(profile) {
  const owned = profile.ownedAuras || ["none"];
  const cards = EFFECTS.map((a) => {
    if (a.rarity === "admin" && !profile.adminUnlocked) return "";
    const isOwned = owned.includes(a.id);
    const equipped = profile.equippedAura === a.id;
    const locked = a.rarity === "premium" && !profile.premium;
    const swatch = a.hueCycle
      ? "linear-gradient(90deg,#ff3d3d,#ffd03a,#3ee08a,#22a8e0,#b14dff)"
      : `linear-gradient(135deg, ${(a.colors || ["#b8a8ff", "#fff"]).join(",")})`;
    const rc = RARITY_COLOR[a.rarity] || "#888";
    let action;
    if (equipped) action = `<button class="btn ghost" disabled>✓ Equipped</button>`;
    else if (isOwned) action = `<button class="btn cyan" data-equip="${a.id}">Equip</button>`;
    else if (a.rarity === "admin") action = `<button class="btn ghost" disabled>🛠️ Admin</button>`;
    else if (locked) action = `<button class="btn ghost" disabled>★ Premium only</button>`;
    else action = `<button class="btn" data-buy="${a.id}">${jcBadge(16)} ${a.price.toLocaleString()}</button>`;
    return `
      <div class="aura-card ${equipped ? "equipped" : ""}" style="--rc:${rc}" data-try="${a.id}">
        <div class="aura-swatch" style="background:${swatch}">
          <span class="aura-rarity" style="background:${rc}22;color:${rc};border-color:${rc}66">${a.rarity}</span>
          <button class="aura-preview" data-try="${a.id}" title="Preview effect">▶ test</button>
        </div>
        <div class="aura-name">${a.name}${a.rarity === "premium" ? " ★" : ""}${a.rarity === "admin" ? " 🛠️" : ""}</div>
        <div class="aura-desc">${a.desc}</div>
        <div class="aura-action">${action}</div>
      </div>`;
  }).join("");

  return `
  <section class="screen">
    <div class="section-title"><h2>Effect Shop</h2><span class="sub">clap effects, boosts & premium</span></div>

    <div class="wallet-bar">
      <div class="wallet-chip">${jcBadge(24)} <b>${(profile.jc || 0).toLocaleString()}</b> Jerk Coins</div>
      <div class="wallet-chip">💎 <b>${(profile.gems || 0).toLocaleString()}</b> Gems</div>
      <button class="btn cyan" id="get-gems">Get Gems</button>
    </div>

    <div class="section-title" style="margin-top:22px"><h2 style="font-size:20px">Clap Effects</h2><span class="sub">tap ▶ test to preview — equip changes your clap visuals & sound</span></div>
    <div class="aura-grid">${cards}</div>

    <div class="section-title" style="margin-top:26px"><h2 style="font-size:20px">Gem Store</h2><span class="sub">premium currency</span></div>
    <div class="gem-grid">
      <div class="gem-card">
        <div class="gem-ic-big">⚡</div>
        <div class="gem-name">2× JC Boost</div>
        <div class="gem-desc">Double all Jerk Coin earnings for 20 minutes. Stacks with Premium.</div>
        <button class="btn" id="buy-boost">💎 ${BOOST_COST_GEMS}</button>
      </div>
      <div class="gem-card ${profile.premium ? "owned" : ""}">
        <div class="gem-ic-big">★</div>
        <div class="gem-name">Premium</div>
        <div class="gem-desc">+50% JC forever · +100 daily bonus · exclusive Galaxy effect · gold name.</div>
        ${profile.premium
          ? `<button class="btn ghost" disabled>✓ Active</button>`
          : `<button class="btn" id="buy-premium">💎 ${PREMIUM_COST_GEMS}</button>`}
      </div>
    </div>

    <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Back to lobby</button></div>
  </section>`;
}

// ---- JerkWorld map ---------------------------------------------------------
export function renderWorld(profile) {
  const beaten = profile.rpgBeaten || 0;
  const nextBoss = BOSSES[Math.min(beaten, BOSSES.length - 1)];
  return `
  <section class="screen">
    <div class="section-title"><h2>🗺️ JerkWorld</h2><span class="sub">${beaten}/${BOSSES.length} bosses · 8-bit overworld</span></div>
    <div class="world8-frame">
      <canvas id="world8-canvas" class="world8-canvas"></canvas>
      <div class="world8-hint" id="world8-hint">Walk onto the flashing <b style="color:var(--gold)">!</b> boss to fight · <b>WASD</b> / arrows / D-pad</div>
      <div class="dpad" id="dpad">
        <button class="dpad-btn up" data-dir="up">▲</button>
        <button class="dpad-btn left" data-dir="left">◀</button>
        <button class="dpad-btn right" data-dir="right">▶</button>
        <button class="dpad-btn down" data-dir="down">▼</button>
      </div>
    </div>
    <div class="world8-legend">
      ${beaten >= BOSSES.length
        ? `<span class="world-clear-inline">👑 WORLD CLEARED — true JERKGOD</span>`
        : `Next: <b>${nextBoss.name}</b> · ${nextBoss.title} · ${nextBoss.hp} HP`}
    </div>
    <div class="center mt-24"><button class="btn ghost" data-nav="lobby">← Back to lobby</button></div>
  </section>`;
}

// ---- Boss fight ------------------------------------------------------------
export function renderBossFight(boss, profile) {
  return `
  <section class="screen arena">
    <div class="arena-top">
      <div class="mode-badge">⚔️ ${boss.name.toUpperCase()}</div>
      <div class="timer-ring">
        <svg width="108" height="108">
          <circle cx="54" cy="54" r="48" stroke="rgba(255,255,255,0.08)" stroke-width="8" fill="none"/>
          <circle id="timer-arc" cx="54" cy="54" r="48" stroke="url(#tg)" stroke-width="8" fill="none"
            stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="0"/>
          <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22e0d6"/><stop offset="1" stop-color="#b14dff"/>
          </linearGradient></defs>
        </svg>
        <div class="t-text" id="timer-text">${boss.time}</div>
      </div>
    </div>

    <div class="boss-stage">
      <div class="boss-figure" id="boss-figure">${boss.emoji}</div>
      <div class="boss-shield hidden" id="boss-shield">🛡️</div>
      <div class="boss-name-line">${boss.name} <span class="boss-title-line">· ${boss.title}</span></div>
      <div class="boss-taunt">“${boss.taunt}”</div>
      <div class="boss-hp-track">
        <div class="boss-hp-fill" id="boss-hp" style="width:100%"></div>
        <div class="boss-hp-num" id="boss-hp-num">${boss.hp} / ${boss.hp}</div>
      </div>
      <div class="boss-status" id="boss-status"></div>
    </div>

    <div class="clap-stage" style="max-width:520px;padding:20px 24px;margin-top:18px">
      <div class="clap-emoji" id="clap-emoji" style="font-size:clamp(52px,11vw,84px)">👏</div>
      <div class="combo-wrap">
        <div class="combo-line">
          <span class="combo-x" id="combo-x">x1.0</span>
          <span class="combo-txt">damage multiplier — keep the tempo up</span>
        </div>
      </div>
      <div class="cps-meter">
        <div class="cps-track"><div class="cps-fill" id="cps-fill"></div></div>
        <div class="cps-labels"><span>claps / sec</span><span class="cps-now" id="cps-now">0</span></div>
      </div>
    </div>

    <div class="center mt-24">
      <button class="btn ghost" id="arena-quit">Retreat</button>
    </div>
  </section>`;
}

// ---- Boss results ----------------------------------------------------------
export function renderBossResults(r, jcReport, xpGained, isNewKill) {
  const b = r.boss;
  return `
  <section class="screen results">
    <div class="res-card">
      <div class="res-verdict ${r.won ? "win" : "loss"}">${r.won ? "BOSS DEFEATED" : "YOU GOT JERKED"}</div>
      <div style="font-size:64px;margin:10px 0">${r.won ? "💀" : b.emoji}</div>
      <div style="font-family:var(--font-display);font-size:20px;margin-bottom:4px">${b.name}</div>
      <div style="color:var(--text-faint);font-size:13px;margin-bottom:16px">${r.won ? (isNewKill ? "New boss down — next node unlocked!" : "Rematch won.") : `${r.hpLeft} HP remaining — so close.`}</div>

      <div class="res-grid">
        <div class="rb"><div class="v">${r.dmgDealt}</div><div class="l">Damage</div></div>
        <div class="rb"><div class="v">${r.peakCps}</div><div class="l">Peak CPS</div></div>
        <div class="rb"><div class="v">${r.blocked}</div><div class="l">Shield Blocks</div></div>
      </div>

      <div class="reward-row">
        ${jcReport ? `
        <div class="reward">
          <span class="r-ic">${jcBadge(24)}</span>
          <div class="r-body"><div class="r-title">Jerk Coins${jcReport.mult > 1 ? ` <span style="color:var(--gold)">×${jcReport.mult}</span>` : ""}</div></div>
          <span class="r-delta up">+${jcReport.total.toLocaleString()}</span>
        </div>` : ""}
        ${xpGained ? `
        <div class="reward xp">
          <span class="r-ic">⭐</span>
          <div class="r-body"><div class="r-title">Experience</div></div>
          <span class="r-delta up">+${xpGained}</span>
        </div>` : ""}
      </div>

      <div class="row" style="justify-content:center">
        ${r.won
          ? `<button class="btn big" data-nav="world">🗺️ Back to map</button>`
          : `<button class="btn big" data-boss-retry="${BOSSES.indexOf(b)}">🔁 Retry</button>`}
        <button class="btn ghost big" data-nav="lobby">🏠 Lobby</button>
      </div>
    </div>
  </section>`;
}

// ---- Versus (local 2-player) -----------------------------------------------
export function renderVersus(profile) {
  return `
  <section class="screen arena">
    <div class="arena-top">
      <div class="mode-badge">🤜🤛 VERSUS · LOCAL 2P</div>
      <div class="timer-ring">
        <svg width="108" height="108">
          <circle cx="54" cy="54" r="48" stroke="rgba(255,255,255,0.08)" stroke-width="8" fill="none"/>
          <circle id="timer-arc" cx="54" cy="54" r="48" stroke="url(#tg)" stroke-width="8" fill="none"
            stroke-linecap="round" stroke-dasharray="301.6" stroke-dashoffset="0"/>
          <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#22e0d6"/><stop offset="1" stop-color="#b14dff"/>
          </linearGradient></defs>
        </svg>
        <div class="t-text" id="timer-text">45</div>
      </div>
    </div>

    <div class="clash-arena">
      <div class="clash-heads">
        <div class="clash-head you"><span class="ch-av">🅰️</span><div><div class="ch-name">Player 1</div><div class="ch-cps">key <b>A</b></div></div></div>
        <div class="clash-head foe"><span class="ch-av">🇱</span><div><div class="ch-name">Player 2</div><div class="ch-cps">key <b>L</b></div></div></div>
      </div>
      <div class="clash-bar">
        <div class="clash-fill you" id="clash-you" style="width:50%"><span class="cf-king">👑</span><span class="cf-pct" id="you-pct">50</span></div>
        <div class="clash-fill foe" id="clash-foe" style="width:50%"><span class="cf-king">👑</span><span class="cf-pct" id="foe-pct">50</span></div>
        <div class="clash-bolt" id="clash-bolt" style="left:50%">${BOLT_SVG}</div>
      </div>
      <div class="clash-tagline">⚡ Mash your key faster than your opponent — drain their bar to <b>KNOCKOUT</b>!</div>
    </div>

    <div class="versus-keys">
      <button class="vs-key p1" id="vs-p1">A</button>
      <button class="vs-key p2" id="vs-p2">L</button>
    </div>

    <div class="center mt-24"><button class="btn ghost" id="arena-quit">Quit</button></div>
  </section>`;
}

// ---- Admin panel (window) --------------------------------------------------
export function renderAdmin(profile) {
  const btn = (id, icon, label, sub = "") =>
    `<button class="admin-btn" id="${id}"><span class="ab-ic">${icon}</span><span class="ab-label">${label}</span>${sub ? `<span class="ab-sub">${sub}</span>` : ""}</button>`;
  return `
  <section class="screen">
   <div class="admin-window">
    <div class="admin-titlebar">
      <div class="aw-dots"><i></i><i></i><i></i></div>
      <div class="aw-title">🛠️ JERKMANIA · DEV CONSOLE</div>
      <div class="aw-user">${escapeHtml(profile.name)} · ADMIN</div>
    </div>
   <div class="admin-body">

    <div class="admin-sec">🏷️ Grant Titles <span class="admin-hint">only you can hand these out</span></div>
    <div class="admin-grid">
      ${btn("adm-title-tester", "🧪", "Grant TESTER", "give to a tester")}
      ${btn("adm-title-dev", "👨‍💻", "Grant DEVELOPER", "dev crew")}
      ${btn("adm-title-jowy", "🟢", "Grant JOWY", "the stinky one")}
      ${btn("adm-title-revoke", "🚫", "Revoke Special Titles")}
    </div>

    <div class="admin-sec">💰 Currency</div>
    <div class="admin-grid">
      ${btn("adm-jc1", "🪙", "+1,000 JC")}
      ${btn("adm-jc10", "💰", "+10,000 JC")}
      ${btn("adm-jc100", "🏦", "+100,000 JC")}
      ${btn("adm-gems", "💎", "+1,000 Gems")}
      ${btn("adm-jcdrop", "🌧️", "JC DROP", "coin rain + 500 JC")}
      ${btn("adm-boost", "⚡", "Activate 2× Boost", "20 min")}
    </div>

    <div class="admin-sec">📈 Progression</div>
    <div class="admin-grid">
      ${btn("adm-rankup", "⬆️", "+1 Division")}
      ${btn("adm-rankdown", "⬇️", "−1 Division")}
      ${btn("adm-radiant", "🌟", "Max Rank", "straight to Radiant")}
      ${btn("adm-lvl10", "⭐", "+10 Levels")}
      ${btn("adm-ach", "🏅", "Unlock All Achievements")}
      ${btn("adm-bosses", "🗺️", "Unlock All Bosses")}
    </div>

    <div class="admin-sec">✨ Cosmetics & Effects</div>
    <div class="admin-grid">
      ${btn("adm-auras", "🎨", "Unlock All Effects")}
      ${btn("adm-dev", "👨‍💻", "Equip Developer Effect", "matrix glyphs")}
      ${btn("adm-susanoo", "👹", "Equip Spectral Guardian", "susanoo swing")}
      ${btn("adm-guardian", "⚔️", "Test SUSANOO Animation")}
      ${btn("adm-burst", "💥", "Test Equipped Effect")}
      ${btn("adm-premium", "★", profile.premium ? "Revoke Premium" : "Grant Premium")}
    </div>

    <div class="admin-sec">🎮 Game</div>
    <div class="admin-grid">
      ${btn("adm-god", "🙏", profile.godClap ? "God Clap: ON" : "God Clap: OFF", "10× boss damage")}
      ${btn("adm-daily", "📅", "Reset Daily Reward")}
      ${btn("adm-playtime", "⏱️", "+10 min Playtime")}
      ${btn("adm-quests", "📋", "Complete All Quests")}
      ${btn("adm-history", "🧹", "Clear Match History")}
      ${btn("adm-reset", "💣", "FULL RESET", "wipe everything")}
    </div>

    <div class="center mt-24">
      <button class="btn ghost" id="adm-lock">🔒 Lock admin panel</button>
      <button class="btn ghost" data-nav="lobby">← Back to lobby</button>
    </div>
   </div>
   </div>
  </section>`;
}

// Results: which equipped Goon Skills contributed
function renderGoonResults(result) {
  const mods = result.loadoutMods;
  if (!mods || !mods.sources || !mods.sources.length) return "";
  const total = result.goonBonus || 0;
  const rows = mods.sources.map((id) => {
    const s = skillById(id);
    if (!s) return "";
    const active = total > 0; // whole-loadout attribution
    return `<span class="goon-chip ${active ? "on" : ""}" style="--rc:${RARITIES[s.rarity].color}">${GOON_ICON[id] || "🃏"} ${escapeHtml(s.name)}</span>`;
  }).join("");
  return `
    <div class="goon-results">
      <div class="gr-head">🃏 Goon Skills ${total ? `<b style="color:var(--good)">+${total.toLocaleString()} pts</b>` : `<span style="color:var(--text-faint)">no proc this run</span>`}</div>
      <div class="gr-chips">${rows}</div>
    </div>`;
}

// ---- Goon Skill cards ------------------------------------------------------
export function goonCard(skill, { owned = 0, equipped = false, isNew = false, compact = false, locked = false } = {}) {
  const r = RARITIES[skill.rarity];
  const holo = r.holo ? "holo" : r.rainbow ? "rainbow" : "";
  return `
    <div class="goon-card rar-${skill.rarity} ${holo} ${equipped ? "equipped" : ""} ${locked ? "locked" : ""} ${compact ? "compact" : ""}"
         style="--rc:${r.color};--rg:${r.glow}" data-skill="${skill.id}">
      ${isNew ? `<span class="goon-new">NEW!</span>` : ""}
      ${owned > 1 ? `<span class="goon-dupe">×${owned}</span>` : ""}
      <div class="goon-top">
        <span class="goon-type">${skill.type}</span>
        <span class="goon-tag">${skill.tag}</span>
      </div>
      <div class="goon-art"><span class="goon-emoji">${GOON_ICON[skill.id] || "🃏"}</span></div>
      <div class="goon-name">${locked ? "???" : escapeHtml(skill.name)}</div>
      <div class="goon-rarity" style="color:${r.color}">${r.name}</div>
      ${compact ? "" : `<div class="goon-flavor">${locked ? "Not yet discovered." : escapeHtml(skill.flavor)}</div>
      <div class="goon-effect">${locked ? "" : escapeHtml(skill.effect)}</div>`}
      ${equipped ? `<div class="goon-eqbadge">✓ EQUIPPED</div>` : ""}
    </div>`;
}

const GOON_ICON = {
  metronome: "🎚️", warmhands: "🧤", steadyhands: "✋", lintroller: "🧻", spare1up: "🍄", snackbreak: "🍬",
  tinytempo: "🎵", secondwind: "💨", couchgoblin: "👺", focusfingers: "🧿", pocketsand: "🏜️", steadyheart: "❤️",
  greenstreak: "📗", cleanhands: "🧼", comboglue: "🧴", burstpack: "🔋", loosechange: "🪙", reboundking: "🔄",
  gymtimer: "⏲️", luckycricket: "🦗", dustbunny: "🐇", finisher: "🏁", trashtalk: "🗯️", quickstep: "👟",
  combobandage: "🩹", beatreader: "📖", flowstate: "🌊", risktaker: "🎲", shopkeeper: "🏪", momentumcore: "⚙️",
  safetynet: "🕸️", goldenreroll: "🔁", encore: "🎤", adrenaline: "💉", cooldownchip: "🧊",
  turbogoblin: "👹", chainlink: "🔗", metrognome: "🧙", doubledown: "🃏", phoenix: "🔥", hotstreak: "♨️",
  luckydragon: "🐉", precisionist: "🎯", gambit: "♟️", sharingclap: "🌀",
  neonconductor: "🪄", ninetailscloak: "🦊", rasenburst: "🌀", guardianstance: "🛡️", overclock: "⚡",
  goldentempo: "🥇", jackpotheart: "💛", lastdance: "💃",
  forbiddenmetro: "⛓️", susanooheart: "👺", singularity: "🕳️", bankaicrescent: "🌙", domainseal: "🔮",
  phoenixcore: "🕊️", kingsgambit: "👑", fourdayfiend: "🌈", eventhorizon: "🌌",
};
export { GOON_ICON };

// ---- Summon screen ---------------------------------------------------------
export function renderSummon(profile) {
  const g = profile.goons;
  const rareLeft = PITY.rare - (g.gacha.sinceRare % PITY.rare);
  const epicLeft = PITY.epic - (g.gacha.sinceEpic % PITY.epic);
  const legLeft = PITY.legByArt - (g.gacha.sinceLeg % PITY.legByArt);
  const collected = Object.keys(g.owned).length;
  return `
  <section class="screen">
    <div class="section-title"><h2>🃏 Summon Goons</h2><span class="sub">collect skill cards</span></div>

    <div class="summon-hero">
      <div class="summon-banner">
        <div class="sb-title">STANDARD BANNER</div>
        <div class="sb-sub">All permanent Goons · fair pity</div>
        <div class="sb-rates">Common 52% · Uncommon 27% · Rare 13% · Epic 5.5% · Legendary 2% · Artifact 0.5%</div>
      </div>
      <div class="summon-wallet">
        <div class="sw-chip">🪙 <b>${(g.clapCoins || 0).toLocaleString()}</b> Clap Coins</div>
        <div class="sw-chip">✨ <b>${(g.dust || 0).toLocaleString()}</b> Goon Dust</div>
        <div class="sw-chip">📚 <b>${collected}/${SKILLS.filter((s)=>!s.limited).length}</b> collected</div>
      </div>
      <div class="pity-row">
        <div class="pity-item"><span>Rare guaranteed in</span><b>${rareLeft}</b></div>
        <div class="pity-item"><span>Epic+ in</span><b>${epicLeft}</b></div>
        <div class="pity-item"><span>Legendary/Artifact in</span><b>${legLeft}</b></div>
      </div>
      <div class="summon-buttons">
        <button class="btn big" id="summon-1" ${(g.clapCoins||0) < SUMMON_COST ? "disabled" : ""}>Summon ×1 · 🪙 ${SUMMON_COST}</button>
        <button class="btn big cyan" id="summon-10" ${(g.clapCoins||0) < SUMMON_COST_10 ? "disabled" : ""}>Summon ×10 · 🪙 ${SUMMON_COST_10}</button>
      </div>
      <div class="summon-note">Duplicates convert to Goon Dust automatically. Earn Clap Coins by playing.</div>
    </div>

    <div class="center mt-24">
      <button class="btn ghost" data-nav="collection">📚 Collection</button>
      <button class="btn ghost" data-nav="loadout">🎴 Loadout</button>
      <button class="btn ghost" data-nav="lobby">← Back</button>
    </div>
  </section>`;
}

// ---- Collection book -------------------------------------------------------
export function renderCollection(profile) {
  const g = profile.goons;
  const groups = RARITY_ORDER.map((rk) => {
    const skills = SKILLS.filter((s) => s.rarity === rk);
    const cards = skills.map((s) => {
      const owned = g.owned[s.id] || 0;
      return goonCard(s, { owned, compact: true, locked: owned === 0 && s.limited && !ownedLimited(g, s.id), equipped: isEquipped(g, s.id) });
    }).join("");
    const have = skills.filter((s) => g.owned[s.id]).length;
    return `
      <div class="col-group">
        <div class="col-head" style="color:${RARITIES[rk].color}">${RARITIES[rk].name} <span>${have}/${skills.length}</span></div>
        <div class="goon-grid">${cards}</div>
      </div>`;
  }).join("");
  return `
  <section class="screen">
    <div class="section-title"><h2>📚 Collection</h2><span class="sub">${Object.keys(g.owned).length} / ${SKILLS.length} discovered</span></div>
    ${groups}
    <div class="center mt-24">
      <button class="btn ghost" data-nav="summon">🃏 Summon</button>
      <button class="btn ghost" data-nav="lobby">← Back</button>
    </div>
  </section>`;
}
function ownedLimited(g, id) { return !!g.owned[id]; }
function isEquipped(g, id) { return g.loadout.momentum === id || g.loadout.technique === id || g.loadout.wildcard === id; }

// ---- Loadout ---------------------------------------------------------------
export function renderLoadout(profile) {
  const g = profile.goons;
  const slot = (type) => {
    const id = g.loadout[type];
    const s = id ? skillById(id) : null;
    const owned = SKILLS.filter((x) => x.type === type && g.owned[x.id]);
    return `
      <div class="lo-slot">
        <div class="lo-slot-label">${type}</div>
        <div class="lo-current">${s ? goonCard(s, { compact: true, equipped: true }) : `<div class="lo-empty">Empty slot</div>`}</div>
        <div class="lo-options">
          <button class="lo-opt ${!id ? "active" : ""}" data-equip-slot="${type}" data-equip-id="">— none —</button>
          ${owned.map((x) => `<button class="lo-opt ${id === x.id ? "active" : ""}" data-equip-slot="${type}" data-equip-id="${x.id}" style="--rc:${RARITIES[x.rarity].color}">${GOON_ICON[x.id] || "🃏"} ${escapeHtml(x.name)}</button>`).join("")}
        </div>
      </div>`;
  };
  return `
  <section class="screen">
    <div class="section-title"><h2>🎴 Loadout</h2><span class="sub">1 Momentum · 1 Technique · 1 Wildcard</span></div>
    <div class="center" style="margin-bottom:16px"><button class="btn" id="recommend-loadout">✨ Recommended starter loadout</button></div>
    <div class="loadout-grid">
      ${slot("momentum")}
      ${slot("technique")}
      ${slot("wildcard")}
    </div>
    <div class="center mt-24">
      <button class="btn ghost" data-nav="summon">🃏 Summon</button>
      <button class="btn ghost" data-nav="collection">📚 Collection</button>
      <button class="btn ghost" data-nav="lobby">← Back</button>
    </div>
  </section>`;
}

// ---- Onboarding tutorial ---------------------------------------------------
export const TUTORIAL_STEPS = [
  { emoji: "👏", title: "Welcome to JERKMANIA", body: "The AI clap-speed arena. This 30-second intro covers everything you need. Tap Next." },
  { emoji: "🎙️", title: "Two ways to play", body: "<b>Clap Mode</b> uses your microphone — real claps are detected by onset analysis. <b>Keyboard Mode</b> is different: you alternate <b>F</b> and <b>J</b> like two hands (or tap left/right). Mic needs permission — it's on-device only, never recorded." },
  { emoji: "📈", title: "Combo & CPS", body: "Clap fast and steady to build your <b>combo</b> — it raises your multiplier up to <b>×2</b>. <b>CPS</b> is claps-per-second; the meter turns hot past 6. Every point is earned — no autoclickers." },
  { emoji: "⚡", title: "Live events", body: "Watch for <b>BURST</b> windows (double points!), <b>SILENCE</b> hazards (claps score nothing — stop!), and <b>PERFECT</b> beat pulses for bonus points. Timing beats mashing." },
  { emoji: "🏆", title: "Modes & progress", body: "Ranked climbs Iron→Radiant. Duel an AI or a friend (Versus 2P). Explore <b>JerkWorld</b> to clap-battle bosses. Earn <b>Jerk Coins</b> for effects in the Shop, finish <b>daily quests</b>, and grab your reward every day." },
];
export function renderTutorial(step) {
  const s = TUTORIAL_STEPS[step];
  const dots = TUTORIAL_STEPS.map((_, i) => `<i class="${i === step ? "on" : ""}"></i>`).join("");
  const last = step === TUTORIAL_STEPS.length - 1;
  return `
    <div class="tut-card">
      <div class="tut-emoji">${s.emoji}</div>
      <h3>${s.title}</h3>
      <p>${s.body}</p>
      <div class="tut-dots">${dots}</div>
      <div class="row" style="justify-content:center;margin-top:8px">
        <button class="btn ghost" id="tut-skip">Skip</button>
        <button class="btn" id="tut-next">${last ? "Let's clap! 👏" : "Next →"}</button>
      </div>
    </div>`;
}

// ---- Particle background ---------------------------------------------------
export function initParticles(reduced = false) {
  const canvas = $("#particle-canvas");
  if (!canvas) return () => {};
  if (reduced || matchMedia("(prefers-reduced-motion: reduce)").matches) { canvas.style.display = "none"; return () => {}; }
  const ctx = canvas.getContext("2d");
  let w, h, parts = [], raf;
  const resize = () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener("resize", resize);
  const N = Math.min(70, Math.floor(window.innerWidth / 22));
  for (let i = 0; i < N; i++) {
    parts.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 2 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -0.15 - Math.random() * 0.3,
      hue: 260 + Math.random() * 60,
      a: Math.random() * 0.5 + 0.15,
    });
  }
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
      ctx.beginPath();
      ctx.fillStyle = `hsla(${p.hue},90%,70%,${p.a})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  draw();
  return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
}


