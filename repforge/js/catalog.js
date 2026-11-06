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

export const RARITY = {
  common:    { name: "Common",    color: "#a3adbd" },
  rare:      { name: "Rare",      color: "#5b9dff" },
  epic:      { name: "Epic",      color: "#c77dff" },
  legendary: { name: "Legendary", color: "#ffc247" }
};

// Everything ownable. granted_by: achievement or skill id that unlocks it ("default" = everyone owns it).
// Prices and grants are mirrored in supabase/schema.sql (the server's copy wins online).
export const ITEMS = [
  // titles earned from achievements
  { id: "rookie",        kind: "title", name: "Rookie",          rarity: "common", granted_by: "default" },
  { id: "first_set",     kind: "title", name: "First Rep",       rarity: "common", granted_by: "first_set" },
  { id: "fifty",         kind: "title", name: "Half Century",    rarity: "common", granted_by: "fifty" },
  { id: "century",       kind: "title", name: "Centurion",       rarity: "rare", granted_by: "century" },
  { id: "k1",            kind: "title", name: "Thousand Club",   rarity: "rare", granted_by: "k1" },
  { id: "k10",           kind: "title", name: "Ten-K Machine",   rarity: "epic", granted_by: "k10" },
  { id: "streak7",       kind: "title", name: "Week Warrior",    rarity: "rare", granted_by: "streak7" },
  { id: "streak30",      kind: "title", name: "Iron Habit",      rarity: "epic", granted_by: "streak30" },
  { id: "gilded",        kind: "title", name: "Gilded",          rarity: "rare", granted_by: "gilded" },
  { id: "legend",        kind: "title", name: "Living Legend",   rarity: "legendary", granted_by: "legend" },
  { id: "questbound",    kind: "title", name: "Questbound",      rarity: "rare", granted_by: "questbound" },
  { id: "restwise",      kind: "title", name: "Restwise",        rarity: "common", granted_by: "restwise" },
  { id: "recordbreaker", kind: "title", name: "Record Breaker",  rarity: "rare", granted_by: "recordbreaker" },
  { id: "triple",        kind: "title", name: "Triple Threat",   rarity: "common", granted_by: "triple" },
  { id: "dawn",          kind: "title", name: "Dawn Patrol",     rarity: "rare", granted_by: "dawn" },
  { id: "night",         kind: "title", name: "Night Owl",       rarity: "rare", granted_by: "night" },
  { id: "questmaster",   kind: "title", name: "Quest Master",    rarity: "epic", granted_by: "questmaster" },
  { id: "level25",       kind: "title", name: "Veteran Soul",    rarity: "epic", granted_by: "level25" },
  { id: "collector",     kind: "title", name: "Collector",       rarity: "epic", granted_by: "collector" },
  { id: "champ",         kind: "title", name: "Champion",        rarity: "epic", granted_by: "champion" },
  { id: "seasonvet",     kind: "title", name: "Season Veteran",  rarity: "rare", granted_by: "season_vet" },
  // titles from capstone skills
  { id: "unbroken",      kind: "title", name: "Unbroken",        rarity: "legendary", granted_by: "d5" },
  { id: "unyielding",    kind: "title", name: "Unyielding",      rarity: "legendary", granted_by: "s5" },
  { id: "sage",          kind: "title", name: "Sage",            rarity: "legendary", granted_by: "e5" },
  { id: "grandmaster",   kind: "title", name: "Grandmaster",     rarity: "legendary", granted_by: "m5" },
  // store titles
  { id: "gymrat",        kind: "title", name: "Gym Rat",        price: 300,  rarity: "common" },
  { id: "corecrusher",   kind: "title", name: "Core Crusher",   price: 450,  rarity: "common" },
  { id: "plank",         kind: "title", name: "Plank Phantom",  price: 600,  rarity: "rare" },
  { id: "beast",         kind: "title", name: "Beast Mode",     price: 900,  rarity: "rare" },
  { id: "unit",          kind: "title", name: "Certified Unit", price: 1200, rarity: "epic" },
  { id: "maincharacter", kind: "title", name: "Main Character", price: 2000, rarity: "epic" },
  { id: "finalboss",     kind: "title", name: "Final Boss",     price: 5000, rarity: "legendary" },
  // themes
  { id: "ember",    kind: "theme", rarity: "common", granted_by: "default", desc: "The starter accent." },
  { id: "cobalt",   kind: "theme", price: 400,  rarity: "common", desc: "Cool electric blue accents." },
  { id: "jade",     kind: "theme", price: 400,  rarity: "common", desc: "Calm green accents." },
  { id: "magenta",  kind: "theme", price: 600,  rarity: "rare", desc: "Loud pink accents." },
  { id: "ice",      kind: "theme", price: 600,  rarity: "rare", desc: "Pale glacier accents." },
  { id: "crimson",  kind: "theme", price: 800,  rarity: "rare", desc: "Deep red accents." },
  { id: "champion", kind: "theme", price: 3000, rarity: "legendary", desc: "Gold accents with a shine." },
  // boosts
  { id: "grit2x",   kind: "boost", name: "Double Grit",   price: 250, minutes: 30, icon: "coin",   rarity: "common", desc: "Every rep pays 2× Grit." },
  { id: "xpsurge",  kind: "boost", name: "XP Surge",      price: 200, minutes: 30, icon: "bolt",   rarity: "common", desc: "Level up twice as fast." },
  { id: "rankrush", kind: "boost", name: "Rank Rush",     price: 400, minutes: 20, icon: "trophy", rarity: "rare", desc: "+25% rank points on every set." },
  { id: "shield",   kind: "boost", name: "Streak Shield", price: 300, icon: "shield", rarity: "rare", desc: "Saves your streak if you miss a day. Hold up to 3." },
  // frames
  { id: "f_iron",   kind: "frame", name: "Iron",   price: 300,  rarity: "common", desc: "Brushed steel ring." },
  { id: "f_ember",  kind: "frame", name: "Ember",  price: 700,  rarity: "rare", desc: "A ring of slow-burning embers." },
  { id: "f_runic",  kind: "frame", name: "Runic",  price: 1500, rarity: "epic", desc: "Carved runes that turn slowly." },
  { id: "f_laurel", kind: "frame", name: "Laurel", rarity: "epic", granted_by: "questbound", desc: "Green-gold laurels for finishing what you start." },
  { id: "f_duelist", kind: "frame", name: "Duelist", rarity: "rare", granted_by: "rival1", desc: "Crossed steel for finishing a challenge." },
  { id: "f_colossus", kind: "frame", name: "Colossus", rarity: "epic", granted_by: "bossslayer", desc: "Riveted iron from a fallen world boss." },
  { id: "n_victor", kind: "namefx", name: "Victor", rarity: "legendary", granted_by: "season_elite", desc: "Laurel gold for a top-10 season finish." },
  { id: "f_gilded", kind: "frame", name: "Gilded", rarity: "legendary", granted_by: "m2", desc: "Polished gold with a travelling shine." },
  { id: "f_titan",  kind: "frame", name: "Titan",  rarity: "legendary", granted_by: "s5", desc: "Heavy forged plates in crimson and violet." },
  // name effects
  { id: "n_gold",  kind: "namefx", name: "Gold Leaf",  price: 800,  rarity: "rare", desc: "Your name in gold." },
  { id: "n_frost", kind: "namefx", name: "Frost",      price: 800,  rarity: "rare", desc: "Your name in pale ice." },
  { id: "n_fire",  kind: "namefx", name: "Wildfire",   price: 1600, rarity: "epic", desc: "Flickering flames run through your name." },
  { id: "n_glow",  kind: "namefx", name: "Glow",       rarity: "epic", granted_by: "e5", desc: "Your name glows in your theme colour." },
  { id: "n_prism", kind: "namefx", name: "Prism",      rarity: "legendary", granted_by: "m4", desc: "Slowly shifting colours." },
  // rank effects
  { id: "r_pulse", kind: "rankfx", name: "Pulse", price: 900,  rarity: "rare", desc: "Your rank badge pulses with light." },
  { id: "r_aura",  kind: "rankfx", name: "Aura",  rarity: "epic", granted_by: "m3", desc: "A turning aura behind your rank badge." },
  { id: "r_halo",  kind: "rankfx", name: "Halo",  price: 2500, rarity: "legendary", desc: "A golden halo and rays around your rank." },
  // backgrounds
  { id: "b_dusk",   kind: "background", name: "Dusk",   price: 400,  rarity: "common", desc: "Warm evening gradient." },
  { id: "b_runes",  kind: "background", name: "Runes",  price: 1000, rarity: "rare", desc: "Faint carved runes." },
  { id: "b_aurora", kind: "background", name: "Aurora", price: 1800, rarity: "epic", desc: "Drifting northern lights." },
  { id: "b_forge",  kind: "background", name: "Forge",  rarity: "legendary", granted_by: "m5", desc: "Rising embers from the forge." },
  // avatars
  { id: "a_letter",   kind: "avatar", name: "Initial",  rarity: "common", granted_by: "default", desc: "The first letter of your name." },
  { id: "a_bolt",     kind: "avatar", name: "Bolt",     rarity: "common", granted_by: "default", glyph: "bolt" },
  { id: "a_dumbbell", kind: "avatar", name: "Dumbbell", rarity: "common", granted_by: "default", glyph: "dumbbell" },
  { id: "a_shield",   kind: "avatar", name: "Bulwark",  price: 400,  rarity: "rare", glyph: "shield" },
  { id: "a_skull",    kind: "avatar", name: "Skull",    price: 1200, rarity: "epic", glyph: "skull" },
  { id: "a_flame",    kind: "avatar", name: "Flame",    rarity: "rare", granted_by: "streak7", glyph: "flame" },
  { id: "a_moon",     kind: "avatar", name: "Moon",     rarity: "rare", granted_by: "restwise", glyph: "moon" },
  { id: "a_crown",    kind: "avatar", name: "Crown",    rarity: "epic", granted_by: "gilded", glyph: "crown" },
  { id: "a_star",     kind: "avatar", name: "Star",     rarity: "epic", granted_by: "recordbreaker", glyph: "star" }
].map((it) => it.kind === "theme" ? { ...it, name: THEMES[it.id].name } : it);

