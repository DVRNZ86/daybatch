// SONAR — ported verbatim from v13 (reference/daybatch-v13.html).
// gen() is exported for logic tests; initSonar() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp, showSlimBar, openArchive } from "../core/ui.js";
import { getGameState, setGameState, addHistory, localDateKey, isPremium, getBestTime, setBestTime } from "../core/storage.js";
import { createStopwatch, formatMs } from "../core/timer.js";
import { SITE_URL } from "../core/share.js";

const SN=7,SHIPS=[3,2,2];
let pane;
let puz,revealed,status,isDaily;
let timed=false; // D1: Timed mode (premium)
let archiveDate=null; // D1: Archive (premium)
let hintsUsed=0; // D1: Sonar hint (premium) — see tierFor's hint penalty
const stopwatch=createStopwatch();

function tryGen(sd){
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
let seed,dateCur;
function load(sd,daily){seed=sd;isDaily=daily;timed=false;archiveDate=null;hintsUsed=0;dateCur=localDateKey();puz=gen(sd);revealed=new Map();status="play";persist();render();}
// D1: Timed mode (premium) — ephemeral like practice, never touches
// history/streaks (finish() only records when isDaily, which stays false).
function startTimed(){
  seed=Math.floor(Math.random()*1e9);isDaily=false;timed=true;archiveDate=null;hintsUsed=0;dateCur=localDateKey();
  puz=gen(seed);revealed=new Map();status="play";
  stopwatch.start(ms=>{const el=document.getElementById("sn-timer");if(el)el.textContent=formatMs(ms);});
  render();
}
// D1: Archive (premium) — replays any past date's puzzle via the
// generalized dailySeed(game, date); ephemeral like practice.
function startArchive(date){
  seed=dailySeed("sonar",date);isDaily=false;timed=false;archiveDate=date;hintsUsed=0;dateCur=localDateKey();
  puz=gen(seed);revealed=new Map();status="play";render();
}
function hits(){let n=0;revealed.forEach(v=>{if(v==="hit")n++;});return n;}
// B2 persistence: daily games snapshot on every mutation; practice is ephemeral.
function persist(){
  if(!isDaily)return;
  setGameState("sonar",{date:dateCur,seed,revealed:[...revealed],status,hintsUsed});
}
// Tier per PLAN.md B2 contract: 7 pings→1, ≤9→2, ≤12→3, else→4 (completed).
// D1 patch (Darren's phone test): a hint always reveals a guaranteed hit, so
// without a penalty it could farm a perfect tier with zero deduction skill.
// Each hint now costs 2 pings' worth toward the tier math (its own tap plus
// one extra), and using any hint forfeits tier 1 outright.
export function tierFor(pings,hintsUsed=0){
  const effective=pings+hintsUsed;
  const tier=effective===7?1:effective<=9?2:effective<=12?3:4;
  return hintsUsed>0?Math.max(tier,2):tier;
}
function openDaily(){
  const sd=dailySeed("sonar");
  const s=getGameState("sonar");
  if(s&&s.date===localDateKey()&&s.seed===sd){
    seed=s.seed;isDaily=true;timed=false;archiveDate=null;hintsUsed=s.hintsUsed||0;dateCur=s.date;puz=gen(seed);revealed=new Map(s.revealed);status=s.status;render();
    if(status!=="play")showSlimBar(result());
    return;
  }
  load(sd,true);
}
function tap(i){
  if(status!=="play"||revealed.has(i))return;
  revealed.set(i,puz.occ.has(i)?"hit":"miss");
  if(hits()===puz.total){
    status="win";
    if(timed)stopwatch.stop();
    persist();render();finish();return;
  }
  persist();render();
}
// D1: Sonar hint (premium) — reveals a guaranteed-hit cell via the normal
// tap() path; tierFor() charges it double and forfeits tier 1 (see above).
function hint(){
  if(status!=="play")return;
  const cell=[...puz.occ].find(i=>!revealed.has(i));
  if(cell===undefined)return;
  hintsUsed++;
  tap(cell);
}
function result(){
  const p=revealed.size;
  const hintNote=hintsUsed>0?" · "+hintsUsed+" hint"+(hintsUsed===1?"":"s"):"";
  const label=hintsUsed>0?"Solved!":p===puz.total?"Perfect! 🏆":p<=puz.total+2?"Sharp shooting!":p<=puz.total+5?"Solid sweep":"All found";
  if(timed){
    const elapsed=stopwatch.elapsed();
    const best=getBestTime("sonar");
    const isNewBest=best===null||elapsed<best;
    if(isNewBest)setBestTime("sonar",elapsed);
    const t=formatMs(elapsed);
    const share="DAYBATCH · SONAR ⏱ Timed\n"+p+" pings · "+t+(isNewBest?" — new best! 🏆":"")+"\n"+SITE_URL;
    return{win:true,title:label,
      line:p+" pings · "+t+(isNewBest?" — new best!":" · best "+formatMs(best)),
      share,onAgain:()=>startTimed(),
      slimHost:pane.querySelector(".slimhost")};
  }
  const share="DAYBATCH · SONAR 📡 "+label+"\n"+p+" pings"+hintNote+"\n"+SITE_URL; // B3 link footer
  return{win:true,title:label,line:p+" pings"+hintNote,
    share,onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")};
}
function finish(){
  if(isDaily)addHistory({date:dateCur,game:"sonar",tier:tierFor(revealed.size,hintsUsed),metrics:{pings:revealed.size,hintsUsed,win:true}});
  showResult(result());
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
  const timerStat=timed?`<div class="stat"><div class="lb">TIME</div><div class="vl" id="sn-timer" style="color:var(--marker)">${formatMs(stopwatch.elapsed())}</div></div>`:"";
  const dateStat=archiveDate?`<div class="stat"><div class="lb">DATE</div><div class="vl">${archiveDate.getMonth()+1}/${archiveDate.getDate()}</div></div>`:"";
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="sn-help">?</button>
      <div class="stat big"><div class="lb">PINGS</div><div class="vl" style="color:var(--marker)">${revealed.size}</div></div>
      <div class="stat big"><div class="lb">FOUND</div><div class="vl" style="color:var(--win)">${hits()}/${puz.total}</div></div>
      ${timerStat}${dateStat}
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${archiveDate?"ARCHIVE":timed?"TIMED":isDaily?"DAILY":"PRAC"}</div></div>
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
      ${isPremium()?'<button class="btn" id="sn-timed">⏱ Timed</button><button class="btn" id="sn-hint">💡 Hint</button><button class="btn" id="sn-archive">📅 Archive</button>':""}
    </div>
    <div class="slimhost"></div>`;
  pane.querySelectorAll(".sn-row button").forEach(b=>b.onclick=()=>tap(+b.dataset.i));
  pane.querySelector("#sn-help").onclick=()=>showHelp(SN_HELP);
  pane.querySelector("#sn-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#sn-today").onclick=()=>openDaily();
  const timedBtn=pane.querySelector("#sn-timed");if(timedBtn)timedBtn.onclick=()=>startTimed();
  const hintBtn=pane.querySelector("#sn-hint");if(hintBtn)hintBtn.onclick=()=>hint();
  const archiveBtn=pane.querySelector("#sn-archive");if(archiveBtn)archiveBtn.onclick=()=>openArchive(d=>startArchive(d));
}
export function initSonar(){
  pane=document.getElementById("pane-sonar");
  openDaily();
}
