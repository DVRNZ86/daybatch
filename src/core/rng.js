// Seeded RNG + daily seed derivation. Ported verbatim from v13 —
// same date must produce identical puzzles (reference/daybatch-v13.html).
export function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function dailySeed(g){const d=new Date();return hashString(g+"-"+d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate());}

// EPOCH (B3 contract, PERMANENT — never change): 10 September 2026, device-
// local — the launch date; that day's batch is puzzle #1. Days before it are
// the countdown (#−N, see share.js puzzleLabel). Day difference is computed
// via UTC stamps of the local calendar date so DST can never skew the count.
export const EPOCH=[2026,8,10]; // [year, monthIndex, day]
export function puzzleNumber(d=new Date()){
  return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(...EPOCH))/86400000)+1;
}