export const SLOTS = {
  title:      { name: "Titles",       one: "Title",       field: "title",      none: "rookie" },
  frame:      { name: "Frames",       one: "Frame",       field: "frame",      none: "none" },
  avatar:     { name: "Avatars",      one: "Avatar",      field: "avatar",     none: "a_letter" },
  namefx:     { name: "Name effects", one: "Name effect", field: "namefx",     none: "none" },
  rankfx:     { name: "Rank effects", one: "Rank effect", field: "rankfx",     none: "none" },
  background: { name: "Backgrounds",  one: "Background",  field: "background", none: "none" },
  theme:      { name: "Themes",       one: "Theme",       field: "theme",      none: "ember" }
};
export const owns = (p, id) => p.inventory.includes(id) || item(id)?.granted_by === "default";

export const item = (id) => ITEMS.find((x) => x.id === id);
export const titleName = (id) => item(id)?.name || "Rookie";

// Achievements (mirror of achievement_defs). prog(p) gives [current, target] for a progress bar, when there is one.
const tot = (p) => p.total_push + p.total_sit + (p.total_squat || 0);
export const ACHIEVEMENTS = [
  { id: "first_set",     cat: "Training",    name: "First Rep",      desc: "Finish your first set",                         prog: (p) => [p.sets_count, 1] },
  { id: "fifty",         cat: "Training",    name: "Half Century",   desc: "50 reps in one set",                            prog: (p) => [p.best_set, 50] },
  { id: "century",       cat: "Training",    name: "Centurion",      desc: "100 reps in one set",                           prog: (p) => [p.best_set, 100] },
  { id: "triple",        cat: "Training",    name: "Triple Threat",  desc: "Push-ups, sit-ups and squats on the same day" },
  { id: "dawn",          cat: "Training",    name: "Dawn Patrol",    desc: "Finish a set before 7 am" },
  { id: "night",         cat: "Training",    name: "Night Owl",      desc: "Finish a set after 10 pm" },
  { id: "k1",            cat: "Milestones",  name: "Thousand Club",  desc: "1,000 total reps",                              prog: (p) => [tot(p), 1000] },
  { id: "k10",           cat: "Milestones",  name: "Ten-K Machine",  desc: "10,000 total reps",                             prog: (p) => [tot(p), 10000] },
  { id: "push500",       cat: "Milestones",  name: "Press Pilgrim",  desc: "500 push-ups in total",                         prog: (p) => [p.total_push, 500] },
  { id: "sit500",        cat: "Milestones",  name: "Core of Steel",  desc: "500 sit-ups in total",                          prog: (p) => [p.total_sit, 500] },
  { id: "squat500",      cat: "Milestones",  name: "Leg Legend",     desc: "500 squats in total",                           prog: (p) => [p.total_squat || 0, 500] },
  { id: "streak7",       cat: "Consistency", name: "Week Warrior",   desc: "7-day streak",                                  prog: (p) => [p.streak, 7] },
  { id: "streak30",      cat: "Consistency", name: "Iron Habit",     desc: "30-day streak",                                 prog: (p) => [p.streak, 30] },
  { id: "restwise",      cat: "Consistency", name: "Restwise",       desc: "Log 5 rest days",                               prog: (p) => [p.rest_count || 0, 5] },
  { id: "questbound",    cat: "Consistency", name: "Questbound",     desc: "Claim 25 quest rewards",                        prog: (p) => [p.quests_done || 0, 25] },
  { id: "questmaster",   cat: "Consistency", name: "Quest Master",   desc: "Claim 100 quest rewards", grit: 150,            prog: (p) => [p.quests_done || 0, 100] },
  { id: "recordbreaker", cat: "Records",     name: "Record Breaker", desc: "Beat your personal records 5 times",            prog: (p) => [p.records_count || 0, 5] },
  { id: "gilded",        cat: "Progression", name: "Gilded",         desc: "Reach Gold rank",                               prog: (p) => [p.rp, 1750] },
  { id: "legend",        cat: "Progression", name: "Living Legend",  desc: "Reach Legend rank", grit: 200,                  prog: (p) => [p.rp, 14000] },
  { id: "level10",       cat: "Progression", name: "Seasoned",       desc: "Reach level 10",                                prog: (p) => [levelFor(p.xp).level, 10] },
  { id: "level25",       cat: "Progression", name: "Veteran Soul",   desc: "Reach level 25", grit: 150,                     prog: (p) => [levelFor(p.xp).level, 25] },
  { id: "apprentice",    cat: "Progression", name: "Apprentice",     desc: "Unlock your first skill",                       prog: (p) => [(p.skills || []).length, 1] },
  { id: "capstone",      cat: "Progression", name: "Capstone",       desc: "Unlock the last skill in any branch", grit: 150 },
  { id: "collector",     cat: "Collection",  name: "Collector",      desc: "Own 10 cosmetics", grit: 150,                   prog: (p) => [cosmeticsOwned(p), 10] },
  { id: "friend1",       cat: "Social",      name: "Squad Up",       desc: "Add your first friend" },
  { id: "rival1",        cat: "Social",      name: "Worthy Rival",   desc: "Finish a challenge with friends",               prog: (p) => [p.comp_done || 0, 1] },
  { id: "champion",      cat: "Social",      name: "Champion",       desc: "Win a challenge", grit: 150,                    prog: (p) => [p.comp_wins || 0, 1] },
  { id: "guild1",        cat: "Social",      name: "Banner Bearer",  desc: "Join or found a guild" },
  { id: "bossslayer",    cat: "Events",      name: "Boss Slayer",    desc: "Help defeat a world boss", grit: 150 },
  { id: "season_vet",    cat: "Seasons",     name: "Season Veteran", desc: "Finish a season with 300+ season points" },
  { id: "season_elite",  cat: "Seasons",     name: "Season Elite",   desc: "Finish a season in the top 10 with 900+ points", grit: 200 }
].map((a) => ({ grit: 100, ...a }));
export const achievement = (id) => ACHIEVEMENTS.find((a) => a.id === id);
export const unlockName = (id) => achievement(id)?.name || item(id)?.name || id;
export function cosmeticsOwned(p) { return p.inventory.filter((id) => { const it = item(id); return it && ["frame", "namefx", "rankfx", "background", "avatar"].includes(it.kind) && it.granted_by !== "default"; }).length; }

