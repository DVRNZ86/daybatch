// CODEBREAK — ported verbatim from v13 (reference/daybatch-v13.html).
// gen() is exported for logic tests; initCodebreak() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp, showSlimBar } from "../core/ui.js";
import { getGameState, setGameState, addHistory, localDateKey } from "../core/storage.js";

const SYMS=[["tri","#E4572E"],["cir","#2E86FF"],["sq","#0FB360"],["dia","#8B5CF6"],["star","#F5A800"],["pen","#E5484D"],["plus","#0FA3A3"]];
const LEN=5,MAXG=8;
let pane;
let code,guesses,current,status,isDaily;

export function gen(sd){
  const rng=mulberry32(sd);
  const idx=[0,1,2,3,4,5,6];
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=idx[i];idx[i]=idx[j];idx[j]=t;}
  return idx.slice(0,LEN);
}
function slotState(g,i){
  if(g[i]===code[i])return"green";
  if(code.indexOf(g[i])>=0)return"amber";
  return"grey";
}
const BG={green:"var(--win)",amber:"var(--amber)",grey:"#CBD5E1"};
const EMO={green:"🟩",amber:"🟨",grey:"⬜"};
const CB_HELP=`Crack the hidden <b>5-shape code</b> — no shape repeats.<br><br>After each guess your shapes recolour to show the verdict:<br><b style="color:var(--win)">green</b> — right symbol, right slot<br><b style="color:var(--amber)">amber</b> — in the code, wrong slot<br><b>grey</b> — not in the code<br><br>The keyboard remembers what you've learned: eliminated shapes turn grey, confirmed ones get a coloured underline. You have <b>8 guesses</b>.`;
let seed,dateCur;
function load(sd,daily){seed=sd;isDaily=daily;dateCur=localDateKey();code=gen(sd);guesses=[];current=[];status="play";persist();render();}
// B2 persistence: daily games snapshot on every mutation; practice is ephemeral.
function persist(){
  if(!isDaily)return;
  setGameState("codebreak",{date:dateCur,seed,guesses,current,status});
}
// Tier per PLAN.md B2 contract: ≤2→1, ≤4→2, ≤6→3, 7–8 or fail→4 (completed).
export function tierFor(st,g){return st!=="win"?4:g<=2?1:g<=4?2:g<=6?3:4;}
function openDaily(){
  const sd=dailySeed("codebreak");
  const s=getGameState("codebreak");
  if(s&&s.date===localDateKey()&&s.seed===sd){
    seed=s.seed;isDaily=true;dateCur=s.date;code=gen(seed);guesses=s.guesses;current=s.current;status=s.status;render();
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
  if(solved){status="win";persist();render();finish();return;}
  if(guesses.length>=MAXG){status="fail";persist();render();finish();return;}
  persist();render();
}
function result(){
  const g=guesses.length;
  const label=status!=="win"?"Locked out":g<=2?"Mastermind! 🧠":g<=4?"Cracked it!":g<=6?"Solid solve":"Close call!";
  const share="DAYBATCH · CODEBREAK 🔐 "+label+" "+(status==="win"?g:"X")+"/"+MAXG+"\n"+
    guesses.map(gu=>gu.map((_,i)=>EMO[slotState(gu,i)]).join("")).join("\n");
  return{win:status==="win",title:label,
    line:status==="win"?"Solved in "+g+" of "+MAXG:"Out of guesses",
    share,onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")};
}
function finish(){
  if(isDaily)addHistory({date:dateCur,game:"codebreak",tier:tierFor(status,guesses.length),metrics:{guesses:guesses.length,win:status==="win"}});
  showResult(result());
}
function symbolKnown(si){
  let best=null;
  for(const g of guesses)for(let i=0;i<LEN;i++){
    if(g[i]!==si)continue;
    const st=slotState(g,i);
    if(st==="green")return"green";
    if(st==="amber")best="amber";
    else if(st==="grey"&&best===null)best="grey";
  }
  return best;
}
function render(){
  let rows="";
  guesses.forEach((g,gi)=>{
    rows+=`<div class="cb-row"><span class="cb-num">${gi+1}</span><div class="cb-tiles">${
      g.map((s,i)=>`<span class="cb-tile"><i class="shp ${SYMS[s][0]}" style="background:${BG[slotState(g,i)]}"></i></span>`).join("")
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
      const used=current.indexOf(i)>=0,known=symbolKnown(i),dead=known==="grey";
      const cls=[used?"used":"",dead?"dead":"",known==="green"?"kgreen":known==="amber"?"kamber":""].join(" ");
      return`<button data-k="${i}" class="${cls}" ${used||current.length>=LEN?"disabled":""}><i class="shp ${s[0]}" style="background:${s[1]}"></i><em class="kdot"></em></button>`;
    }).join("")}</div>
    <div class="btnrow">
      <button class="btn" id="cb-del">⌫ Delete</button>
      <button class="btn pri" id="cb-sub" ${current.length!==LEN?"disabled":""}>Submit guess</button>
    </div>`;
  }
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="cb-help">?</button>
      <div class="stat big"><div class="lb">GUESSES</div><div class="vl" style="color:var(--marker)">${guesses.length}/${MAXG}</div></div>
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${isDaily?"DAILY":"PRAC"}</div></div>
    </div>
    <div class="board"><div class="cb-rows">${rows}${inputRow}</div></div>
    ${keys}
    <div class="btnrow">
      <button class="btn" id="cb-new">New puzzle</button>
      <button class="btn pri" id="cb-today">Today's</button>
    </div>
    <div class="slimhost"></div>`;
  pane.querySelectorAll(".cb-keys button").forEach(b=>b.onclick=()=>{
    if(current.length<LEN&&current.indexOf(+b.dataset.k)<0){current.push(+b.dataset.k);persist();render();}
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
}
export function initCodebreak(){
  pane=document.getElementById("pane-codebreak");
  openDaily();
}
