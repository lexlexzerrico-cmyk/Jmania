/* ============================================================
   grade.js — F → S performance grade
   ------------------------------------------------------------
   Grades a run on how hard/fast you clapped, independent of
   mode. Uses peak CPS + best combo + claps-per-second average.
   ============================================================ */

export const GRADES = [
  { key: "S",  min: 92, color: "#ffd05a", label: "LEGENDARY" },
  { key: "A",  min: 78, color: "#3ee08a", label: "GREAT" },
  { key: "B",  min: 62, color: "#22e0d6", label: "SOLID" },
  { key: "C",  min: 44, color: "#7fb0ff", label: "OKAY" },
  { key: "D",  min: 26, color: "#ffa23a", label: "WEAK" },
  { key: "F",  min: 0,  color: "#ff5b6e", label: "TRY AGAIN" },
];

/**
 * @param {object} r  { peakCps, peakCombo, totalClaps, duration }
 * @returns {{key,color,label,pct}}
 */
export function gradeFor(r) {
  const dur = Math.max(1, r.duration || 30);
  const avgCps = r.totalClaps / dur;
  // Component scores (0..100)
  const cpsScore = Math.min(100, (r.peakCps / 12) * 100);      // 12 cps = maxed
  const comboScore = Math.min(100, (r.peakCombo / 20) * 100);   // 20-streak = maxed
  const avgScore = Math.min(100, (avgCps / 6) * 100);           // sustaining 6/s = maxed
  const pct = Math.round(cpsScore * 0.4 + comboScore * 0.3 + avgScore * 0.3);
  const g = GRADES.find((x) => pct >= x.min) || GRADES[GRADES.length - 1];
  return { ...g, pct };
}