// Skill tree (mirror of skill_defs). One skill point per level after the first.
export const BRANCHES = [
  { id: "discipline", name: "Discipline", color: "#3fd0b6", blurb: "Consistency, quests and streaks" },
  { id: "strength",   name: "Strength",   color: "#ff6b5b", blurb: "Milestones and camera-tracked training" },
  { id: "experience", name: "Experience", color: "#9d8cff", blurb: "XP and achievement bonuses" },
  { id: "mastery",    name: "Mastery",    color: "#f5c84c", blurb: "Cosmetics, effects and titles" }
];
export const SKILLS = [
  { id: "d1", branch: "discipline", tier: 1, cost: 1, name: "Steady Habit",     desc: "+50% Grit from the daily Show up quest", icon: "check" },
  { id: "d2", branch: "discipline", tier: 2, cost: 1, name: "Second Wind",      desc: "Hold 4 Streak Shields instead of 3", icon: "shield" },
  { id: "d3", branch: "discipline", tier: 3, cost: 2, name: "Quest Ledger",     desc: "+10% Grit from every quest", icon: "scroll" },
  { id: "d4", branch: "discipline", tier: 4, cost: 2, name: "Rest Ritual",      desc: "Log 3 rest days a week instead of 2", icon: "moon" },
  { id: "d5", branch: "discipline", tier: 5, cost: 3, name: "Unbroken",         desc: "+25 Grit from the daily drop. Unlocks the Unbroken title", icon: "flame" },
  { id: "s1", branch: "strength",   tier: 1, cost: 1, name: "Iron Will",        desc: "+10% Grit from camera-tracked sets", icon: "camera" },
  { id: "s2", branch: "strength",   tier: 2, cost: 1, name: "Milestone Hunter", desc: "Achievements pay +50 Grit more", icon: "trophy" },
  { id: "s3", branch: "strength",   tier: 3, cost: 2, name: "Clean Reps",       desc: "+10% rank points from camera-tracked sets", icon: "dumbbell" },
  { id: "s4", branch: "strength",   tier: 4, cost: 2, name: "Record Bounty",    desc: "+50 Grit every time you beat a personal record", icon: "star" },
  { id: "s5", branch: "strength",   tier: 5, cost: 3, name: "Unyielding",       desc: "Unlocks the Titan frame and the Unyielding title", icon: "shield" },
  { id: "e1", branch: "experience", tier: 1, cost: 1, name: "Quick Study",      desc: "+10% XP from sets", icon: "bolt" },
  { id: "e2", branch: "experience", tier: 2, cost: 1, name: "Scholar",          desc: "+25% XP from quests", icon: "scroll" },
  { id: "e3", branch: "experience", tier: 3, cost: 2, name: "Veteran",          desc: "Another +10% XP from sets", icon: "bolt" },
  { id: "e4", branch: "experience", tier: 4, cost: 2, name: "Record Keeper",    desc: "+100 XP every time you beat a personal record", icon: "star" },
  { id: "e5", branch: "experience", tier: 5, cost: 3, name: "Sage",             desc: "Unlocks the Glow name effect and the Sage title", icon: "sparkle" },
  { id: "m1", branch: "mastery",    tier: 1, cost: 1, name: "Showcase",         desc: "Show 3 achievements on your profile instead of 1", icon: "trophy" },
  { id: "m2", branch: "mastery",    tier: 2, cost: 1, name: "Gilded",           desc: "Unlocks the Gilded frame", icon: "user" },
  { id: "m3", branch: "mastery",    tier: 3, cost: 2, name: "Aura",             desc: "Unlocks the Aura rank effect", icon: "sparkle" },
  { id: "m4", branch: "mastery",    tier: 4, cost: 2, name: "Prismatic",        desc: "Unlocks the Prism name effect", icon: "sparkle" },
  { id: "m5", branch: "mastery",    tier: 5, cost: 3, name: "Grandmaster",      desc: "Unlocks the Forge background and the Grandmaster title", icon: "crown" }
].map((s) => ({ ...s, requires: s.tier > 1 ? s.id[0] + (s.tier - 1) : null }));
export const skill = (id) => SKILLS.find((s) => s.id === id);
export const has = (p, id) => (p.skills || []).includes(id);
export const spFree = (p) => levelFor(p.xp).level - 1 - SKILLS.filter((s) => has(p, s.id)).reduce((a, s) => a + s.cost, 0);
export const showcaseSlots = (p) => has(p, "m1") ? 3 : 1;

