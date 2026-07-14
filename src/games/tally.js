// TALLY — ported verbatim from v13 (reference/daybatch-v13.html).
// Pure helpers (neighbors/applyOp/solveGrid/gen) are exported for logic
// tests; initTally() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp, showSlimBar } from "../core/ui.js";
import { getGameState, setGameState, addHistory, localDateKey, isPremium, getBestTime, setBestTime } from "../core/storage.js";
import { createStopwatch, formatMs } from "../core/timer.js";
import { SITE_URL } from "../core/share.js";

const SIZE=5,N=25,START=0,END=24;
let pane;
let puz,path,attempts,status,isDaily,dragging=false,seedCur,dateCur;
let elGrid,elTotal,elTries,boardEl;
let timed=false; // D1: Timed mode (premium)
const stopwatch=createStopwatch();

export function neighbors(i){
  const r=Math.floor(i/SIZE),c=i%SIZE,out=[];
  if(r>0)out.push(i-SIZE); if(r<SIZE-1)out.push(i+SIZE);
  if(c>0)out.push(i-1); if(c<SIZE-1)out.push(i+1);
  return out;
}
export function applyOp(t,op,n){return op==="+"?t+n:op==="−"?t-n:t*n;}
function genCells(rng){
  const cells=[];
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    if((r+c)%2===0)cells.push({type:"num",value:1+Math.floor(rng()*9)});
    else{const roll=rng();cells.push({type:"op",value:roll<.45?"+":roll<.8?"−":"×"});}
  }
  return cells;
}
export function solveGrid(cells){
  const results=new Map(),visited=new Array(N).fill(false);
  let iter=0;const MAXI=90000,MAXL=13;
  function dfs(pos,len,total,pending){
    if(iter++>MAXI)return;
    if(pos===END){
      const e=results.get(total)||{count:0,minLen:99};
      e.count++;e.minLen=Math.min(e.minLen,len);results.set(total,e);return;
    }
    if(len>=MAXL)return;
    for(const nb of neighbors(pos)){
      if(visited[nb])continue;
      const cell=cells[nb];visited[nb]=true;
      if(cell.type==="op")dfs(nb,len+1,total,cell.value);
      else dfs(nb,len+1,applyOp(total,pending,cell.value),null);
      visited[nb]=false;
    }
  }
  visited[START]=true;
  dfs(START,1,cells[START].value,null);
  return results;
}
export function gen(seed){
  for(let a=0;a<14;a++){
    const rng=mulberry32((seed+a*7919)>>>0);
    const cells=genCells(rng);
    const sols=solveGrid(cells);
    let cand=[...sols.entries()].filter(([t,e])=>e.count>=3&&e.minLen>=7&&e.minLen<=11&&t>0&&t<=99);
    if(!cand.length)cand=[...sols.entries()].filter(([t,e])=>e.count>=2&&e.minLen>=5&&t>0&&t<=150);
    if(!cand.length)continue;
    cand.sort((x,y)=>Math.abs(x[1].minLen-9)-Math.abs(y[1].minLen-9));
    const pool=cand.slice(0,Math.min(6,cand.length));
    const pick=pool[Math.floor(rng()*pool.length)];
    return{cells:cells,target:pick[0],par:pick[1].minLen};
  }
  return null;
}
function evalPath(){
  if(!path.length)return{total:null,pending:false};
  let total=puz.cells[path[0]].value,pending=false;
  for(let i=1;i<path.length;i+=2){
    if(i+1<path.length)total=applyOp(total,puz.cells[path[i]].value,puz.cells[path[i+1]].value);
    else pending=true;
  }
  return{total,pending};
}
const TY_HELP=`<b>Drag a path</b> from START to END through numbers and operators. Your total runs left to right as you draw — land on END with <b>exactly the target</b>.<br><br><b>BEST</b> is the shortest possible winning path — match it for a perfect ⛳.<br><br>Retrace your line to undo. You can also tap an adjacent cell to extend. Unlimited tries, but they're counted.`;
function load(seed,daily){
  isDaily=daily;timed=false;seedCur=seed;dateCur=localDateKey();
  puz=gen(seed);
  if(!puz){puz=gen(Math.floor(Math.random()*1e9));}
  path=[START];attempts=0;status="play";buildDOM();
}
// D1: Timed mode (premium) — ephemeral like practice, never touches
// history/streaks (finish() only records when isDaily, which stays false).
function startTimed(){
  isDaily=false;timed=true;seedCur=Math.floor(Math.random()*1e9);dateCur=localDateKey();
  puz=gen(seedCur);
  if(!puz)puz=gen(Math.floor(Math.random()*1e9));
  path=[START];attempts=0;status="play";buildDOM();
  stopwatch.start(ms=>{const el=document.getElementById("ty-timer");if(el)el.textContent=formatMs(ms);});
}
// B2 persistence: daily games snapshot on every mutation; practice is ephemeral.
function persist(){
  if(!isDaily)return;
  setGameState("tally",{date:dateCur,seed:seedCur,path,attempts,status});
}
// Tier per PLAN.md B2 contract: par on 1st try→1, par→2, over par→3.
export function tierFor(moves,par,att){return moves<=par&&att===1?1:moves<=par?2:3;}
function openDaily(){
  const sd=dailySeed("tally");
  const s=getGameState("tally");
  if(s&&s.date===localDateKey()&&s.seed===sd){
    puz=gen(s.seed);
    if(!puz){load(sd,true);return;} // seed failed to generate: snapshot can't be trusted
    isDaily=true;timed=false;seedCur=s.seed;dateCur=s.date;
    path=s.path;attempts=s.attempts;status=s.status;
    buildDOM();
    elTries.textContent=attempts;
    if(status!=="play")showSlimBar(result());
    return;
  }
  load(sd,true);
}
function buildDOM(){
  let cells="";
  for(let i=0;i<N;i++){
    const c=puz.cells[i];
    let tag="";
    if(i===START)tag='<span class="tag">START</span>';
    if(i===END)tag='<span class="tag">END</span>';
    cells+=`<div class="tc ${c.type}" data-i="${i}">${c.value}${tag}</div>`;
  }
  const timerStat=timed?`<div class="stat"><div class="lb">TIME</div><div class="vl" id="ty-timer" style="color:var(--marker)">${formatMs(stopwatch.elapsed())}</div></div>`:"";
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="ty-help">?</button>
      <div class="stat big"><div class="lb">TARGET</div><div class="vl" style="color:var(--marker)">${puz.target}</div></div>
      <div class="stat big"><div class="lb">RUNNING</div><div class="vl" id="ty-total">—</div></div>
      <div class="stat"><div class="lb">BEST</div><div class="vl">${puz.par}</div></div>
      <div class="stat"><div class="lb">TRIES</div><div class="vl" id="ty-tries">0</div></div>
      ${timerStat}
    </div>
    <div class="board" id="ty-board">
      <div id="ty-grid">${cells}</div>
      <svg id="ty-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline id="ty-line" points="" fill="none" stroke="var(--marker)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".3"/>
        <circle id="ty-tip" r="2.6" fill="var(--marker)" opacity=".85"/>
      </svg>
    </div>
    <div class="btnrow">
      <button class="btn" id="ty-clear">Clear path</button>
      <button class="btn" id="ty-new">New puzzle</button>
      <button class="btn pri" id="ty-today">Today's</button>
      ${isPremium()?'<button class="btn" id="ty-timed">⏱ Timed</button>':""}
    </div>
    <div class="slimhost"></div>`;
  boardEl=pane.querySelector("#ty-board");
  elGrid=pane.querySelector("#ty-grid");
  elTotal=pane.querySelector("#ty-total");
  elTries=pane.querySelector("#ty-tries");
  pane.querySelector("#ty-help").onclick=()=>showHelp(TY_HELP);
  pane.querySelector("#ty-clear").onclick=()=>{path=[START];updatePath();};
  pane.querySelector("#ty-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#ty-today").onclick=()=>openDaily();
  const timedBtn=pane.querySelector("#ty-timed");if(timedBtn)timedBtn.onclick=()=>startTimed();
  boardEl.addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
  boardEl.addEventListener("pointerdown",onDown);
  boardEl.addEventListener("pointermove",onMove);
  boardEl.addEventListener("pointerup",onUp);
  boardEl.addEventListener("pointercancel",onUp);
  updatePath();
}
function cellFromPoint(x,y){
  const rect=elGrid.getBoundingClientRect();
  const px=x-rect.left,py=y-rect.top;
  if(px<0||py<0||px>=rect.width||py>=rect.height)return-1;
  const cw=rect.width/SIZE,ch=rect.height/SIZE;
  const c=Math.floor(px/cw),r=Math.floor(py/ch);
  const fx=(px-c*cw)/cw,fy=(py-r*ch)/ch;
  if(fx<.14||fx>.86||fy<.14||fy>.86)return-1;
  return r*SIZE+c;
}
function tryExtend(i){
  if(i<0||status!=="play")return;
  const last=path[path.length-1];
  if(i===last)return;
  if(path.length>=2&&i===path[path.length-2]){path.pop();updatePath();return;}
  if(last===END)return;
  if(path.indexOf(i)>=0)return;
  if(neighbors(last).indexOf(i)<0)return;
  path.push(i);updatePath();
}
function onDown(e){
  if(status!=="play")return;
  try{boardEl.setPointerCapture(e.pointerId);}catch(err){}
  const i=cellFromPoint(e.clientX,e.clientY);
  if(i===START&&path.length>1){path=[START];updatePath();dragging=true;return;}
  if(i===path[path.length-1]||i===START){dragging=true;return;}
  tryExtend(i);dragging=true;
}
function onMove(e){
  if(!dragging||status!=="play")return;
  e.preventDefault();
  tryExtend(cellFromPoint(e.clientX,e.clientY));
}
function onUp(){
  if(!dragging)return;
  dragging=false;
  if(status!=="play")return;
  if(path[path.length-1]===END){
    attempts++;elTries.textContent=attempts;
    const t=evalPath().total;
    if(t===puz.target){status="win";if(timed)stopwatch.stop();persist();updatePath();finish();}
    else{persist();boardEl.classList.remove("shakeX");void boardEl.offsetWidth;boardEl.classList.add("shakeX");}
  }
}
function centre(i){
  const r=Math.floor(i/SIZE),c=i%SIZE,p=100/SIZE;
  return[c*p+p/2,r*p+p/2];
}
function updatePath(){
  persist();
  elGrid.querySelectorAll(".tc").forEach(d=>d.classList.toggle("on",path.indexOf(+d.dataset.i)>=0));
  const pts=path.map(i=>centre(i).join(",")).join(" ");
  pane.querySelector("#ty-line").setAttribute("points",path.length>1?pts:"");
  const tip=centre(path[path.length-1]);
  const tipEl=pane.querySelector("#ty-tip");
  tipEl.setAttribute("cx",tip[0]);tipEl.setAttribute("cy",tip[1]);
  const ev=evalPath();
  elTotal.textContent=ev.total===null?"—":ev.total;
  const atEnd=path[path.length-1]===END;
  elTotal.style.color=status==="win"?"var(--win)":atEnd&&ev.total!==puz.target?"var(--bad)":ev.pending?"var(--faded)":"var(--ink)";
  if(status==="win"){
    pane.querySelector("#ty-line").setAttribute("stroke","var(--win)");
    tipEl.setAttribute("fill","var(--win)");
  }
}
function result(){
  const moves=path.length;
  const label=moves<=puz.par&&attempts===1?"Perfect! ⛳":moves<=puz.par?"Best path! ⛳":"Solved!";
  if(timed){
    const elapsed=stopwatch.elapsed();
    const best=getBestTime("tally");
    const isNewBest=best===null||elapsed<best;
    if(isNewBest)setBestTime("tally",elapsed);
    const t=formatMs(elapsed);
    const share="DAYBATCH · TALLY ⏱ Timed 🎯 "+puz.target+"\n"+t+(isNewBest?" — new best! 🏆":"")+"\n"+SITE_URL;
    return{win:true,title:label,
      line:t+(isNewBest?" — new best!":" · best "+formatMs(best)),share,
      onAgain:()=>startTimed(),
      slimHost:pane.querySelector(".slimhost")};
  }
  const share="DAYBATCH · TALLY 🧮 "+label+" 🎯 "+puz.target+"\nPath "+moves+" · Best "+puz.par+(moves<=puz.par?" ⛳":" (+"+(moves-puz.par)+")")+"\nTries: "+attempts+"\n"+SITE_URL; // B3 link footer
  return{win:true,title:label,
    line:"Path "+moves+" · Best "+puz.par+" · Tries "+attempts,share,
    onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")};
}
function finish(){
  if(isDaily)addHistory({date:dateCur,game:"tally",tier:tierFor(path.length,puz.par,attempts),metrics:{moves:path.length,par:puz.par,attempts,win:true}});
  showResult(result());
}
export function initTally(){
  pane=document.getElementById("pane-tally");
  openDaily();
}
