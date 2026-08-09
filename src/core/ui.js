// Shared UI: result modal + confetti, help overlay, element helper.
// Ported verbatim from v13. DOM lookups happen in initUI() (called once from
// main.js) so game modules stay importable in Node for logic tests.
import { shareText, batchCard, gameLine, puzzleLabel, isPreseason, PRESEASON_NOTE } from "./share.js";
import { getHistory, localDateKey, getEntitlement, isPremium, getHapticsEnabled, setHapticsEnabled, getColorblindMode, setColorblindMode, getBestTime, getCrossingEndlessBest, getOnboardingShown, setOnboardingShown } from "./storage.js";
import { formatMs } from "./timer.js";
import { GAMES, dayScore, batchStreak, recordsFor, isPerfectBatch, perfectStreak } from "./streaks.js";
import { redeemCode, PAYMENT_LINKS, PORTAL_URL } from "./entitlement.js";

export function el(html){const t=document.createElement("template");t.innerHTML=html.trim();return t.content.firstChild;}

// B5: shared placeholder for a game with no record on the date currently
// being browsed (main.js's cross-game history mode — selecting a date for
// one game now shows that same date on every tab, not just the one you
// tapped). Scoped via pane.querySelector, not a page-wide id, since more
// than one hidden pane can render this at once (one per game with no data
// that day) and ids must stay unique across the whole document.
export function renderNotPlayed(pane,dateLabel,onToday){
  pane.innerHTML=`
    <div class="stats">
      <div class="stat big"><div class="lb">DATE</div><div class="vl">${dateLabel}</div></div>
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">HISTORY</div></div>
    </div>
    <div class="board" style="padding:40px 20px;text-align:center;color:var(--faded);font-size:14px">Not played on this date.</div>
    <div class="btnrow"><button class="btn pri today-btn">Today's</button></div>`;
  pane.querySelector(".today-btn").onclick=onToday;
}

// Double-tap/pinch zoom can still trigger on iOS Safari even where
// touch-action:none is set (a known WebKit quirk on custom drag-gesture
// elements — it ignores both the viewport meta's user-scalable=no and, for
// this specific gesture, touch-action:none itself) — once zoomed, every
// later tap both pans the page AND still lands as a game move.
//
// Scope this to the specific touch-action:none drag surface (Tally's
// #ty-board, Lexi's #lx-wheelwrap), NOT a whole pane or any element whose
// children rely on synthesized click events (onclick=...): calling
// preventDefault() on a touchend also suppresses the click the browser
// would otherwise synthesize from that same touch, so scoping this too
// broadly silently eats button taps that land within 300ms of a prior tap
// (found via a real regression: Lexi's ✓ Check button stopped responding
// after a quick letter-tap). The other games' tap targets already declare
// touch-action:manipulation, which is the standard, narrower fix for
// double-tap-zoom and doesn't carry this risk — they don't need this.

export function suppressZoomGestures(elem){
  let lastTouchEndTs=0;
  elem.addEventListener("touchend",e=>{
    const now=Date.now();
    if(now-lastTouchEndTs<=300)e.preventDefault();
    lastTouchEndTs=now;
  },{passive:false});
  elem.addEventListener("gesturestart",e=>e.preventDefault());
}