// Exercise colours are fixed per exercise (validated for colour-blind separation on the dark panels).
export const EXERCISES = {
  push:  { name: "Push-ups", one: "push-up", color: "#3987e5", rp: 1.0 },
  sit:   { name: "Sit-ups",  one: "sit-up",  color: "#d95926", rp: 0.8 },
  squat: { name: "Squats",   one: "squat",   color: "#199e70", rp: 0.8 }
};
export const KINDS = ["push", "sit", "squat"];

export const RECORDS = [
  { key: "set_push",     label: "Most push-ups in a set", unit: "reps", cam: true },
  { key: "set_sit",      label: "Most sit-ups in a set",  unit: "reps", cam: true },
  { key: "set_squat",    label: "Most squats in a set",   unit: "reps", cam: true },
  { key: "day_reps",     label: "Best day",               unit: "reps" },
  { key: "week_reps",    label: "Best week",              unit: "reps" },
  { key: "session_secs", label: "Longest session",        unit: "time" },
  { key: "week_days",    label: "Most consistent week",   unit: "days" }
];
export const recordMeta = (k) => RECORDS.find((r) => r.key === k);

// Mirror of quest_defs in schema.sql (local mode uses this; online the server's copy wins).
export const QUESTS = [
  { id: "d_checkin", period: "daily",  slot: "fixed", metric: "checkin",    target: 1,   xp: 20,  grit: 15,  title: "Show up",          description: "Finish any set, or log a rest day" },
  { id: "d_reps50",  period: "daily",  slot: "pool",  metric: "reps",       target: 50,  xp: 40,  grit: 30,  title: "Fifty strong",     description: "Do 50 reps of anything" },
  { id: "d_push30",  period: "daily",  slot: "pool",  metric: "reps_push",  target: 30,  xp: 40,  grit: 30,  title: "Press day",        description: "Do 30 push-ups" },
  { id: "d_sit30",   period: "daily",  slot: "pool",  metric: "reps_sit",   target: 30,  xp: 40,  grit: 30,  title: "Core work",        description: "Do 30 sit-ups" },
  { id: "d_squat30", period: "daily",  slot: "pool",  metric: "reps_squat", target: 30,  xp: 40,  grit: 30,  title: "Leg day",          description: "Do 30 squats" },
  { id: "d_sets3",   period: "daily",  slot: "pool",  metric: "sets",       target: 3,   xp: 35,  grit: 25,  title: "Three rounds",     description: "Finish 3 sets" },
  { id: "d_cam",     period: "daily",  slot: "pool",  metric: "cam_sets",   target: 1,   xp: 30,  grit: 25,  title: "On camera",        description: "Finish a camera-tracked set" },
  { id: "d_secs180", period: "daily",  slot: "pool",  metric: "secs",       target: 180, xp: 35,  grit: 25,  title: "Three minutes",    description: "Train for 3 minutes in total" },
  { id: "w_reps250", period: "weekly", slot: "fixed", metric: "reps",       target: 250, xp: 150, grit: 120, title: "Quarter thousand", description: "Do 250 reps this week" },
  { id: "w_days4",   period: "weekly", slot: "fixed", metric: "days",       target: 4,   xp: 150, grit: 120, title: "Four-day week",    description: "Train on 4 different days" },
  { id: "w_sets10",  period: "weekly", slot: "fixed", metric: "sets",       target: 10,  xp: 120, grit: 100, title: "Ten sets",         description: "Finish 10 sets this week" },
  { id: "w_record",  period: "weekly", slot: "fixed", metric: "records",    target: 1,   xp: 120, grit: 100, title: "New personal best", description: "Beat one of your personal records" },
  { id: "w_rest",    period: "weekly", slot: "fixed", metric: "rest",       target: 1,   xp: 80,  grit: 80,  title: "Recover",          description: "Log a rest day. Muscles grow while you recover." }
];
