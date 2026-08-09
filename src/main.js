// Boot + tab router + lazy init. Ported verbatim from v13; the only change is
// that game init functions live in modules and UI wiring happens via initUI().
import { initUI, refreshReport, refreshPremiumStatus, showPremiumResult, openHistoryOverlay, maybeShowOnboarding, renderNotPlayed } from "./core/ui.js";
import { getLastSeenDate, setLastSeenDate, localDateKey, getInstallHintShown, setInstallHintShown, getHistory } from "./core/storage.js";
import { claimSession, maybeReverify } from "./core/entitlement.js";
import { initTally, viewHistoryDate as viewHistoryTally } from "./games/tally.js";
import { initCrossing, viewHistoryDate as viewHistoryCrossing } from "./games/crossing.js";
import { initSonar, viewHistoryDate as viewHistorySonar } from "./games/sonar.js";
import { initCodebreak, viewHistoryDate as viewHistoryCodebreak } from "./games/codebreak.js";
import { initLexi, viewHistoryDate as viewHistoryLexi } from "./games/lexi.js";

initUI();

// B5: one-screen first-run onboarding — shown once, before anything else.
maybeShowOnboarding();

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
const VIEW_HISTORY={tally:viewHistoryTally,crossing:viewHistoryCrossing,sonar:viewHistorySonar,codebreak:viewHistoryCodebreak,lexi:viewHistoryLexi};

// B5: cross-game history browsing. Selecting a date for one game (via the
// History overlay) now puts EVERY tab in "viewing this date" mode, not just
// the one tapped — switching tabs while browsing shows that same date's
// result for whichever game you land on (or "Not played on this date" if it
// has no record), until any Today's button is pressed, which drops back to
// live for every tab. null = normal live browsing, the default.
let historyModeDate=null;
function exitHistoryMode(){ historyModeDate=null; }
// Every game's own "Today's" button already reverts THAT tab correctly
// (openDaily() is what it always called); this only needs to also clear the
// shared flag so OTHER tabs stop re-entering history mode on their next
// visit. Delegated + class-matched rather than one listener per game.
document.addEventListener("click",e=>{ if(e.target.closest(".today-btn"))exitHistoryMode(); });

function ensureInit(t){ if(!DONE[t]&&INIT[t]){ DONE[t]=1; try{INIT[t]();}catch(e){} } }
function switchTab(tab){
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("on",x.dataset.tab===tab));
  ["tally","crossing","sonar","codebreak","lexi"].forEach(t=>{
    document.getElementById("pane-"+t).classList.toggle("hide",t!==tab);
  });
  if(historyModeDate){
    DONE[tab]=1; // this tab's content is about to be fully replaced either way
    const dateKey=localDateKey(historyModeDate);
    const record=getHistory().find(r=>r.game===tab&&r.date===dateKey);
    if(record&&record.snapshot)VIEW_HISTORY[tab](historyModeDate,record.snapshot);
    else renderNotPlayed(document.getElementById("pane-"+tab),dateKey,()=>{exitHistoryMode();INIT[tab]();});
    return;
  }
  if(!DONE[tab]){ ensureInit(tab); return; }
  // Already initialized and back to live browsing: re-run openDaily(), which
  // is always safe here — it restores from the persisted snapshot when one
  // matches today (B2), so this never discards an in-progress live game; it
  // only matters the one time we're resuming a tab that was just showing a
  // historical date.
  INIT[tab]();
}
document.querySelectorAll(".tabs button").forEach(b=>{
  b.onclick=()=>switchTab(b.dataset.tab);
});

// B5: history overlay — set the shared browsing date, then switchTab does
// the rest (including for the very game+date row that was tapped, so the
// lookup logic lives in exactly one place).
document.getElementById("hdr-history").onclick=()=>{
  openHistoryOverlay((game,dateKey)=>{
    const [y,m,d]=dateKey.split("-").map(Number);
    historyModeDate=new Date(y,m-1,d);
    switchTab(game);
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
