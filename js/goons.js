/* ============================================================
   goons.js — Goon Skills: collectible skill cards + gacha
   ------------------------------------------------------------
   62 skills across 7 rarities. Players equip 1 Momentum, 1
   Technique, 1 Wildcard. Effects hook into the match engine via
   a small set of balanced primitives (mech.kind) — total skill
   contribution is hard-capped so clap skill still decides wins.
   No skill touches, stores, or uploads microphone audio.
   ============================================================ */

export const RARITIES = {
  common:    { name: "Common",    color: "#8a90a0", weight: 52,  glow: "rgba(138,144,160,0.5)" },
  uncommon:  { name: "Uncommon",  color: "#3ee08a", weight: 27,  glow: "rgba(62,224,138,0.5)" },
  rare:      { name: "Rare",      color: "#4d9cff", weight: 13,  glow: "rgba(77,156,255,0.5)" },
  epic:      { name: "Epic",      color: "#b14dff", weight: 5.5, glow: "rgba(177,77,255,0.55)" },
  legendary: { name: "Legendary", color: "#ffd05a", weight: 2,   glow: "rgba(255,208,90,0.6)" },
  artifact:  { name: "Artifact",  color: "#ff6a3d", weight: 0.5, glow: "rgba(255,106,61,0.6)", holo: true },
  limited:   { name: "Limited",   color: "#ff3d9f", weight: 0,   glow: "rgba(255,61,159,0.6)", rainbow: true },
};
export const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "artifact", "limited"];

// Dust value gained when converting a duplicate, and craft cost per rarity.
export const DUST_VALUE = { common: 5, uncommon: 12, rare: 30, epic: 80, legendary: 200, artifact: 500, limited: 0 };
export const CRAFT_COST = { common: 30, uncommon: 80, rare: 220, epic: 600, legendary: 1500, artifact: 4000 };

export const SUMMON_COST = 150;           // Clap Coins per single pull
export const SUMMON_COST_10 = 1350;       // 10x (one free)
export const EVENT_DURATION_MS = 4 * 24 * 60 * 60 * 1000; // 4 days

/* ---- The 62 skills (12/12/11/10/8/7/2) --------------------------------------
   mech.kind primitives the engine understands:
     shield   { saves, reducePct }          save a combo drop, at a cost
     burst    { bonus, capPerMatch }         bonus points on a PERFECT hit
     rhythm   { needSteady, bonusPct, window } steady tempo → next claps bonus
     overdrive{ charge, boostPct, durMs, cdMs } perfects charge a timed boost
     recover  { pct }                        rebuild combo faster after a drop
     endbonus { kind, amount }               end-of-match conditional bonus
     mult     { pct, condition }             small capped conditional multiplier
     luck     { coinPct, dust, discountPct, pityBoost, reroll } economy (out of match)
     risk     { bonus, penalty }             big burst bonus, penalty on a bad miss
   Every score-affecting skill has a cap/cooldown/condition. Economy (luck)
   skills never affect in-match score. rankedAllowed=false hides random ones. */
