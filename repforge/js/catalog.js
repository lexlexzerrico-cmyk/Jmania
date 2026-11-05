// Game data. Prices and rules are mirrored in supabase/schema.sql (the server is the authority online).

export const TIERS = [
  { id: "rookie",   name: "Rookie",   color: "#8b95a7", deep: "#3a4150" },
  { id: "bronze",   name: "Bronze",   color: "#d08a55", deep: "#5a3018" },
  { id: "silver",   name: "Silver",   color: "#cdd6e2", deep: "#4b5566" },
  { id: "gold",     name: "Gold",     color: "#f5c84c", deep: "#6b4a07" },
  { id: "platinum", name: "Platinum", color: "#55dccb", deep: "#0d4f4a" },
  { id: "diamond",  name: "Diamond",  color: "#82adff", deep: "#1b3577" },
  { id: "titan",    name: "Titan",    color: "#e46bff", deep: "#4f1263" },
  { id: "legend",   name: "Legend",   color: "#ff6464", deep: "#6a0f17" }
];

// [tierIndex, division (0 = none), rp needed]
export const RANKS = [
  [0, 0, 0],
  [1, 1, 100], [1, 2, 250], [1, 3, 450],
  [2, 1, 700], [2, 2, 1000], [2, 3, 1350],
  [3, 1, 1750], [3, 2, 2200], [3, 3, 2700],
  [4, 1, 3300], [4, 2, 4000], [4, 3, 4800],
  [5, 1, 5700], [5, 2, 6700], [5, 3, 7800],
  [6, 1, 9000], [6, 2, 10500], [6, 3, 12000],
  [7, 0, 14000]
].map(([t, d, rp], i) => ({ i, tier: TIERS[t], div: d, rp, name: TIERS[t].name + (d ? " " + ["", "I", "II", "III"][d] : "") }));

export function rankFor(rp) {
  let r = RANKS[0];
  for (const x of RANKS) if (rp >= x.rp) r = x;
  const next = RANKS[r.i + 1] || null;
  const frac = next ? (rp - r.rp) / (next.rp - r.rp) : 1;
  return { ...r, next, frac, toNext: next ? next.rp - rp : 0 };
}

// Level L needs 40(L-1)^2 + 60(L-1) total XP. 2 XP per rep.
export const xpForLevel = (L) => 40 * (L - 1) ** 2 + 60 * (L - 1);
export function levelFor(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  const a = xpForLevel(L), b = xpForLevel(L + 1);
  return { level: L, frac: (xp - a) / (b - a), into: xp - a, need: b - a };
}

export const THEMES = {
  ember:    { name: "Ember",    color: "#ff8a3d", ink: "#1a0d03" },
  cobalt:   { name: "Cobalt",   color: "#5b86ff", ink: "#050b1f" },
  jade:     { name: "Jade",     color: "#2fd69f", ink: "#03170f" },
  magenta:  { name: "Magenta",  color: "#ff5cae", ink: "#22030f" },
  ice:      { name: "Glacier",  color: "#86e6ff", ink: "#03161c" },
  crimson:  { name: "Crimson",  color: "#ff4d57", ink: "#1f0306" },
  champion: { name: "Champion", color: "#f7d774", ink: "#1c1503", shine: true }
};

export const ITEMS = [
  // earned titles
  { id: "rookie",    kind: "title", name: "Rookie",          earn: "Everyone starts here" },
  { id: "first_set", kind: "title", name: "First Rep",       earn: "Finish your first set" },
  { id: "fifty",     kind: "title", name: "Half Century",    earn: "50 reps in one set" },
  { id: "century",   kind: "title", name: "Centurion",       earn: "100 reps in one set" },
  { id: "k1",        kind: "title", name: "Thousand Club",   earn: "1,000 total reps" },
  { id: "k10",       kind: "title", name: "Ten-K Machine",   earn: "10,000 total reps" },
  { id: "streak7",   kind: "title", name: "Week Warrior",    earn: "7-day streak" },
  { id: "streak30",  kind: "title", name: "Iron Habit",      earn: "30-day streak" },
  { id: "gilded",    kind: "title", name: "Gilded",          earn: "Reach Gold rank" },
  { id: "legend",    kind: "title", name: "Living Legend",   earn: "Reach Legend rank" },
  // store titles
  { id: "gymrat",        kind: "title", name: "Gym Rat",        price: 300 },
  { id: "corecrusher",   kind: "title", name: "Core Crusher",   price: 450 },
  { id: "plank",         kind: "title", name: "Plank Phantom",  price: 600 },
  { id: "beast",         kind: "title", name: "Beast Mode",     price: 900 },
  { id: "unit",          kind: "title", name: "Certified Unit", price: 1200 },
  { id: "maincharacter", kind: "title", name: "Main Character", price: 2000 },
  { id: "finalboss",     kind: "title", name: "Final Boss",     price: 5000 },
  // themes
  { id: "ember",    kind: "theme", earn: "Starter theme" },
  { id: "cobalt",   kind: "theme", price: 400 },
  { id: "jade",     kind: "theme", price: 400 },
  { id: "magenta",  kind: "theme", price: 600 },
  { id: "ice",      kind: "theme", price: 600 },
  { id: "crimson",  kind: "theme", price: 800 },
  { id: "champion", kind: "theme", price: 3000 },
  // boosts
  { id: "grit2x",   kind: "boost", name: "Double Grit",   price: 250, minutes: 30, icon: "coin",   desc: "Every rep pays 2× Grit." },
  { id: "xpsurge",  kind: "boost", name: "XP Surge",      price: 200, minutes: 30, icon: "bolt",   desc: "Level up twice as fast." },
  { id: "rankrush", kind: "boost", name: "Rank Rush",     price: 400, minutes: 20, icon: "trophy", desc: "+25% rank points on every set." },
  { id: "shield",   kind: "boost", name: "Streak Shield", price: 300, icon: "shield", desc: "Saves your streak if you miss a day. Hold up to 3." }
].map((it) => it.kind === "theme" ? { ...it, name: THEMES[it.id].name } : it);

export const item = (id) => ITEMS.find((x) => x.id === id);
export const titleName = (id) => item(id)?.name || "Rookie";

export const EARNED_TITLES = ["first_set", "fifty", "century", "k1", "k10", "streak7", "streak30", "gilded", "legend"];
