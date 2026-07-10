// Boot + tab router + lazy init. Ported verbatim from v13; the only change is
// that game init functions live in modules and UI wiring happens via initUI().
import { initUI } from "./core/ui.js";
import { initTally } from "./games/tally.js";
import { initCrossing } from "./games/crossing.js";
import { initSonar } from "./games/sonar.js";
import { initCodebreak } from "./games/codebreak.js";
import { initLexi } from "./games/lexi.js";

initUI();

// tabs + lazy init (heavy generators must not block first paint)
const INIT={tally:initTally,crossing:initCrossing,sonar:initSonar,codebreak:initCodebreak,lexi:initLexi},DONE={};
function ensureInit(t){ if(!DONE[t]&&INIT[t]){ DONE[t]=1; try{INIT[t]();}catch(e){} } }
document.querySelectorAll(".tabs button").forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x===b));
    ["tally","crossing","sonar","codebreak","lexi"].forEach(t=>{
      document.getElementById("pane-"+t).classList.toggle("hide",t!==b.dataset.tab);
    });
    ensureInit(b.dataset.tab);
  };
});

// boot: paint first, then init only the visible game
requestAnimationFrame(()=>{ setTimeout(()=>ensureInit("sonar"),0); });