// B3 Batch Report card (below the active pane) + header 🔥 streak chip.
// Renders from history alone, so it survives reloads and ignores practice.
export function refreshReport(){
  const host=document.getElementById("report-host");
  const flame=document.getElementById("hdr-streak");
  const history=getHistory();
  const today=localDateKey();
  const streak=batchStreak(history,today);
  if(streak>=1){flame.textContent="🔥"+streak;flame.classList.remove("hide");}
  else flame.classList.add("hide");
  const recs=recordsFor(history,today);
  if(!recs.length){host.innerHTML="";return;}
  const perfect=isPerfectBatch(history,today);
  host.innerHTML=`
    <div id="report">
      <div class="rp-head"><span class="rp-title">BATCH REPORT · ${puzzleLabel()}</span><span class="rp-score">${dayScore(history,today)}/100${streak>=1?` 🔥${streak}`:""}</span></div>
      <div class="rp-lines">${GAMES.map(g=>`<div>${gameLine(g,recs.find(r=>r.game===g)||null)}</div>`).join("")}</div>
      ${perfect?`<div class="rp-perfect">✨ Perfect batch — streak ${perfectStreak(history,today)}</div>`:""}
      ${isPreseason()?`<div class="rp-note">${PRESEASON_NOTE}</div>`:""}
      <button class="btn pri" id="rp-share">Share batch</button>
    </div>`;
  document.getElementById("rp-share").onclick=async()=>{
    const r=await shareText(batchCard(history,today));
    if(r==="failed")return;
    const b=document.getElementById("rp-share");
    b.textContent=r==="shared"?"Shared ✓":"Copied ✓";
    setTimeout(()=>{const bb=document.getElementById("rp-share");if(bb)bb.textContent="Share batch";},1600);
  };
}

let overlay,modal,modalCtx=null;

function confetti(){
  const colors=["#FF6B2C","#1F9D55","#E6A817","#2E86AB","#9B5DE5","#16324F"];
  for(let i=0;i<90;i++){
    const p=document.createElement("div");p.className="cf";
    const size=6+Math.random()*7,round=Math.random()<.3;
    p.style.cssText=`left:${Math.random()*100}%;width:${size}px;height:${round?size:size*.55}px;background:${colors[i%6]};border-radius:${round?"50%":"2px"};--d:${2.2+Math.random()*1.8}s;--dl:${Math.random()*.7}s;--x:${(Math.random()-.5)*30}vw;--r:${(Math.random()-.5)*900}deg;`;
    document.body.appendChild(p);
    setTimeout(()=>p.remove(),4600);
  }
}

function fillModal(ctx){
  modalCtx=ctx;
  modal.className=ctx.win?"win":"fail";
  document.getElementById("m-title").innerHTML=ctx.win
    ?`<span class="wig">🎉</span> ${ctx.title} <span class="wig">🎉</span>`:ctx.title;
  document.getElementById("m-line").textContent=ctx.line;
  document.getElementById("m-share").textContent=ctx.share;
  document.getElementById("m-copy").textContent="Share";
}

// Slim result bar under the game. Its Result button re-fills the modal from
// this ctx, so a restored game's bar reopens the right result even if another
// game's modal was shown meanwhile (B2).
export function showSlimBar(ctx){
  if(!ctx.slimHost)return;
  ctx.slimHost.innerHTML="";
  const bar=el(`<div class="slimbar ${ctx.win?"win":"fail"}"><span>${ctx.win?"🎉":"💥"} ${ctx.title}</span><button>Result</button></div>`);
  bar.querySelector("button").onclick=()=>{fillModal(ctx);overlay.classList.add("show");};
  ctx.slimHost.appendChild(bar);
}

export function showResult(ctx){ // {win,title,line,share,onAgain,slimHost}
  fillModal(ctx);
  overlay.classList.add("show");
  if(ctx.win){confetti();if(getHapticsEnabled()){try{navigator.vibrate&&navigator.vibrate([35,60,35,60,90]);}catch(e){}}}
  showSlimBar(ctx);
  refreshReport(); // B3: a finish may change today's score/streak
}

let helpov;
export function showHelp(html){document.getElementById("h-body").innerHTML=html;refreshPremiumStatus();helpov.classList.add("show");}

