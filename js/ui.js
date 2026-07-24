/* ============================================================
   ui.js — screen templates + small view helpers
   ============================================================ */
import { LADDER, rankFromIndex, levelProgress, levelTitle, RR_PER_DIVISION } from "./ranks.js";
import { ACHIEVEMENTS, isUnlocked } from "./achievements.js";
import { comboToMult } from "./game.js";
import { AURAS, auraById } from "./fx.js";
import { BOSSES } from "./rpg.js";
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
        <span class="mc-tag">1 v 1</span>
        <div class="mc-icon">⚔️</div>
        <h3>Duel</h3>
        <p>Head-to-head against an AI rival scaled to your rank. Out-clap them before the timer dies.</p>
        <div class="mc-go">Find match <span class="arrow">→</span></div>
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

    <div class="stat-strip">
      <div class="stat-box"><div class="v">${s.bestScore.toLocaleString()}</div><div class="l">Best Score</div></div>
      <div class="stat-box"><div class="v">${s.bestCps}</div><div class="l">Top CPS</div></div>
      <div class="stat-box"><div class="v">x${comboToMult(s.bestCombo).toFixed(1)}</div><div class="l">Best Combo</div></div>
      <div class="stat-box"><div class="v">${winrate}%</div><div class="l">Win Rate</div></div>
      <div class="stat-box"><div class="v">${s.totalClaps.toLocaleString()}</div><div class="l">Total Claps</div></div>
    </div>

    ${renderHistory(profile)}
  </section>`;
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
      </div>
      ${toggle("set-music", st.musicOn, "Lobby music", "Procedural synth-wave loop")}
      ${toggle("set-sfx", st.sfxOn, "Sound effects", "Claps, countdown, knockout & win cues")}
      ${toggle("set-cam", st.camOn, "Webcam window", "Show your live camera while playing")}

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
      <h3>${modeLabel} · Mic Check</h3>
      <p>JERKMANIA listens through your microphone and detects claps with real-time onset analysis. Give it permission, then clap once to test. Adjust sensitivity so a clap fills the bar but background noise doesn't.</p>
      <div class="mic-level"><i id="mic-level-fill"></i></div>
      <div class="sens-row">
        <label>Sensitivity</label>
        <input type="range" id="sens-range" min="0" max="1" step="0.01" value="${sensitivity}" />
      </div>
      <div class="row mt-24" style="justify-content:center">
        <button class="btn big" id="mic-enable">🎧 Enable Mic & Continue</button>
      </div>
      <div class="row center" style="margin-top:12px; gap:10px">
        <button class="btn ghost" id="mic-cam">📷 Turn on webcam</button>
        <button class="btn ghost" id="mic-keyboard">⌨️ Keyboard / tap</button>
      </div>
      <div class="no-mic-note" id="mic-note">${supported ? "Tip: in a noisy room, lower sensitivity." : "No microphone API here — keyboard/tap mode will be used."}</div>
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

  return `
  <section class="screen results">
    <div class="res-card">
      <div class="res-verdict ${verdictClass}">${verdict}</div>
      ${hero}
      ${snap}

      <div class="res-grid" style="margin-top:22px">
        <div class="rb"><div class="v">${result.totalClaps}</div><div class="l">Claps</div></div>
        <div class="rb"><div class="v">${result.peakCps}</div><div class="l">Peak CPS</div></div>
        <div class="rb"><div class="v">x${comboToMult(result.peakCombo).toFixed(1)}</div><div class="l">Best Combo</div></div>
      </div>

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
  const cards = AURAS.map((a) => {
    if (a.tier === "admin" && !profile.adminUnlocked) return "";
    const isOwned = owned.includes(a.id);
    const equipped = profile.equippedAura === a.id;
    const locked = a.tier === "premium" && !profile.premium;
    const swatch = a.hueCycle
      ? "linear-gradient(90deg,#ff3d3d,#ffd03a,#3ee08a,#22a8e0,#b14dff)"
      : `linear-gradient(135deg, ${(a.colors || []).join(",")})`;
    let action;
    if (equipped) action = `<button class="btn ghost" disabled>✓ Equipped</button>`;
    else if (isOwned) action = `<button class="btn cyan" data-equip="${a.id}">Equip</button>`;
    else if (a.tier === "admin") action = `<button class="btn ghost" disabled>🛠️ Admin</button>`;
    else if (locked) action = `<button class="btn ghost" disabled>★ Premium only</button>`;
    else action = `<button class="btn" data-buy="${a.id}">${a.price.toLocaleString()} ${a.tier === "premium" ? "JC" : "JC"}</button>`;
    return `
      <div class="aura-card ${equipped ? "equipped" : ""}">
        <div class="aura-swatch" style="background:${swatch}"></div>
        <div class="aura-name">${a.name} ${a.tier === "premium" ? "★" : ""}${a.tier === "admin" ? " 🛠️" : ""}</div>
        <div class="aura-desc">${a.desc}</div>
        <div class="aura-action">${action}</div>
      </div>`;
  }).join("");

  return `
  <section class="screen">
    <div class="section-title"><h2>Shop</h2><span class="sub">auras & boosts</span></div>

    <div class="wallet-bar">
      <div class="wallet-chip">${jcBadge(24)} <b>${(profile.jc || 0).toLocaleString()}</b> Jerk Coins</div>
      <div class="wallet-chip">💎 <b>${(profile.gems || 0).toLocaleString()}</b> Gems</div>
      <button class="btn cyan" id="get-gems">Get Gems</button>
    </div>

    <div class="section-title" style="margin-top:22px"><h2 style="font-size:20px">Auras</h2><span class="sub">equip one — it changes your clap effects & sound</span></div>
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
        <div class="gem-desc">+50% JC forever · +100 daily bonus · exclusive Galaxy aura · gold name.</div>
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
  const nodes = BOSSES.map((b, i) => {
    const state = i < beaten ? "beaten" : i === beaten ? "next" : "locked";
    return `
      <div class="boss-node ${state}" ${state !== "locked" ? `data-boss="${i}"` : ""}>
        <div class="bn-emoji">${state === "locked" ? "🔒" : b.emoji}</div>
        <div class="bn-name">${state === "locked" ? "???" : b.name}</div>
        <div class="bn-title">${state === "locked" ? "Defeat the previous boss" : b.title}</div>
        <div class="bn-meta">${state === "locked" ? "" : `${b.hp} HP · ${b.time}s · +${b.rewardJc} JC`}</div>
        ${state === "beaten" ? `<div class="bn-badge">✓ DEFEATED</div>` : ""}
        ${state === "next" ? `<div class="bn-badge fight">⚔️ FIGHT</div>` : ""}
      </div>`;
  }).join('<div class="boss-link"></div>');

  return `
  <section class="screen">
    <div class="section-title"><h2>🗺️ JerkWorld</h2><span class="sub">${beaten}/${BOSSES.length} bosses defeated</span></div>
    <p style="color:var(--text-dim);margin-bottom:18px;max-width:640px">Clap bosses to death before the timer runs out. Watch the <b>shield phases</b> — claps bounce off while it's up. Bosses regenerate, and they get <b style="color:var(--bad)">angry</b> below 25% HP.</p>
    <div class="boss-path">${nodes}</div>
    ${beaten >= BOSSES.length ? `<div class="world-clear">👑 WORLD CLEARED — you are the true JERKGOD</div>` : ""}
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

