// Seeded RNG + daily seed derivation. Ported verbatim from v13 —
// same date must produce identical puzzles (reference/daybatch-v13.html).
export function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
export function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function dailySeed(g){const d=new Date();return hashString(g+"-"+d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate());}
