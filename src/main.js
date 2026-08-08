// Boot + tab router + lazy init. Ported verbatim from v13; the only change is
// that game init functions live in modules and UI wiring happens via initUI().
import { initUI, refreshReport, refreshPremiumStatus, showPremiumResult, openHistoryOverlay } from "./core/ui.js";
import { getLastSeenDate, setLastSeenDate, localDateKey, getInstallHintShown, setInstallHintShown } from "./core/storage.js";
import { claimSession, maybeReverify } from "./core/entitlement.js";
import { initTally, viewHistoryDate as viewHistoryTally } from "./games/tally.js";
import { initCrossing, viewHistoryDate as viewHistoryCrossing } from "./games/crossing.js";
import { initSonar, viewHistoryDate as viewHistorySonar } from "./games/sonar.js";
import { initCodebreak, viewHistoryDate as viewHistoryCodebreak } from "./games/codebreak.js";
import { initLexi, viewHistoryDate as viewHistoryLexi } from "./games/lexi.js";

initUI();

// D1: post-checkout auto-claim. Stripe's Payment Links redirect back to
// "/?session_id=cs_..."; exchange it for a code and redeem in one step, then
// scrub the parameter so a reload/share of the URL never re-claims.
const bootParams=new URLSearchParams(location.search);
const checkoutSession=bootParams.get("session_id");
if(checkoutSession){
  history.replaceState(null,"",location.pathname);
  claimSession(checkoutSession).then(r=>{
    showPremiumResult(r.ok, r.ok?"Premium unlocked ✓ — save your code above; it's your key to a second device.":r.error);
  });
}

// D1: subscription upkeep — silently re-verify when the entitlement enters
// its final grace week; revoked/cancelled subs drop premium here.
maybeReverify().then(changed=>{ if(changed)refreshPremiumStatus(); });
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible")maybeReverify().then(changed=>{ if(changed)refreshPremiumStatus(); });
});

// B4: capture the browser's native install prompt as early as possible —
// Chrome/Edge on Android/desktop can fire this within moments of load, and a
// listener attached later can miss it. preventDefault() suppresses the
// browser's own mini-infobar so our own banner/link stays the single UI.
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("installhint-add").classList.remove("hide");
});

// tabs + lazy init (heavy generators must not block first paint)
const INIT={tally:initTally,crossing:initCrossing,sonar:initSonar,codebreak:initCodebreak,lexi:initLexi},DONE={};
function ensureInit(t){ if(!DONE[t]&&INIT[t]){ DONE[t]=1; try{INIT[t]();}catch(e){} } }
function switchTab(tab){
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x.dataset.tab===tab));
  ["tally","crossing","sonar","codebreak","lexi"].forEach(t=>{
    document.getElementById("pane-"+t).classList.toggle("hide",t!==tab);
  });
  ensureInit(tab);
}
document.querySelectorAll(".tabs button").forEach(b=>{
  b.onclick=()=>switchTab(b.dataset.tab);
});

// B5: history overlay — switch to the tapped game's tab, then replay its
// stored end-state snapshot for that date read-only. "Y-M-D" (unpadded,
// device-local) is the same key shape localDateKey()/streaks.js use
// throughout, parsed the same way everywhere it's turned back into a Date.
const VIEW_HISTORY={tally:viewHistoryTally,crossing:viewHistoryCrossing,sonar:viewHistorySonar,codebreak:viewHistoryCodebreak,lexi:viewHistoryLexi};
document.getElementById("hdr-history").onclick=()=>{
  openHistoryOverlay((game,dateKey,snapshot)=>{
    switchTab(game);
    const [y,m,d]=dateKey.split("-").map(Number);
    VIEW_HISTORY[game](new Date(y,m-1,d),snapshot);
  });
};

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
  // A new SW can finish installing and (via skipWaiting/clients.claim) take
  // control of this very page without it ever re-navigating — the open tab
  // keeps running the JS modules it already loaded, so nothing here actually
  // picks up the new version until something forces a real reload. Reload
  // once, right when control changes, so a revisit is never stuck on stale
  // code (previously only clearing site data — which also wipes entitlement
  // and game state — reliably fixed this).
  //
  // controllerchange also fires the very first time a page is ever
  // controlled (no SW → this SW) — not just on a genuine version swap. Only
  // arm the reload if this page already had a controller at boot, i.e. it
  // was already being served by a SW and something has now replaced it.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  }

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

// B4: install hint banner — shown once automatically, and re-triggerable from
// a link in the ? help overlay (every game shares the same overlay) for
// anyone who dismissed it and later wants to install. Skipped entirely when
// already running installed (standalone): nothing to prompt for.
//
// The Add button only does something real on browsers that expose
// beforeinstallprompt (Chrome/Edge, Android + desktop) — it stays hidden
// until that event actually fires. iOS Safari has no such API at all, so
// there is nothing to wire a button to; the banner instead falls back to
// the manual Share-sheet instructions.
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const hintEl = document.getElementById("installhint");
const hintAddEl = document.getElementById("installhint-add");
document.getElementById("installhint-x").onclick = () => hintEl.classList.add("hide");

if (isIOS) {
  document.getElementById("installhint-text").textContent = "Tap Share, then \"Add to Home Screen\" 🌅";
} else {
  hintAddEl.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    hintEl.classList.add("hide");
    hintAddEl.classList.add("hide");
  };
}

window.addEventListener("appinstalled", () => {
  hintEl.classList.add("hide");
  document.getElementById("h-install").classList.add("hide");
});

if (!isStandalone) {
  const installLinkEl = document.getElementById("h-install");
  installLinkEl.classList.remove("hide");
  installLinkEl.onclick = () => hintEl.classList.remove("hide");
  if (!getInstallHintShown()) {
    hintEl.classList.remove("hide");
    setInstallHintShown();
  }
}

// boot: paint first, then init only the visible game
requestAnimationFrame(()=>{ setTimeout(()=>{ensureInit("sonar");refreshReport();},0); });