// ---- Admin panel -----------------------------------------------------------
export function renderAdmin(profile) {
  const btn = (id, icon, label, sub = "") =>
    `<button class="admin-btn" id="${id}"><span class="ab-ic">${icon}</span><span class="ab-label">${label}</span>${sub ? `<span class="ab-sub">${sub}</span>` : ""}</button>`;
  return `
  <section class="screen">
    <div class="section-title"><h2>🛠️ Admin Panel</h2><span class="sub">developer access — with great power…</span></div>

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

    <div class="admin-sec">✨ Cosmetics</div>
    <div class="admin-grid">
      ${btn("adm-auras", "🎨", "Unlock All Auras")}
      ${btn("adm-dev", "👨‍💻", "Equip Developer Aura", "matrix glyphs")}
      ${btn("adm-susanoo", "👹", "Equip Spectral Guardian", "giant spirit warrior")}
      ${btn("adm-guardian", "⚔️", "Test Guardian Flash")}
      ${btn("adm-burst", "💥", "Test Aura Burst")}
      ${btn("adm-premium", "★", profile.premium ? "Revoke Premium" : "Grant Premium")}
    </div>

    <div class="admin-sec">🎮 Game</div>
    <div class="admin-grid">
      ${btn("adm-god", "🙏", profile.godClap ? "God Clap: ON" : "God Clap: OFF", "10× boss damage")}
      ${btn("adm-daily", "📅", "Reset Daily Reward")}
      ${btn("adm-playtime", "⏱️", "+10 min Playtime")}
      ${btn("adm-history", "🧹", "Clear Match History")}
      ${btn("adm-hype", "🔥", "Test Hype Callout")}
      ${btn("adm-reset", "💣", "FULL RESET", "wipe everything")}
    </div>

    <div class="center mt-24">
      <button class="btn ghost" id="adm-lock">🔒 Lock admin panel</button>
      <button class="btn ghost" data-nav="lobby">← Back to lobby</button>
    </div>
  </section>`;
}

// ---- Particle background ---------------------------------------------------
export function initParticles() {
  const canvas = $("#particle-canvas");
  if (!canvas) return () => {};
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