// D1: reflects current entitlement in the help overlay's premium row —
// called on boot, whenever the help overlay opens, and after a redemption.
export function refreshPremiumStatus(){
  const statusEl=document.getElementById("h-premium-status");
  const openBtn=document.getElementById("h-premium-open");
  const badge=document.getElementById("hdr-premium");
  const historyBtn=document.getElementById("hdr-history");
  const premium=isPremium();
  if(badge)badge.classList.toggle("hide",!premium);
  if(historyBtn)historyBtn.classList.toggle("hide",!premium); // B5: history is premium-gated, same as Timed/Archive
  // The premium overlay flips between its two jobs: selling (buy buttons +
  // code entry) for free users, and showing the owner their code (their key
  // to a second device / new phone — never shown anywhere else) once premium.
  ["pm-buy","pm-or","pm-code","pm-redeem"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle("hide",premium);
  });
  const mine=document.getElementById("pm-mycode");
  if(mine){
    mine.classList.toggle("hide",!premium);
    if(premium)document.getElementById("pm-mycode-val").textContent=getEntitlement().code;
  }
  // Subscribers manage/cancel via Stripe's Customer Portal (checkout-email
  // identity, no accounts here). Lifetime has nothing to manage.
  const portal=document.getElementById("pm-portal");
  if(portal){
    const sub=premium&&getEntitlement().tier!=="lifetime";
    portal.classList.toggle("hide",!sub);
    if(sub)portal.href=PORTAL_URL;
  }
  if(!statusEl||!openBtn)return;
  if(premium){
    const tier=getEntitlement().tier;
    const label=tier==="lifetime"?"Premium · Lifetime":tier==="yearly"?"Premium · Annual":"Premium · Monthly";
    statusEl.textContent=label;
    openBtn.textContent="Manage";
  } else {
    statusEl.textContent="Free plan";
    openBtn.textContent="Unlock premium";
  }
}

// D1: archive date-picker (premium) — shared by every game. onPick receives
// a plain Date for the chosen calendar day; callers pass it straight into
// dailySeed(game, date) to regenerate that day's puzzle.
function pad2(n){return String(n).padStart(2,"0");}
function toDateInputValue(d){return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}

let archiveov;
export function openArchive(onPick){
  const input=document.getElementById("ar-date");
  const yesterday=new Date();
  yesterday.setDate(yesterday.getDate()-1);
  const maxVal=toDateInputValue(yesterday);
  input.max=maxVal;
  input.value=maxVal;
  archiveov.classList.add("show");
  document.getElementById("ar-go").onclick=()=>{
    const val=input.value;
    if(!val)return;
    const[y,m,d]=val.split("-").map(Number);
    archiveov.classList.remove("show");
    onPick(new Date(y,m-1,d));
  };
}

// B5: personal-best records — part of the premium-gated stats screen
// (PLAN.md B5: "stats screen (history, records)... premium-gated"), so this
// renders inside the History overlay, not the free Settings overlay.
const GAME_LABEL={tally:"🧮 Tally",crossing:"🧭 Crossing",sonar:"📡 Sonar",codebreak:"🔐 Codebreak",lexi:"🔤 Lexi"};
function refreshRecords(){
  const host=document.getElementById("hi-records");
  if(!host)return;
  const lines=[];
  for(const g of GAMES){
    const t=getBestTime(g);
    if(t!==null)lines.push(`<div>${GAME_LABEL[g]} ⏱ ${formatMs(t)}</div>`);
  }
  const endless=getCrossingEndlessBest();
  if(endless>0)lines.push(`<div>🧭 Crossing ♾️ ${endless} board${endless===1?"":"s"}</div>`);
  host.innerHTML=lines.length?lines.join(""):`<div class="st-empty">No Timed or Endless records yet.</div>`;
}

