// Boot + tab router + lazy init. Ported verbatim from v13; the only change is
// that game init functions live in modules and UI wiring happens via initUI().
import { initUI, refreshReport } from "./core/ui.js";
import { getLastSeenDate, setLastSeenDate, localDateKey, getInstallHintShown, setInstallHintShown } from "./core/storage.js";
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

// B2 rollover watcher: when the app comes back into view on a new device-local
// day, offer fresh dailies via the banner — never silently reset a live game.
// (A full reload after midnight needs no prompt: stale snapshots are ignored
// by each game's date check and today's puzzles load directly.)
const rolloverEl=document.getElementById("rollover");
setLastSeenDate(localDateKey());
function checkRollover(){
  const today=localDateKey();
  const seen=getLastSeenDate();
  if(seen&&seen!==today)rolloverEl.classList.remove("hide");
}
document.getElementById("rollover-go").onclick=()=>{
  setLastSeenDate(localDateKey());
  rolloverEl.classList.add("hide");
  Object.keys(DONE).forEach(t=>{ if(DONE[t])INIT[t](); }); // re-init to today's dailies
  refreshReport(); // B3: new day → fresh report + streak chip
};
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible")checkRollover(); });
window.addEventListener("focus",checkRollover);

// B4: cache-first service worker — register after load so it never competes
// with first paint. Registration failure (old browser, file: context) is fine:
// the app works identically without it.
// A plain re-registration on reload does NOT force a byte-compare against the
// live script (that only happens ~once/24h by default) — so a new deploy
// could sit unnoticed for a day. We force the check ourselves on every launch
// and again on the same visibilitychange/focus triggers as the rollover
// watcher, matching the "reaches clients within one revisit" acceptance bar.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Guard against overlapping checks (e.g. a focus event firing right
      // after the on-load check): concurrent reg.update() calls can each
      // kick off their own install/activate cycle and race on cache cleanup.
      let checking = false;
      const checkForUpdate = () => {
        if (checking) return;
        checking = true;
        reg.update().catch(() => {}).then(() => { checking = false; });
      };
      checkForUpdate();
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
      window.addEventListener("focus", checkForUpdate);
    }).catch(() => {});
  });
}

// B4: one-time install hint. Skipped when already running installed
// (standalone) or already shown once; the flag persists on the storage root.
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (!isStandalone && !getInstallHintShown()) {
  const hintEl = document.getElementById("installhint");
  hintEl.classList.remove("hide");
  setInstallHintShown();
  document.getElementById("installhint-x").onclick = () => hintEl.classList.add("hide");
}

// boot: paint first, then init only the visible game
requestAnimationFrame(()=>{ setTimeout(()=>{ensureInit("sonar");refreshReport();},0); });
