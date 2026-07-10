// SONAR — ported verbatim from v13 (reference/daybatch-v13.html).
// gen()/tryGen() are exported for logic tests; initSonar() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp } from "../core/ui.js";

const SN=7,SHIPS=[3,2,2];
let pane;
let puz,revealed,status,isDaily;

export function tryGen(sd){
  const rng=mulberry32(sd);
  for(let attempt=0;attempt<200;attempt++){
    const occ=new Set(),blocked=new Set();let ok=true;
    for(const len of SHIPS){
      let placed=false;
      for(let t=0;t<80&&!placed;t++){
        const horiz=rng()<.5;
        const r=Math.floor(rng()*(horiz?SN:SN-len+1));
        const c=Math.floor(rng()*(horiz?SN-len+1:SN));
        const cells=[];
        for(let k=0;k<len;k++)cells.push((r+(horiz?0:k))*SN+(c+(horiz?k:0)));
        if(cells.some(i=>blocked.has(i)))continue;
        cells.forEach(i=>{
          occ.add(i);
          const rr=Math.floor(i/SN),cc=i%SN;
          for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
            const ar=rr+dr,ac=cc+dc;
            if(ar>=0&&ar<SN&&ac>=0&&ac<SN)blocked.add(ar*SN+ac);
          }
        });
        placed=true;
      }
      if(!placed){ok=false;break;}
    }
    if(!ok)continue;
    const rowCounts=[],colCounts=[];
    for(let r=0;r<SN;r++)rowCounts.push([...occ].filter(i=>Math.floor(i/SN)===r).length);
    for(let c=0;c<SN;c++)colCounts.push([...occ].filter(i=>i%SN===c).length);
    return{occ,rowCounts,colCounts,total:7};
  }
  return null;
}
export function gen(sd){
  for(let k=0;k<1000;k++){const p=tryGen((sd+k*104729)>>>0);if(p)return p;}
  const occ=new Set([0,1,2,3*SN+5,4*SN+5,6*SN+0,6*SN+1]);
  const rowCounts=[],colCounts=[];
  for(let r=0;r<SN;r++)rowCounts.push([...occ].filter(i=>Math.floor(i/SN)===r).length);
  for(let c=0;c<SN;c++)colCounts.push([...occ].filter(i=>i%SN===c).length);
  return{occ,rowCounts,colCounts,total:7};
}
const SN_HELP=`Three vessels hide in the deep — the fleet shown above the grid (never touching, not even diagonally).<br><br>Every tap is a <b>ping</b>: <b>◉ orange</b> = part of a vessel, <b>· blue</b> = empty water.<br><br><b>Edge numbers</b> count how many vessel cells sit in that row or column — they turn <b>green ✓</b> once you've found them all. Use them to deduce, not guess.<br><br>Find every vessel cell in the fewest pings.`;
function load(sd,daily){isDaily=daily;puz=gen(sd);revealed=new Map();status="play";render();}
function hits(){let n=0;revealed.forEach(v=>{if(v==="hit")n++;});return n;}
function tap(i){
  if(status!=="play"||revealed.has(i))return;
  revealed.set(i,puz.occ.has(i)?"hit":"miss");
  if(hits()===puz.total){status="win";render();finish();return;}
  render();
}
function finish(){
  const p=revealed.size;
  const label=p===puz.total?"Perfect! 🏆":p<=puz.total+2?"Sharp shooting!":p<=puz.total+5?"Solid sweep":"All found";
  const share="DAYBATCH · SONAR 📡 "+label+"\n"+p+" pings";
  showResult({win:true,title:label,line:p+" pings",
    share,onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")});
}
function render(){
  const rowHits=Array(SN).fill(0),colHits=Array(SN).fill(0);
  revealed.forEach((v,i)=>{if(v==="hit"){rowHits[Math.floor(i/SN)]++;colHits[i%SN]++;}});
  let grid=`<div class="sn-row"><div></div>${puz.colCounts.map((n,c)=>{
    const done=colHits[c]>=n;
    return`<div class="sn-edge${done?" done":""}">${done?"✓":n}</div>`;}).join("")}</div>`;
  for(let r=0;r<SN;r++){
    const rDone=rowHits[r]>=puz.rowCounts[r];
    grid+=`<div class="sn-row"><div class="sn-edge${rDone?" done":""}">${rDone?"✓":puz.rowCounts[r]}</div>`;
    for(let c=0;c<SN;c++){
      const i=r*SN+c,st=revealed.get(i);
      const showShip=status!=="play"&&puz.occ.has(i)&&!st;
      grid+=`<button data-i="${i}" class="${st==="hit"?"hit":st==="miss"?"miss":showShip?"ship":""}">${st==="hit"?"◉":st==="miss"?"·":""}</button>`;
    }
    grid+="</div>";
  }
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="sn-help">?</button>
      <div class="stat big"><div class="lb">PINGS</div><div class="vl" style="color:var(--marker)">${revealed.size}</div></div>
      <div class="stat big"><div class="lb">FOUND</div><div class="vl" style="color:var(--win)">${hits()}/${puz.total}</div></div>
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${isDaily?"DAILY":"PRAC"}</div></div>
    </div>
    <div class="board" style="padding:6px">
      <div class="fleet">
        <span class="fl">FIND:</span>
        <span class="ship"><i></i><i></i><i></i></span>
        <span class="ship"><i></i><i></i></span>
        <span class="ship"><i></i><i></i></span>
      </div>
      ${grid}
    </div>
    <div class="btnrow">
      <button class="btn" id="sn-new">New puzzle</button>
      <button class="btn pri" id="sn-today">Today's</button>
    </div>
    <div class="slimhost"></div>`;
  pane.querySelectorAll(".sn-row button").forEach(b=>b.onclick=()=>tap(+b.dataset.i));
  pane.querySelector("#sn-help").onclick=()=>showHelp(SN_HELP);
  pane.querySelector("#sn-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#sn-today").onclick=()=>load(dailySeed("sonar"),true);
}
export function initSonar(){
  pane=document.getElementById("pane-sonar");
  load(dailySeed("sonar"),true);
}