// B5: history overlay (premium) — records + ONE date at a time (Darren, 8
// Aug 2026: a scrolling list of every date would become huge over months —
// prev/next steps by a single calendar day; tapping the date label opens a
// native date picker for jumping straight to an arbitrary date, same
// pattern as openArchive's <input type="date"> above). Tap a game's line to
// replay its exact end-state board read-only. A record with no snapshot
// (completed before B5 shipped, or an unknown future schema) renders
// disabled rather than throwing on a game-view attempt; a date with no
// record for a game at all renders "not played" the same way.
let historyov,historyDate,historyOnOpen;
export function openHistoryOverlay(onOpenGame){
  refreshRecords();
  historyOnOpen=onOpenGame;
  const history=getHistory();
  const dates=[...new Set(history.map(r=>r.date))].sort();
  historyDate=dates.length?parseKey(dates[dates.length-1]):new Date();
  renderHistoryDay();
  historyov.classList.add("show");
}
function parseKey(key){const[y,m,d]=key.split("-").map(Number);return new Date(y,m-1,d);}
function renderHistoryDay(){
  const host=document.getElementById("hi-body");
  const history=getHistory();
  const dateKey=localDateKey(historyDate);
  const today=localDateKey();
  const dateInput=document.getElementById("hi-date-input");
  dateInput.max=toDateInputValue(new Date());
  dateInput.value=toDateInputValue(historyDate);
  document.getElementById("hi-date-score").textContent=dayScore(history,dateKey)+"/100";
  document.getElementById("hi-next").disabled=dateKey===today;
  const recs=recordsFor(history,dateKey);
  const rows=GAMES.map(g=>{
    const r=recs.find(x=>x.game===g);
    const has=r&&r.snapshot;
    return `<button class="hi-game${has?"":" disabled"}" data-game="${g}"${has?"":" disabled"}>${gameLine(g,r||null)}</button>`;
  }).join("");
  host.innerHTML=`<div class="hi-day-games">${rows}</div>`;
  host.querySelectorAll(".hi-game:not(.disabled)").forEach(btn=>{
    btn.onclick=()=>{
      const game=btn.dataset.game;
      const record=history.find(r=>r.game===game&&r.date===dateKey);
      historyov.classList.remove("show");
      historyOnOpen(game,dateKey,record.snapshot);
    };
  });
}

// B5: settings — haptics + colour-blind toggles only (free; records moved
// to the premium History overlay above, per PLAN.md's "stats screen
// (history, records)... premium-gated"). Colour-blind mode applies as a
// body class so any game can style off it (Codebreak's verdict tiles are
// the only current consumer — see codebreak.js).
export function applyColorblindMode(){
  document.body.classList.toggle("cb-mode",getColorblindMode());
}
let settingsov;
export function openSettingsOverlay(){
  document.getElementById("st-haptics").checked=getHapticsEnabled();
  document.getElementById("st-colorblind").checked=getColorblindMode();
  settingsov.classList.add("show");
}

// B5: one-time first-run onboarding — an in-flow banner (same shown-once
// pattern as the B4 install hint), not a blocking modal: everything below it
// stays reachable immediately, it just adds one dismissible intro card above
// the tabs on a genuinely first visit.
let onboardingEl;
export function maybeShowOnboarding(){
  if(getOnboardingShown())return;
  onboardingEl.classList.remove("hide");
}

let premiumov;

// D1: post-checkout feedback — opens the premium overlay with a result
// message (main.js calls this after the ?session_id= auto-claim resolves).
export function showPremiumResult(ok,message){
  const msg=document.getElementById("pm-msg");
  msg.textContent=message;msg.className=ok?"ok":"err";
  refreshPremiumStatus();
  premiumov.classList.add("show");
}