export const SKILLS = [
  // ===================== COMMON (12) =====================
  { id: "metronome",   name: "Basement Metronome", rarity: "common", type: "technique", tag: "RHYTHM",
    flavor: "Tick. Tick. Tick. You've heard it in your sleep.",
    effect: "After 5 steady claps, your next 3 claps give +15% points. Resets if your timing gets erratic.",
    mech: { kind: "rhythm", needSteady: 5, bonusPct: 0.15, window: 3 }, rankedAllowed: true },
  { id: "warmhands",   name: "Warm Hands", rarity: "common", type: "momentum", tag: "COMBO",
    flavor: "Ten seconds of stretching. Peak preparation.",
    effect: "Your first 8 claps of a match each grant +2 flat points.",
    mech: { kind: "endbonus", kind2: "opener", amount: 2, count: 8 }, rankedAllowed: true },
  { id: "steadyhands",  name: "Steady Hands", rarity: "common", type: "technique", tag: "RHYTHM",
    flavor: "No shakes. No jitters. Mostly.",
    effect: "While your clap tempo stays even, gain +8% points (no cap, ends when you break rhythm).",
    mech: { kind: "rhythm", needSteady: 3, bonusPct: 0.08, window: 999 }, rankedAllowed: true },
  { id: "lintroller",  name: "Lint Roller", rarity: "common", type: "wildcard", tag: "LUCK",
    flavor: "Cleaned your hoodie, found some change.",
    effect: "Earn +6% Clap Coins from matches. (Economy only — no score effect.)",
    mech: { kind: "luck", coinPct: 0.06 }, rankedAllowed: true },
  { id: "spare1up",    name: "Spare 1-Up", rarity: "common", type: "momentum", tag: "SHIELD",
    flavor: "Kept one in your back pocket. Classic.",
    effect: "Once per match, a combo drop only cuts your combo in half instead of to zero.",
    mech: { kind: "shield", saves: 1, reducePct: 0.5 }, rankedAllowed: true },
  { id: "snackbreak",  name: "Snack Break", rarity: "common", type: "wildcard", tag: "LUCK",
    flavor: "Refueled on gummy worms. Elite nutrition.",
    effect: "Finish a match to bank +3 Goon Dust. (Economy only.)",
    mech: { kind: "luck", dust: 3 }, rankedAllowed: true },
  { id: "tinytempo",   name: "Tiny Tempo", rarity: "common", type: "technique", tag: "BURST",
    flavor: "Small bursts. Big dreams.",
    effect: "PERFECT-timed claps grant +4 points each (max +120 per match).",
    mech: { kind: "burst", bonus: 4, capPerMatch: 120 }, rankedAllowed: true },
  { id: "secondwind",  name: "Second Wind", rarity: "common", type: "momentum", tag: "COMBO",
    flavor: "You found it behind the couch.",
    effect: "After a combo drop, rebuild combo 20% faster for 3 seconds.",
    mech: { kind: "recover", pct: 0.2, durMs: 3000 }, rankedAllowed: true },
  { id: "couchgoblin", name: "Couch Goblin", rarity: "common", type: "wildcard", tag: "LUCK",
    flavor: "Lives between the cushions. Pays rent in coins.",
    effect: "+4% Clap Coins and +2 Dust from matches. (Economy only.)",
    mech: { kind: "luck", coinPct: 0.04, dust: 2 }, rankedAllowed: true },
  { id: "focusfingers",name: "Focus Fingers", rarity: "common", type: "technique", tag: "RHYTHM",
    flavor: "Locked in. Do not perceive you.",
    effect: "Your last 6 seconds of a match give +10% points.",
    mech: { kind: "endbonus", kind2: "closer", amount: 0.1, durMs: 6000 }, rankedAllowed: true },
  { id: "pocketsand",  name: "Pocket Sand", rarity: "common", type: "wildcard", tag: "BURST",
    flavor: "Sh-sh-sha! Situational, but iconic.",
    effect: "Custom mode only: your first PERFECT each match grants +40 points.",
    mech: { kind: "burst", bonus: 40, capPerMatch: 40, modes: ["custom"] }, rankedAllowed: true },
  { id: "steadyheart",  name: "Steady Heart", rarity: "common", type: "momentum", tag: "COMBO",
    flavor: "BPM matches your heartbeat. Cardio counts.",
    effect: "Hold a 12+ combo to gain +5% points until it drops.",
    mech: { kind: "mult", pct: 0.05, condition: "combo12" }, rankedAllowed: true },

  // ===================== UNCOMMON (12) =====================
  { id: "greenstreak", name: "Green Streak", rarity: "uncommon", type: "momentum", tag: "COMBO",
    flavor: "The bar goes up. So does your ego.",
    effect: "Every 15-combo milestone grants a +25 point burst (max 4 per match).",
    mech: { kind: "burst", bonus: 25, capPerMatch: 100, on: "milestone15" }, rankedAllowed: true },
  { id: "cleanhands",  name: "Clean Hands", rarity: "uncommon", type: "technique", tag: "RHYTHM",
    flavor: "Precision over power. Allegedly.",
    effect: "Steady rhythm bonus raised to +12% and holds through minor timing slips.",
    mech: { kind: "rhythm", needSteady: 4, bonusPct: 0.12, window: 999, forgiving: true }, rankedAllowed: true },
  { id: "comboglue",   name: "Combo Glue", rarity: "uncommon", type: "momentum", tag: "SHIELD",
    flavor: "Non-toxic. Extra sticky.",
    effect: "Twice per match, a combo drop only cuts combo by 40%.",
    mech: { kind: "shield", saves: 2, reducePct: 0.4 }, rankedAllowed: true },
  { id: "burstpack",   name: "Burst Pack", rarity: "uncommon", type: "technique", tag: "BURST",
    flavor: "Batteries not included, energy is.",
    effect: "PERFECT claps grant +7 points each (max +200 per match).",
    mech: { kind: "burst", bonus: 7, capPerMatch: 200 }, rankedAllowed: true },
  { id: "loosechange", name: "Loose Change Fiend", rarity: "uncommon", type: "wildcard", tag: "LUCK",
    flavor: "Found $0.63 and a lot of purpose.",
    effect: "+10% Clap Coins from matches. (Economy only.)",
    mech: { kind: "luck", coinPct: 0.10 }, rankedAllowed: true },
  { id: "reboundking", name: "Rebound King", rarity: "uncommon", type: "momentum", tag: "COMBO",
    flavor: "Down bad, up fast.",
    effect: "After a combo drop, your next 5 claps count double toward combo.",
    mech: { kind: "recover", pct: 1.0, claps: 5 }, rankedAllowed: true },
  { id: "gymtimer",    name: "Gym Timer", rarity: "uncommon", type: "technique", tag: "RHYTHM",
    flavor: "45 seconds on. 15 off. You're locked in.",
    effect: "Maintain 6+ CPS for 4s to bank a +60 point interval bonus (repeatable, 6s cooldown).",
    mech: { kind: "burst", bonus: 60, cooldownMs: 6000, on: "sustain6cps" }, rankedAllowed: true },
  { id: "luckycricket",name: "Lucky Cricket", rarity: "uncommon", type: "wildcard", tag: "LUCK",
    flavor: "Chirps when you're about to hit big.",
    effect: "+1% gacha luck (nudges you toward Rare+). (Economy only.)",
    mech: { kind: "luck", pityBoost: 1 }, rankedAllowed: true },
  { id: "dustbunny",   name: "Dust Bunny", rarity: "uncommon", type: "wildcard", tag: "LUCK",
    flavor: "Multiplies in the corner. Cute, useful.",
    effect: "+5 Goon Dust per finished match. (Economy only.)",
    mech: { kind: "luck", dust: 5 }, rankedAllowed: true },
  { id: "finisher",    name: "The Finisher", rarity: "uncommon", type: "technique", tag: "BURST",
    flavor: "Closes tabs and matches.",
    effect: "Your final 3 seconds give +18% points.",
    mech: { kind: "endbonus", kind2: "closer", amount: 0.18, durMs: 3000 }, rankedAllowed: true },
  { id: "trashtalk",   name: "Trash Talk", rarity: "uncommon", type: "wildcard", tag: "COMBO",
    flavor: "All bark. Surprisingly effective bite.",
    effect: "Duel only: while your bar is losing, gain +12% push. (Comeback aid.)",
    mech: { kind: "mult", pct: 0.12, condition: "duelLosing", modes: ["duel", "ranked"] }, rankedAllowed: true },
  { id: "quickstep",   name: "Quickstep", rarity: "uncommon", type: "momentum", tag: "COMBO",
    flavor: "Light on the hands. Heavy on the score.",
    effect: "Hold a 20+ combo for +7% points until it drops.",
    mech: { kind: "mult", pct: 0.07, condition: "combo20" }, rankedAllowed: true },

  // ===================== RARE (11) =====================
  { id: "combobandage",name: "Combo Bandage", rarity: "rare", type: "momentum", tag: "SHIELD",
    flavor: "Rip. Stick. Keep clapping.",
    effect: "Once per match, fully save a combo from dropping — but it's reduced by 25%.",
    mech: { kind: "shield", saves: 1, reducePct: 0.25 }, rankedAllowed: true },
  { id: "beatreader",  name: "Beat Reader", rarity: "rare", type: "technique", tag: "RHYTHM",
    flavor: "Sees the beat two claps ahead.",
    effect: "PERFECT windows are 20% wider and PERFECT claps grant +9 points (cap +240).",
    mech: { kind: "burst", bonus: 9, capPerMatch: 240, perfectWindowBoost: 0.2 }, rankedAllowed: true },
  { id: "flowstate",   name: "Flow State", rarity: "rare", type: "technique", tag: "RHYTHM",
    flavor: "Time dilates. Hands stay real.",
    effect: "Steady rhythm bonus scales up to +16% the longer you hold it (resets on break).",
    mech: { kind: "rhythm", needSteady: 4, bonusPct: 0.16, window: 999, ramp: true }, rankedAllowed: true },
  { id: "risktaker",   name: "Risk Taker", rarity: "rare", type: "wildcard", tag: "BURST",
    flavor: "High ceiling. Sticky floor.",
    effect: "PERFECT claps grant +14 points, but a badly-missed beat costs 10 points. (cap +260)",
    mech: { kind: "risk", bonus: 14, penalty: 10, capPerMatch: 260 }, rankedAllowed: true },
  { id: "shopkeeper",  name: "Shopkeeper's Nephew", rarity: "rare", type: "wildcard", tag: "LUCK",
    flavor: "Family discount. Don't ask questions.",
    effect: "Backroom shop prices −12% for you. (Economy only.)",
    mech: { kind: "luck", discountPct: 0.12 }, rankedAllowed: true },
  { id: "momentumcore",name: "Momentum Core", rarity: "rare", type: "momentum", tag: "COMBO",
    flavor: "The flywheel spins whether you like it or not.",
    effect: "Every 10 claps without a drop grants a stacking +2% (max +12%, resets on drop).",
    mech: { kind: "mult", pct: 0.02, stackEvery: 10, maxPct: 0.12, condition: "nodrops" }, rankedAllowed: true },
  { id: "safetynet",   name: "Safety Net", rarity: "rare", type: "momentum", tag: "SHIELD",
    flavor: "Bounces you right back into the mix.",
    effect: "Twice per match a drop is cut by 50%, and you recover combo 30% faster after.",
    mech: { kind: "shield", saves: 2, reducePct: 0.5, recoverPct: 0.3 }, rankedAllowed: true },
  { id: "goldenreroll",name: "Golden Reroll", rarity: "rare", type: "wildcard", tag: "LUCK",
    flavor: "Second chances, coin-operated.",
    effect: "One free Backroom shop reroll per restock. (Economy only.)",
    mech: { kind: "luck", reroll: 1 }, rankedAllowed: true },
  { id: "encore",      name: "Encore", rarity: "rare", type: "technique", tag: "BURST",
    flavor: "One more time, for the people in the back.",
    effect: "End-of-match: +2 points per PERFECT you landed this match.",
    mech: { kind: "endbonus", kind2: "perPerfect", amount: 2 }, rankedAllowed: true },
  { id: "adrenaline",  name: "Adrenaline Dump", rarity: "rare", type: "wildcard", tag: "BURST",
    flavor: "Fight-or-flight, but it's just clapping.",
    effect: "When under 8s remain, all points +10%.",
    mech: { kind: "endbonus", kind2: "closer", amount: 0.10, durMs: 8000 }, rankedAllowed: true },
  { id: "cooldownchip",name: "Cooldown Chip", rarity: "rare", type: "wildcard", tag: "COMBO",
    flavor: "Overclocked. Slightly warm to the touch.",
    effect: "All your skill cooldowns are 20% shorter.",
    mech: { kind: "luck", cdReduce: 0.2 }, rankedAllowed: true },

  // ===================== EPIC (10) =====================
  { id: "turbogoblin", name: "Turbo Goblin", rarity: "epic", type: "wildcard", tag: "BURST",
    flavor: "Little guy. Big throttle. Questionable ethics.",
    effect: "Charge on 6 PERFECTs → +18% points for 4s, then −6% for 3s. (auto, 12s cooldown)",
    mech: { kind: "overdrive", charge: 6, boostPct: 0.18, durMs: 4000, dropPct: 0.06, dropMs: 3000, cdMs: 12000 }, rankedAllowed: true },
  { id: "chainlink",   name: "Chain Link", rarity: "epic", type: "momentum", tag: "COMBO",
    flavor: "Each link makes the next one meaner.",
    effect: "Combo multiplier reaches ×2 faster (ramp +40%). Ranked-safe: still caps at ×2.",
    mech: { kind: "comboramp", faster: 0.4 }, rankedAllowed: true },
  { id: "metrognome",  name: "The Metrognome", rarity: "epic", type: "technique", tag: "RHYTHM",
    flavor: "A gnome with a metronome. Do not question the lore.",
    effect: "Perfect steady rhythm grants +18% and refunds 1 combo-shield charge every 10s of flow.",
    mech: { kind: "rhythm", needSteady: 5, bonusPct: 0.18, window: 999, refundShield: 10000 }, rankedAllowed: true },
  { id: "doubledown",  name: "Double or Nothing", rarity: "epic", type: "wildcard", tag: "BURST",
    flavor: "The house always claps.",
    effect: "PERFECT claps grant +20 (cap +320) — but 3 missed beats in a row disables it for 5s.",
    mech: { kind: "risk", bonus: 20, penalty: 0, disableOnMiss: 3, disableMs: 5000, capPerMatch: 320 }, rankedAllowed: true },
  { id: "phoenix",     name: "Phoenix Protocol", rarity: "epic", type: "momentum", tag: "SHIELD",
    flavor: "From the ashes of a dropped combo, you rise.",
    effect: "Once per match: on a drop, instantly restore combo to 60% and +12% points for 3s.",
    mech: { kind: "shield", saves: 1, reducePct: 0.4, revive: 0.6, reviveBoostPct: 0.12, reviveMs: 3000 }, rankedAllowed: true },
  { id: "hotstreak",   name: "Hot Streak", rarity: "epic", type: "momentum", tag: "COMBO",
    flavor: "You are, in fact, on fire. Metaphorically.",
    effect: "40+ combo grants a stacking +3% (max +12%). Big drop resets it.",
    mech: { kind: "mult", pct: 0.03, stackEvery: 20, maxPct: 0.12, condition: "combo40" }, rankedAllowed: true },
  { id: "luckydragon", name: "Lucky Dragon", rarity: "epic", type: "wildcard", tag: "LUCK",
    flavor: "Hoards coins. Occasionally shares.",
    effect: "+18% Clap Coins, +8 Dust, +2% gacha luck. (Economy only.)",
    mech: { kind: "luck", coinPct: 0.18, dust: 8, pityBoost: 2 }, rankedAllowed: true },
  { id: "precisionist", name: "The Precisionist", rarity: "epic", type: "technique", tag: "RHYTHM",
    flavor: "Off by a millisecond? Unacceptable.",
    effect: "PERFECT windows +30% wider; each PERFECT +11 (cap +300).",
    mech: { kind: "burst", bonus: 11, capPerMatch: 300, perfectWindowBoost: 0.3 }, rankedAllowed: true },
  { id: "gambit",      name: "Closing Gambit", rarity: "epic", type: "wildcard", tag: "BURST",
    flavor: "Save it all for the buzzer. Bold.",
    effect: "Final 5s: points +25%, but the first 5s of the match give −10%.",
    mech: { kind: "endbonus", kind2: "gambit", lateAmount: 0.25, earlyPenalty: 0.10 }, rankedAllowed: true },
  { id: "sharingclap", name: "Sharin-Clap", rarity: "epic", type: "technique", tag: "RHYTHM",
    flavor: "You perceive the rhythm before it happens. Cap.",
    effect: "For 5s after 3 PERFECTs, you 'read' the beat — PERFECT windows +40% (8s cooldown).",
    mech: { kind: "overdrive", charge: 3, readPct: 0.4, durMs: 5000, cdMs: 8000, boostPct: 0 }, rankedAllowed: true },

  // ===================== LEGENDARY (8) =====================
  { id: "neonconductor", name: "Neon Conductor", rarity: "legendary", type: "technique", tag: "RHYTHM",
    flavor: "Wave the baton. The arena obeys.",
    effect: "Land 10 PERFECTs to enter OVERDRIVE: +22% points for 5s. Must be earned each time.",
    mech: { kind: "overdrive", charge: 10, boostPct: 0.22, durMs: 5000, cdMs: 4000 }, rankedAllowed: true },
  { id: "ninetailscloak", name: "Nine-Tails Cloak", rarity: "legendary", type: "momentum", tag: "COMBO",
    flavor: "The cloak feeds on your streak. Do not lose it.",
    effect: "Every 25 unbroken combo adds a tail: +4% each (max 4 tails / +16%). A drop rips them off.",
    mech: { kind: "mult", pct: 0.04, stackEvery: 25, maxPct: 0.16, condition: "nodrops", losesOnDrop: true }, rankedAllowed: true },
  { id: "rasenburst",  name: "Rasen-Burst", rarity: "legendary", type: "technique", tag: "BURST",
    flavor: "Spin the chakra. Spin the score.",
    effect: "Every 6th PERFECT detonates for +90 points (2s cooldown, cap 6 detonations).",
    mech: { kind: "burst", bonus: 90, on: "every6perfect", cooldownMs: 2000, capCount: 6 }, rankedAllowed: true },
  { id: "guardianstance", name: "Guardian Stance", rarity: "legendary", type: "momentum", tag: "SHIELD",
    flavor: "Ribs of blue armor. Nothing gets through.",
    effect: "3 combo-shields per match (drop cut by 60%), and recover 40% faster after each.",
    mech: { kind: "shield", saves: 3, reducePct: 0.6, recoverPct: 0.4 }, rankedAllowed: true },
  { id: "overclock",   name: "Overclock", rarity: "legendary", type: "wildcard", tag: "BURST",
    flavor: "Redline the hands. Ignore the smoke.",
    effect: "Sustain 8+ CPS to build heat; at max heat, +20% for 4s then a 6s cooldown.",
    mech: { kind: "overdrive", charge: 8, boostPct: 0.20, durMs: 4000, cdMs: 6000, on: "sustain8cps" }, rankedAllowed: true },
  { id: "goldentempo", name: "Golden Tempo", rarity: "legendary", type: "technique", tag: "RHYTHM",
    flavor: "The perfect BPM. Bottled. Illegal in 3 states.",
    effect: "Steady rhythm bonus up to +20%, and PERFECTs while steady grant +12 (cap +260).",
    mech: { kind: "rhythm", needSteady: 5, bonusPct: 0.20, window: 999, perfectBonus: 12, perfectCap: 260 }, rankedAllowed: true },
  { id: "jackpotheart", name: "Jackpot Heart", rarity: "legendary", type: "wildcard", tag: "LUCK",
    flavor: "Every pull feels destined. It isn't, but still.",
    effect: "+25% Clap Coins, +15 Dust, +4% gacha luck, −15% shop prices. (Economy only.)",
    mech: { kind: "luck", coinPct: 0.25, dust: 15, pityBoost: 4, discountPct: 0.15 }, rankedAllowed: true },
  { id: "lastdance",   name: "Last Dance", rarity: "legendary", type: "wildcard", tag: "BURST",
    flavor: "When the timer bleeds, you bloom.",
    effect: "Final 6s: +30% points and one auto combo-save. High risk, huge payoff.",
    mech: { kind: "endbonus", kind2: "closer", amount: 0.30, durMs: 6000, autoSave: 1 }, rankedAllowed: true },

  // ===================== ARTIFACT (7) =====================
  { id: "forbiddenmetro", name: "The Forbidden Metronome", rarity: "artifact", type: "technique", tag: "RHYTHM",
    flavor: "It ticks even when unwound. Best not to ask.",
    effect: "Perfect rhythm grants a massive +26% — but 2 badly-missed beats in a row wipe your combo.",
    mech: { kind: "rhythm", needSteady: 6, bonusPct: 0.26, window: 999, wipeOnMiss: 2 }, rankedAllowed: true },
  { id: "susanooheart", name: "Heart of the Guardian", rarity: "artifact", type: "momentum", tag: "SHIELD",
    flavor: "A spectral warrior claps beside you. Unnerving. Effective.",
    effect: "4 combo-shields (drop cut 70%). At 60+ combo, the guardian grants +14% until you drop.",
    mech: { kind: "shield", saves: 4, reducePct: 0.7, guardianMult: 0.14, guardianAt: 60 }, rankedAllowed: true },
  { id: "singularity", name: "Singularity", rarity: "artifact", type: "wildcard", tag: "BURST",
    flavor: "Collapses the scoreboard into a single, dense number.",
    effect: "PERFECTs feed a black hole; release at 12 charge for +180 points (once per match).",
    mech: { kind: "overdrive", charge: 12, blastPoints: 180, once: true, boostPct: 0, durMs: 1 }, rankedAllowed: true },
  { id: "bankaicrescent", name: "Crimson Bankai", rarity: "artifact", type: "technique", tag: "BURST",
    flavor: "Release. The blade decides the tempo now.",
    effect: "Every 8th PERFECT unleashes a crescent for +110 (cap 5), and widens PERFECT windows +25%.",
    mech: { kind: "burst", bonus: 110, on: "every8perfect", capCount: 5, perfectWindowBoost: 0.25 }, rankedAllowed: true },
  { id: "domainseal",  name: "Domain: Sure-Hit", rarity: "artifact", type: "momentum", tag: "COMBO",
    flavor: "Expand the territory. Inside it, you do not miss.",
    effect: "Reach a 50-combo to expand your Domain for 6s: guaranteed rhythm bonus +22% (once/match).",
    mech: { kind: "overdrive", charge: 0, comboTrigger: 50, boostPct: 0.22, durMs: 6000, once: true }, rankedAllowed: true },
  { id: "phoenixcore", name: "Phoenix Core", rarity: "artifact", type: "momentum", tag: "SHIELD",
    flavor: "Death is a tempo change, nothing more.",
    effect: "Twice per match, a drop revives combo to 75% with +16% points for 3s.",
    mech: { kind: "shield", saves: 2, reducePct: 0.4, revive: 0.75, reviveBoostPct: 0.16, reviveMs: 3000 }, rankedAllowed: true },
  { id: "kingsgambit", name: "The King's Gambit", rarity: "artifact", type: "wildcard", tag: "BURST",
    flavor: "Sacrifice the early game. Coronate the late.",
    effect: "First 8s: −15%. Final 8s: +35% and a guaranteed Overdrive. For closers only.",
    mech: { kind: "endbonus", kind2: "gambit", lateAmount: 0.35, earlyPenalty: 0.15, autoOverdrive: true }, rankedAllowed: true },

  // ===================== LIMITED (2, event-only) =====================
  { id: "fourdayfiend", name: "Four-Day Fiend", rarity: "limited", type: "wildcard", tag: "BURST",
    flavor: "Here for a good time, not a long time. Literally four days.",
    effect: "PERFECTs charge a rainbow meter; at full, +24% for 4s (8s cd). Balanced to Legendary in Ranked.",
    mech: { kind: "overdrive", charge: 8, boostPct: 0.24, durMs: 4000, cdMs: 8000 }, rankedAllowed: true, limited: true },
  { id: "eventhorizon", name: "Event Horizon", rarity: "limited", type: "technique", tag: "RHYTHM",
    flavor: "The banner closes. The rhythm remains — for those who caught it.",
    effect: "Steady rhythm +21% and every 10th PERFECT grants +70 (cap 4). Event-exclusive.",
    mech: { kind: "rhythm", needSteady: 5, bonusPct: 0.21, window: 999, perfectEvery: 10, perfectBonus: 70, perfectCap: 4 }, rankedAllowed: true, limited: true },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export function skillById(id) { return SKILL_BY_ID[id] || null; }
export const TYPES = ["momentum", "technique", "wildcard"];

// Total skill contribution to a match is capped so clap skill still wins.
export const SKILL_SCORE_CAP = 0.15;

// Recommended starter loadout (reliable, low-skill-floor)
export const STARTER_LOADOUT = { momentum: "spare1up", technique: "metronome", wildcard: "lintroller" };
export const STARTER_OWNED = ["spare1up", "metronome", "lintroller", "warmhands", "tinytempo", "snackbreak"];

// ---- Pity + gacha ----------------------------------------------------------
export const PITY = { rare: 10, epic: 40, legByArt: 80 };

function weightedPick(pool) {
  const total = pool.reduce((s, r) => s + RARITIES[r].weight, 0);
  let x = Math.random() * total;
  for (const r of pool) { x -= RARITIES[r].weight; if (x <= 0) return r; }
  return pool[0];
}

/**
 * Roll one summon. Mutates pity counters on the gacha object.
 * @param gacha { sinceRare, sinceEpic, sinceLeg, luck }
 * @returns rarity key
 */
export function rollRarity(gacha) {
  gacha.sinceRare = (gacha.sinceRare || 0) + 1;
  gacha.sinceEpic = (gacha.sinceEpic || 0) + 1;
  gacha.sinceLeg = (gacha.sinceLeg || 0) + 1;
  let rarity;
  if (gacha.sinceLeg >= PITY.legByArt) rarity = Math.random() < 0.2 ? "artifact" : "legendary";
  else if (gacha.sinceEpic >= PITY.epic) rarity = weightedPick(["epic", "legendary", "artifact"]);
  else if (gacha.sinceRare >= PITY.rare) rarity = weightedPick(["rare", "epic", "legendary", "artifact"]);
  else {
    // luck nudges: small chance to bump one tier
    rarity = weightedPick(["common", "uncommon", "rare", "epic", "legendary", "artifact"]);
    if ((gacha.luck || 0) > 0 && rarity === "common" && Math.random() < (gacha.luck * 0.01)) rarity = "uncommon";
  }
  // reset pity counters when hit
  if (["rare", "epic", "legendary", "artifact"].includes(rarity)) gacha.sinceRare = 0;
  if (["epic", "legendary", "artifact"].includes(rarity)) gacha.sinceEpic = 0;
  if (["legendary", "artifact"].includes(rarity)) gacha.sinceLeg = 0;
  return rarity;
}

/** Pick a specific skill of a rarity, optionally from the live limited event. */
export function pickSkillOfRarity(rarity, includeLimited = false) {
  let pool = SKILLS.filter((s) => s.rarity === rarity);
  if (rarity === "limited" && !includeLimited) pool = [];
  if (!pool.length) pool = SKILLS.filter((s) => s.rarity === "artifact");
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- Loadout → match modifiers ---------------------------------------------
/**
 * Aggregate the equipped skills into numeric match modifiers. The match engine
 * consumes these; total in-match bonus is capped at SKILL_SCORE_CAP at finish.
 * @param equipped { momentum, technique, wildcard } skill ids
 * @param ctx { mode, ranked }
 */
export function buildMods(equipped, ctx = {}) {
  const mods = {
    rhythmPct: 0, rhythmNeed: 5,
    burstBonus: 0, burstCap: 0,
    shieldSaves: 0, shieldReduce: 0,
    overdrive: null,                 // { charge, boostPct, durMs, cdMs }
    multRules: [],                   // [{ pct, condition, stackEvery, maxPct }]
    closerPct: 0, closerMs: 0,
    perPerfect: 0,
    coinPct: 0, dust: 0, discountPct: 0, pityBoost: 0, cdReduce: 0,
    sources: [],                     // skill ids that can affect the match
    economy: [],                     // skill ids that only affect economy
  };
  const ids = [equipped?.momentum, equipped?.technique, equipped?.wildcard].filter(Boolean);
  for (const id of ids) {
    const s = skillById(id);
    if (!s) continue;
    if (ctx.ranked && s.rankedAllowed === false) continue;
    const m = s.mech || {};
    if (m.modes && !m.modes.includes(ctx.mode)) { if (m.kind === "luck") { /* economy still applies */ } else continue; }
    let inMatch = false;
    switch (m.kind) {
      case "rhythm":
        mods.rhythmPct = Math.max(mods.rhythmPct, m.bonusPct || 0);
        mods.rhythmNeed = Math.min(mods.rhythmNeed, m.needSteady || 5);
        if (m.perfectBonus) { mods.burstBonus += m.perfectBonus; mods.burstCap += m.perfectCap || 200; }
        inMatch = true; break;
      case "burst":
        mods.burstBonus += m.bonus || 0;
        mods.burstCap += m.capPerMatch || (m.capCount ? m.capCount * (m.bonus || 0) : 200);
        inMatch = true; break;
      case "risk":
        mods.burstBonus += m.bonus || 0;
        mods.burstCap += m.capPerMatch || 200;
        inMatch = true; break;
      case "shield":
        mods.shieldSaves += m.saves || 0;
        mods.shieldReduce = Math.max(mods.shieldReduce, m.reducePct || 0);
        if (m.guardianMult) mods.multRules.push({ pct: m.guardianMult, condition: "combo" + (m.guardianAt || 50) });
        inMatch = true; break;
      case "overdrive":
        // keep the single strongest overdrive
        if (!mods.overdrive || (m.boostPct || 0) > (mods.overdrive.boostPct || 0)) {
          mods.overdrive = { charge: m.charge || 8, boostPct: m.boostPct || 0.2, durMs: m.durMs || 4000, cdMs: m.cdMs || 8000 };
        }
        inMatch = true; break;
      case "mult":
        mods.multRules.push({ pct: m.pct || 0, condition: m.condition, stackEvery: m.stackEvery, maxPct: m.maxPct });
        inMatch = true; break;
      case "comboramp": case "comboramp2":
        mods.comboFaster = (mods.comboFaster || 0) + (m.faster || 0); inMatch = true; break;
      case "recover":
        mods.recoverPct = Math.max(mods.recoverPct || 0, m.pct || 0); inMatch = true; break;
      case "endbonus":
        if (m.kind2 === "closer") { mods.closerPct = Math.max(mods.closerPct, m.amount || 0); mods.closerMs = Math.max(mods.closerMs, m.durMs || 5000); }
        else if (m.kind2 === "perPerfect") mods.perPerfect += m.amount || 0;
        else if (m.kind2 === "gambit") { mods.closerPct = Math.max(mods.closerPct, m.lateAmount || 0); mods.closerMs = Math.max(mods.closerMs, 5000); }
        else if (m.kind2 === "opener") mods.opener = { amount: m.amount, count: m.count };
        inMatch = true; break;
      case "luck":
        mods.coinPct += m.coinPct || 0;
        mods.dust += m.dust || 0;
        mods.discountPct = Math.max(mods.discountPct, m.discountPct || 0);
        mods.pityBoost += m.pityBoost || 0;
        mods.cdReduce = Math.max(mods.cdReduce, m.cdReduce || 0);
        mods.economy.push(id); break;
      default: break;
    }
    if (inMatch) mods.sources.push(id);
  }
  if (mods.cdReduce && mods.overdrive) mods.overdrive.cdMs *= (1 - mods.cdReduce);
  return mods;
}
