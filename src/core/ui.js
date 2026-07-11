// Shared UI: result modal + confetti, help overlay, element helper.
// Ported verbatim from v13. DOM lookups happen in initUI() (called once from
// main.js) so game modules stay importable in Node for logic tests.
import { shareText } from "./share.js";

export function el(html){const t=document.createElement("template");t.innerHTML=html.trim();return t.content.firstChild;}

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
