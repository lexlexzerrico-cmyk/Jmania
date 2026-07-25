/* ============================================================
   titles.js — equippable player titles
   ------------------------------------------------------------
   Titles show under your name in the lobby. Sources:
   - level: auto-unlocks at a level threshold
   - secret: unlocked by entering a secret code (lobby keyhole)
   - admin: grantable only from the admin panel (Tester/Developer)
   - rank: reach a rank tier
   ============================================================ */

export const TITLES = [
  { id: "rookie",    name: "The Rookie",        cls: "t-plain",   how: "Start playing",             type: "level", level: 1 },
  { id: "warmed",    name: "Warm Hands",        cls: "t-cyan",    how: "Reach level 6",             type: "level", level: 6 },
  { id: "rally",     name: "Rally Starter",     cls: "t-blue",    how: "Reach level 12",            type: "level", level: 12 },
  { id: "cannon",    name: "Hand Cannon",       cls: "t-orange",  how: "Reach level 22",            type: "level", level: 22 },
  { id: "master",    name: "Rhythm Master",     cls: "t-epic",    how: "Reach level 35",            type: "level", level: 35 },
  { id: "legend",    name: "Applause Legend",   cls: "t-gold",    how: "Reach level 50",            type: "level", level: 50 },
  { id: "goldrank",  name: "Gilded Clapper",    cls: "t-gold",    how: "Reach Gold rank",           type: "rank", rankIndex: 9 },
  { id: "radiant",   name: "THE RADIANT",       cls: "t-radiant", how: "Reach Radiant rank",        type: "rank", rankIndex: 24 },
  { id: "jowy",      name: "JOWY",              cls: "t-jowy",    how: "??? (secret code)",         type: "secret", flies: true },
  { id: "tester",    name: "TESTER",            cls: "t-tester",  how: "Granted by the developer",  type: "admin" },
  { id: "developer", name: "DEVELOPER",         cls: "t-dev",     how: "Granted by the developer",  type: "admin" },
  // Boss-defeat titles — you claim the mantle of each boss you beat (JerkWorld).
  { id: "bt_jerkling",    name: "Wannabe Crusher",   cls: "t-boss", how: "Defeat Jerkling",        type: "boss" },
  { id: "bt_slapsalot",   name: "Knight-Ender",      cls: "t-boss", how: "Defeat Sir Slapsalot",   type: "boss" },
  { id: "bt_clapzilla",   name: "City Savior",       cls: "t-boss", how: "Defeat Clapzilla",       type: "boss" },
  { id: "bt_djjerk",      name: "Beat Breaker",      cls: "t-boss", how: "Defeat DJ Jerkbeat",     type: "boss" },
  { id: "bt_palmfather",  name: "Made Clapper",      cls: "t-boss", how: "Defeat The Palmfather",  type: "boss" },
  { id: "bt_jerkinator",  name: "Machine Slayer",    cls: "t-boss", how: "Defeat Jerkinator 3000", type: "boss" },
  { id: "bt_mechamittens", name: "Mitten Melter",    cls: "t-boss", how: "Defeat Mecha-Mittens",   type: "boss" },
  { id: "bt_thunderjerk", name: "Storm Ender",       cls: "t-boss", how: "Defeat Thunder Jerk",    type: "boss" },
  { id: "bt_jerkzilla",   name: "Kaiju Hunter",      cls: "t-bossgold", how: "Defeat Jerkzilla",   type: "boss" },
  { id: "bt_countess",    name: "Court Silencer",    cls: "t-boss", how: "Defeat Countess Applause", type: "boss" },
  { id: "bt_jerkmaster",  name: "GRANDMASTER",       cls: "t-bossgold", how: "Defeat Jerkmaster",  type: "boss" },
  { id: "bt_omega",       name: "JERKGOD",           cls: "t-bossgold", how: "Defeat OMEGA JERKGOD", type: "boss" },
];

export function titleById(id) { return TITLES.find((t) => t.id === id) || null; }

/** Titles currently available to this profile (auto + granted). */
export function unlockedTitles(profile, level) {
  const granted = new Set(profile.titles || []);
  return TITLES.filter((t) => {
    if (t.type === "level") return level >= t.level;
    if (t.type === "rank") return (profile.rankIndex || 0) >= t.rankIndex;
    return granted.has(t.id);   // secret + admin types must be granted
  });
}

export function grantTitle(profile, id) {
  if (!Array.isArray(profile.titles)) profile.titles = [];
  if (!profile.titles.includes(id)) profile.titles.push(id);
}

/** Render an inline styled title chip (flies included for Jowy). */
export function titleChip(t, big = false) {
  if (!t) return "";
  const flies = t.flies
    ? `<span class="fly f1">🪰</span><span class="fly f2">🪰</span><span class="fly f3">🪰</span>`
    : "";
  return `<span class="title-chip ${t.cls} ${big ? "big" : ""}">${flies}${t.name}</span>`;
}