export function initUI(){
  overlay=document.getElementById("overlay");modal=document.getElementById("modal");
  helpov=document.getElementById("helpov");
  premiumov=document.getElementById("premiumov");
  archiveov=document.getElementById("archiveov");
  document.getElementById("ar-close").onclick=()=>archiveov.classList.remove("show");
  archiveov.onclick=(e)=>{if(e.target===archiveov)archiveov.classList.remove("show");};
  historyov=document.getElementById("historyov");
  document.getElementById("hi-close").onclick=()=>historyov.classList.remove("show");
  historyov.onclick=(e)=>{if(e.target===historyov)historyov.classList.remove("show");};
  document.getElementById("hi-prev").onclick=()=>{
    historyDate=new Date(historyDate.getFullYear(),historyDate.getMonth(),historyDate.getDate()-1);
    renderHistoryDay();
  };
  document.getElementById("hi-next").onclick=()=>{
    if(localDateKey(historyDate)===localDateKey())return; // already at today
    historyDate=new Date(historyDate.getFullYear(),historyDate.getMonth(),historyDate.getDate()+1);
    renderHistoryDay();
  };
  const hiDateInput=document.getElementById("hi-date-input");
  hiDateInput.onchange=(e)=>{
    if(!e.target.value)return;
    const[y,m,d]=e.target.value.split("-").map(Number);
    historyDate=new Date(y,m-1,d);
    renderHistoryDay();
  };
  settingsov=document.getElementById("settingsov");
  document.getElementById("h-settings").onclick=()=>{helpov.classList.remove("show");openSettingsOverlay();};
  document.getElementById("st-close").onclick=()=>settingsov.classList.remove("show");
  settingsov.onclick=(e)=>{if(e.target===settingsov)settingsov.classList.remove("show");};
  document.getElementById("st-haptics").onchange=(e)=>setHapticsEnabled(e.target.checked);
  document.getElementById("st-colorblind").onchange=(e)=>{setColorblindMode(e.target.checked);applyColorblindMode();};
  onboardingEl=document.getElementById("onboarding");
  document.getElementById("ob-start").onclick=()=>{setOnboardingShown();onboardingEl.classList.add("hide");};
  applyColorblindMode();
  document.getElementById("m-close").onclick=()=>overlay.classList.remove("show");
  overlay.onclick=(e)=>{if(e.target===overlay)overlay.classList.remove("show");};
  document.getElementById("m-copy").onclick=async()=>{
    // B3: Web Share (with url field) on supporting devices, clipboard otherwise.
    const r=await shareText(modalCtx.share);
    if(r==="failed")return;
    document.getElementById("m-copy").textContent=r==="shared"?"Shared ✓":"Copied ✓";
    setTimeout(()=>{document.getElementById("m-copy").textContent="Share";},1600);
  };
  document.getElementById("m-again").onclick=()=>{overlay.classList.remove("show");modalCtx&&modalCtx.onAgain();};
  document.getElementById("h-close").onclick=()=>helpov.classList.remove("show");
  helpov.onclick=(e)=>{if(e.target===helpov)helpov.classList.remove("show");};

  document.getElementById("h-premium-open").onclick=()=>{
    document.getElementById("pm-msg").textContent="";
    document.getElementById("pm-msg").className="";
    premiumov.classList.add("show");
  };
  // Purchase buttons: same-tab navigation to Stripe's hosted checkout; its
  // Payment Link redirects back here with ?session_id= for the auto-claim.
  document.querySelectorAll("#pm-buy button").forEach(b=>{
    b.onclick=()=>{location.href=PAYMENT_LINKS[b.dataset.tier];};
  });
  document.getElementById("pm-close").onclick=()=>premiumov.classList.remove("show");
  document.getElementById("pm-mycode-copy").onclick=async()=>{
    const b=document.getElementById("pm-mycode-copy");
    try{
      await navigator.clipboard.writeText(document.getElementById("pm-mycode-val").textContent);
      b.textContent="Copied ✓";
    }catch(e){b.textContent="Select & copy above";}
    setTimeout(()=>{b.textContent="Copy code";},1600);
  };
  premiumov.onclick=(e)=>{if(e.target===premiumov)premiumov.classList.remove("show");};
  document.getElementById("pm-redeem").onclick=async()=>{
    const input=document.getElementById("pm-code");
    const msg=document.getElementById("pm-msg");
    const btn=document.getElementById("pm-redeem");
    btn.disabled=true;msg.textContent="Checking…";msg.className="";
    const r=await redeemCode(input.value);
    btn.disabled=false;
    if(r.ok){
      msg.textContent="Unlocked ✓";msg.className="ok";
      input.value="";
      refreshPremiumStatus();
      setTimeout(()=>premiumov.classList.remove("show"),1200);
    } else {
      msg.textContent=r.error;msg.className="err";
    }
  };
  refreshPremiumStatus();
}
