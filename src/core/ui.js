// Shared UI: result modal + confetti, help overlay, element helper.
// Ported verbatim from v13. DOM lookups happen in initUI() (called once from
// main.js) so game modules stay importable in Node for logic tests.
import { shareText, batchCard, gameLine } from "./share.js";
import { getHistory, localDateKey } from "./storage.js";
import { puzzleNumber } from "./rng.js";
import { GAMES, dayScore, batchStreak, recordsFor, isPerfectBatch, perfectStreak } from "./streaks.js";

export function el(html){const t=document.createElement("template");t.innerHTML=html.trim();return t.content.firstChild;}

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
      <div class="rp-head"><span class="rp-title">BATCH REPORT · #${puzzleNumber()}</span><span class="rp-score">${dayScore(history,today)}/100${streak>=1?` 🔥${streak}`:""}</span></div>
      <div class="rp-lines">${GAMES.map(g=>`<div>${gameLine(g,recs.find(r=>r.game===g)||null)}</div>`).join("")}</div>
      ${perfect?`<div class="rp-perfect">✨ Perfect batch — streak ${perfectStreak(history,today)}</div>`:""}
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
  if(ctx.win){confetti();try{navigator.vibrate&&navigator.vibrate([35,60,35,60,90]);}catch(e){}}
  showSlimBar(ctx);
  refreshReport(); // B3: a finish may change today's score/streak
}

let helpov;
export function showHelp(html){document.getElementById("h-body").innerHTML=html;helpov.classList.add("show");}

export function initUI(){
  overlay=document.getElementById("overlay");modal=document.getElementById("modal");
  helpov=document.getElementById("helpov");
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
}
