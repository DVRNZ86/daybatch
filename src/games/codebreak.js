// CODEBREAK — ported verbatim from v13 (reference/daybatch-v13.html).
// gen() is exported for logic tests; initCodebreak() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp, showSlimBar, openArchive } from "../core/ui.js";
import { getGameState, setGameState, addHistory, localDateKey, isPremium, getBestTime, setBestTime } from "../core/storage.js";
import { createStopwatch, formatMs } from "../core/timer.js";
import { SITE_URL } from "../core/share.js";

const SYMS=[["tri","#E4572E"],["cir","#2E86FF"],["sq","#0FB360"],["dia","#8B5CF6"],["star","#F5A800"],["pen","#E5484D"],["plus","#0FA3A3"]];
const LEN=5,MAXG=8;
const REPEAT_MAXG=10; // D1: Codebreak: Repeats (premium) — IDEAS.md spec
let pane;
let code,guesses,current,status,isDaily;
let repeats=false; // D1: Codebreak: Repeats (premium)
let timed=false; // D1: Timed mode (premium)
let archiveDate=null; // D1: Archive (premium)
let hintedSlots; // D1: Codebreak hint (premium) — Set of slot indices revealed
const stopwatch=createStopwatch();

export function gen(sd){
  const rng=mulberry32(sd);
  const idx=[0,1,2,3,4,5,6];
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=idx[i];idx[i]=idx[j];idx[j]=t;}
  return idx.slice(0,LEN);
}
// D1: Codebreak: Repeats — symbols may repeat (7^5 = 16,807 codes).
export function genRepeats(sd){
  const rng=mulberry32(sd);
  const out=[];
  for(let i=0;i<LEN;i++)out.push(Math.floor(rng()*SYMS.length));
  return out;
}
function slotState(g,i){
  if(g[i]===code[i])return"green";
  if(code.indexOf(g[i])>=0)return"amber";
  return"grey";
}
// D1: Repeats-mode verdicts need duplicate-letter Wordle rules (a repeated
// guessed symbol can't out-count how many times it actually appears in the
// code) — pure and exported for direct testing. verdictRow (below) is the
// live-state wrapper; kept fully separate from slotState so daily/practice —
// where the code and guesses never contain duplicates — is untouched
// byte-for-byte.
export function duplicateVerdict(g,codeArr){
  const result=new Array(g.length).fill("grey");
  const codeCount={};
  for(let i=0;i<g.length;i++){
    if(g[i]===codeArr[i])result[i]="green";
    else codeCount[codeArr[i]]=(codeCount[codeArr[i]]||0)+1;
  }
  for(let i=0;i<g.length;i++){
    if(result[i]==="green")continue;
    if(codeCount[g[i]]>0){result[i]="amber";codeCount[g[i]]--;}
  }
  return result;
}
function verdictRow(g){return repeats?duplicateVerdict(g,code):g.map((_,i)=>slotState(g,i));}
const BG={green:"var(--win)",amber:"var(--amber)",grey:"#CBD5E1"};
const EMO={green:"🟩",amber:"🟨",grey:"⬜"};
const CB_HELP=`Crack the hidden <b>5-shape code</b> — no shape repeats.<br><br>After each guess your shapes recolour to show the verdict:<br><b style="color:var(--win)">green</b> — right symbol, right slot<br><b style="color:var(--amber)">amber</b> — in the code, wrong slot<br><b>grey</b> — not in the code<br><br>The keyboard remembers what you've learned: eliminated shapes turn grey, confirmed ones get a coloured underline. You have <b>8 guesses</b>.`;
let seed,dateCur;
function load(sd,daily){seed=sd;isDaily=daily;repeats=false;timed=false;archiveDate=null;hintedSlots=new Set();dateCur=localDateKey();code=gen(sd);guesses=[];current=[];status="play";persist();render();}
// D1: Codebreak: Repeats (premium) — ephemeral like practice, never touches
// history/streaks (finish() only records when isDaily, which stays false).
function loadRepeats(){
  seed=Math.floor(Math.random()*1e9);isDaily=false;repeats=true;timed=false;archiveDate=null;hintedSlots=new Set();dateCur=localDateKey();
  code=genRepeats(seed);guesses=[];current=[];status="play";render();
}
// D1: Timed mode (premium) — ephemeral like practice, never touches
// history/streaks (finish() only records when isDaily, which stays false).
function loadTimed(){
  seed=Math.floor(Math.random()*1e9);isDaily=false;repeats=false;timed=true;archiveDate=null;hintedSlots=new Set();dateCur=localDateKey();
  code=gen(seed);guesses=[];current=[];status="play";
  stopwatch.start(ms=>{const el=document.getElementById("cb-timer");if(el)el.textContent=formatMs(ms);});
  render();
}
// D1: Archive (premium) — replays any past date's puzzle via the
// generalized dailySeed(game, date); ephemeral like practice.
function startArchive(date){
  seed=dailySeed("codebreak",date);isDaily=false;repeats=false;timed=false;archiveDate=date;hintedSlots=new Set();dateCur=localDateKey();
  code=gen(seed);guesses=[];current=[];status="play";render();
}
// D1: Codebreak hint (premium) — reveals one correct shape+position as an
// info line (doesn't touch the in-progress guess). Costs nothing in
// Timed/Repeats (ephemeral, no rank); on a daily/practice win it's folded
// into tierFor's guess count at the finish() call site, mirroring Lexi's
// "hints count against your rank" philosophy.
function hint(){
  if(status!=="play")return;
  const slot=[...Array(LEN).keys()].find(i=>!hintedSlots.has(i));
  if(slot===undefined)return;
  hintedSlots.add(slot);
  persist();render();
}
// B2 persistence: daily games snapshot on every mutation; practice is ephemeral.
function persist(){
  if(!isDaily)return;
  setGameState("codebreak",{date:dateCur,seed,guesses,current,status,hintedSlots:[...hintedSlots]});
}
// Tier per PLAN.md B2 contract: ≤2→1, ≤4→2, ≤6→3, 7–8 or fail→4 (completed).
export function tierFor(st,g){return st!=="win"?4:g<=2?1:g<=4?2:g<=6?3:4;}
function openDaily(){
  const sd=dailySeed("codebreak");
  const s=getGameState("codebreak");
  if(s&&s.date===localDateKey()&&s.seed===sd){
    seed=s.seed;isDaily=true;repeats=false;timed=false;archiveDate=null;hintedSlots=new Set(s.hintedSlots||[]);dateCur=s.date;code=gen(seed);guesses=s.guesses;current=s.current;status=s.status;render();
    if(status!=="play")showSlimBar(result());
    return;
  }
  load(sd,true);
}
function submit(){
  if(current.length!==LEN||status!=="play")return;
  guesses.push(current.slice());
  const solved=current.every((s,i)=>s===code[i]);
  current=[];
  const maxG=repeats?REPEAT_MAXG:MAXG;
  if(solved){status="win";if(timed)stopwatch.stop();persist();render();finish();return;}
  if(guesses.length>=maxG){status="fail";if(timed)stopwatch.stop();persist();render();finish();return;}
  persist();render();
}
function result(){
  const g=guesses.length;
  const maxG=repeats?REPEAT_MAXG:MAXG;
  const label=status!=="win"?"Locked out":
    g<=(repeats?3:2)?"Mastermind! 🧠":
    g<=(repeats?5:4)?"Cracked it!":
    g<=(repeats?7:6)?"Solid solve":"Close call!";
  if(timed){
    const elapsed=stopwatch.elapsed();
    if(status!=="win"){
      const share="DAYBATCH · CODEBREAK ⏱ Timed\nLocked out — "+formatMs(elapsed)+"\n"+SITE_URL;
      return{win:false,title:label,line:"Locked out — "+formatMs(elapsed),share,
        onAgain:()=>loadTimed(),slimHost:pane.querySelector(".slimhost")};
    }
    const best=getBestTime("codebreak");
    const isNewBest=best===null||elapsed<best;
    if(isNewBest)setBestTime("codebreak",elapsed);
    const t=formatMs(elapsed);
    const share="DAYBATCH · CODEBREAK ⏱ Timed\n"+t+(isNewBest?" — new best! 🏆":"")+"\n"+SITE_URL;
    return{win:true,title:label,
      line:t+(isNewBest?" — new best!":" · best "+formatMs(best)),share,
      onAgain:()=>loadTimed(),
      slimHost:pane.querySelector(".slimhost")};
  }
  const share="DAYBATCH · CODEBREAK"+(repeats?": REPEATS 🔁 ":" 🔐 ")+label+" "+(status==="win"?g:"X")+"/"+maxG+"\n"+
    guesses.map(gu=>{const v=verdictRow(gu);return gu.map((_,i)=>EMO[v[i]]).join("");}).join("\n")+"\n"+SITE_URL; // B3 link footer
  return{win:status==="win",title:label,
    line:status==="win"?"Solved in "+g+" of "+maxG:"Out of guesses",
    share,onAgain:()=>repeats?loadRepeats():load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")};
}
function finish(){
  // D1: hints count against rank, same philosophy as Lexi — folded into the
  // tierFor input only, never into the displayed GUESSES/maxG count. The
  // metrics field is only added when a hint was actually used, so a normal
  // (hint-free) completion's persisted record shape is untouched.
  if(isDaily){
    const metrics={guesses:guesses.length,win:status==="win"};
    if(hintedSlots.size)metrics.hints=hintedSlots.size;
    addHistory({date:dateCur,game:"codebreak",tier:tierFor(status,guesses.length+hintedSlots.size),metrics});
  }
  showResult(result());
}
function symbolKnown(si){
  let best=null;
  for(const g of guesses){
    const v=verdictRow(g);
    for(let i=0;i<LEN;i++){
      if(g[i]!==si)continue;
      const st=v[i];
      if(st==="green")return"green";
      if(st==="amber")best="amber";
      else if(st==="grey"&&best===null)best="grey";
    }
  }
  return best;
}
function render(){
  const maxG=repeats?REPEAT_MAXG:MAXG;
  let rows="";
  guesses.forEach((g,gi)=>{
    const v=verdictRow(g);
    rows+=`<div class="cb-row"><span class="cb-num">${gi+1}</span><div class="cb-tiles">${
      g.map((s,i)=>`<span class="cb-tile"><i class="shp ${SYMS[s][0]}" style="background:${BG[v[i]]}"></i></span>`).join("")
    }</div></div>`;
  });
  if(!guesses.length&&status==="play")
    rows=`<div style="text-align:center;color:var(--faded);font-size:13px;padding:10px 0 14px">Your guesses appear here</div>`;
  let inputRow="";
  if(status==="play"){
    inputRow=`<div class="cb-row"><span class="cb-num" style="color:var(--marker)">➤</span><div class="cb-tiles">${
      Array.from({length:LEN},(_,i)=>current[i]!==undefined
        ?`<span class="cb-slot filled" data-slot="${i}" style="padding:4px"><i class="shp ${SYMS[current[i]][0]}" style="background:${SYMS[current[i]][1]}"></i></span>`
        :`<span class="cb-slot" data-slot="${i}"></span>`).join("")
    }</div></div>`;
  }else{
    inputRow=`<div style="margin-top:8px;font-size:13px;color:var(--faded)">Code was: ${
      code.map(s=>`<i class="shp ${SYMS[s][0]}" style="background:${SYMS[s][1]};width:22px;height:22px;display:inline-block;margin-right:6px;vertical-align:middle"></i>`).join("")}</div>`;
  }
  let keys="";
  if(status==="play"){
    keys=`<div class="cb-keys">${SYMS.map((s,i)=>{
      const used=!repeats&&current.indexOf(i)>=0,known=symbolKnown(i),dead=known==="grey";
      const cls=[used?"used":"",dead?"dead":"",known==="green"?"kgreen":known==="amber"?"kamber":""].join(" ");
      return`<button data-k="${i}" class="${cls}" ${used||current.length>=LEN?"disabled":""}><i class="shp ${s[0]}" style="background:${s[1]}"></i><em class="kdot"></em></button>`;
    }).join("")}</div>
    <div class="btnrow">
      <button class="btn" id="cb-del">⌫ Delete</button>
      <button class="btn pri" id="cb-sub" ${current.length!==LEN?"disabled":""}>Submit guess</button>
    </div>`;
  }
  const timerStat=timed?`<div class="stat"><div class="lb">TIME</div><div class="vl" id="cb-timer" style="color:var(--marker)">${formatMs(stopwatch.elapsed())}</div></div>`:"";
  const dateStat=archiveDate?`<div class="stat"><div class="lb">DATE</div><div class="vl">${archiveDate.getMonth()+1}/${archiveDate.getDate()}</div></div>`:"";
  // D1: Codebreak hint (premium) — reveals correct shape+slot as an info
  // line, kept separate from the in-progress guess row.
  const hintLine=(status==="play"&&hintedSlots.size)
    ?`<div style="margin-top:6px;font-size:12px;color:var(--faded)">Hints: ${[...hintedSlots].sort((a,b)=>a-b).map(i=>
        `#${i+1} <i class="shp ${SYMS[code[i]][0]}" style="background:${SYMS[code[i]][1]};width:16px;height:16px;display:inline-block;vertical-align:middle;margin:0 6px 0 2px"></i>`
      ).join(" ")}</div>`
    :"";
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="cb-help">?</button>
      <div class="stat big"><div class="lb">GUESSES</div><div class="vl" style="color:var(--marker)">${guesses.length}/${maxG}</div></div>
      ${timerStat}${dateStat}
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${repeats?"REPEATS":timed?"TIMED":archiveDate?"ARCHIVE":isDaily?"DAILY":"PRAC"}</div></div>
    </div>
    <div class="board"><div class="cb-rows">${rows}${inputRow}</div>${hintLine}</div>
    ${keys}
    <div class="btnrow">
      <button class="btn${isDaily?"":" pri"}" id="cb-new">New puzzle</button>
      <button class="btn${isDaily?" pri":""}" id="cb-today">Today's</button>
      ${isPremium()?'<button class="btn" id="cb-repeats">🔁 Repeats (Hard)</button><button class="btn" id="cb-timed">⏱ Timed</button><button class="btn" id="cb-hint">💡 Hint</button><button class="btn" id="cb-archive">📅 Archive</button>':""}
    </div>
    <div class="slimhost"></div>`;
  pane.querySelectorAll(".cb-keys button").forEach(b=>b.onclick=()=>{
    if(current.length<LEN&&(repeats||current.indexOf(+b.dataset.k)<0)){current.push(+b.dataset.k);persist();render();}
  });
  pane.querySelectorAll(".cb-slot.filled").forEach(s=>s.onclick=()=>{
    current.splice(+s.dataset.slot,1);persist();render();
  });
  const del=pane.querySelector("#cb-del");if(del)del.onclick=()=>{current.pop();persist();render();};
  const sub=pane.querySelector("#cb-sub");if(sub)sub.onclick=submit;
  pane.querySelector("#cb-help").onclick=()=>showHelp(CB_HELP);
  const rowsEl=pane.querySelector(".cb-rows");if(rowsEl)rowsEl.scrollTop=rowsEl.scrollHeight;
  pane.querySelector("#cb-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#cb-today").onclick=()=>openDaily();
  const repBtn=pane.querySelector("#cb-repeats");if(repBtn)repBtn.onclick=()=>loadRepeats();
  const timedBtn=pane.querySelector("#cb-timed");if(timedBtn)timedBtn.onclick=()=>loadTimed();
  const hintBtn=pane.querySelector("#cb-hint");if(hintBtn)hintBtn.onclick=()=>hint();
  const archiveBtn=pane.querySelector("#cb-archive");if(archiveBtn)archiveBtn.onclick=()=>openArchive(d=>startArchive(d));
}
export function initCodebreak(){
  pane=document.getElementById("pane-codebreak");
  openDaily();
}
