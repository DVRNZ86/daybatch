// LEXI — ported verbatim from v13 (reference/daybatch-v13.html).
// v0.B1.2 deviation (approved by Darren, 11 Jul 2026): build() renders the live
// found/hints counts — v13 hardcoded 0, so 🔀 Shuffle reset the visible stats.
// gen()/counts()/canForm() are exported for logic tests; initLexi() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp, showSlimBar, openArchive, suppressZoomGestures } from "../core/ui.js";
import { getGameState, setGameState, addHistory, localDateKey, isPremium, getBestTime, setBestTime } from "../core/storage.js";
import { createStopwatch, formatMs } from "../core/timer.js";
import { SITE_URL } from "../core/share.js";
import { W6, ALL } from "./words.js";

export function counts(w){const c={};for(const ch of w)c[ch]=(c[ch]||0)+1;return c;}
export function canForm(word,base){const b=Object.assign({},base);for(const ch of word){if(!b[ch])return false;b[ch]--;}return true;}

let pane;
let puz,found,hinted,hints,status,isDaily,seq,dragging=false,moved=false,seedCur,dateCur;
let letterEls,elPrev,wheelEl,centers;
let timed=false; // D1: Timed mode (premium)
let archiveDate=null; // D1: Archive (premium)
const stopwatch=createStopwatch();

export function gen(sd){
  const rng=mulberry32(sd);
  const start=Math.floor(rng()*W6.length);
  for(let k=0;k<W6.length;k++){
    const seed=W6[(start+k)%W6.length];
    const base=counts(seed);
    const targets=ALL.filter(w=>w.length<=6&&canForm(w,base));
    if(targets.length>=7&&targets.length<=16){
      targets.sort((a,b)=>a.length-b.length||a.localeCompare(b));
      // shuffle wheel letters
      const letters=seed.split("");
      for(let i=letters.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=letters[i];letters[i]=letters[j];letters[j]=t;}
      return{seed,letters,targets};
    }
  }
  return null;
}
function load(sd,daily){
  isDaily=daily;timed=false;archiveDate=null;seedCur=sd;dateCur=localDateKey();puz=gen(sd);
  if(!puz)puz=gen((sd+99991)>>>0);
  found=new Set();hinted=new Set();hints=0;status="play";seq=[];
  build();persist();
}
// D1: Timed mode (premium) — ephemeral like practice, never touches
// history/streaks (finish() only records when isDaily, which stays false).
function startTimed(){
  isDaily=false;timed=true;archiveDate=null;seedCur=Math.floor(Math.random()*1e9);dateCur=localDateKey();
  puz=gen(seedCur);
  if(!puz)puz=gen((seedCur+99991)>>>0);
  found=new Set();hinted=new Set();hints=0;status="play";seq=[];
  build();
  stopwatch.start(ms=>{const el=document.getElementById("lx-timer");if(el)el.textContent=formatMs(ms);});
}
// D1: Archive (premium) — replays any past date's puzzle via the
// generalized dailySeed(game, date); ephemeral like practice.
function startArchive(date){
  isDaily=false;timed=false;archiveDate=date;seedCur=dailySeed("lexi",date);dateCur=localDateKey();
  puz=gen(seedCur);
  if(!puz)puz=gen((seedCur+99991)>>>0);
  found=new Set();hinted=new Set();hints=0;status="play";seq=[];
  build();
}
// B2 persistence: daily games snapshot on every mutation (incl. wheel order);
// practice is ephemeral.
function persist(){
  if(!isDaily)return;
  setGameState("lexi",{date:dateCur,seed:seedCur,letters:puz.letters,found:[...found],hinted:[...hinted],hints,status});
}
// Tier per PLAN.md B2 contract: 0 hints→1, ≤2→2, 3+→3.
export function tierFor(h){return h===0?1:h<=2?2:3;}
function openDaily(){
  const sd=dailySeed("lexi");
  const s=getGameState("lexi");
  if(s&&s.date===localDateKey()&&s.seed===sd){
    isDaily=true;timed=false;archiveDate=null;seedCur=s.seed;dateCur=s.date;puz=gen(s.seed);
    if(!puz)puz=gen((s.seed+99991)>>>0);
    puz.letters=s.letters;
    found=new Set(s.found);hinted=new Set(s.hinted);hints=s.hints;status=s.status;seq=[];
    build();
    if(status!=="play")showSlimBar(result());
    return;
  }
  load(sd,true);
}
function slotsHTML(){
  return puz.targets.map(w=>{
    const isF=found.has(w),isH=hinted.has(w);
    return `<span class="lx-word${isF?(isH?" hinted":" found"):""}">${
      w.split("").map(ch=>`<b>${isF?ch:""}</b>`).join("")}</span>`;
  }).join("");
}
function build(){
  const timerStat=timed?`<div class="stat"><div class="lb">TIME</div><div class="vl" id="lx-timer" style="color:var(--marker)">${formatMs(stopwatch.elapsed())}</div></div>`:"";
  const dateStat=archiveDate?`<div class="stat"><div class="lb">DATE</div><div class="vl">${archiveDate.getMonth()+1}/${archiveDate.getDate()}</div></div>`:"";
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="lx-help">?</button>
      <div class="stat big"><div class="lb">FOUND</div><div class="vl" style="color:var(--win)" id="lx-found">${found.size}/${puz.targets.length}</div></div>
      <div class="stat"><div class="lb">HINTS</div><div class="vl" id="lx-hints">${hints}</div></div>
      ${timerStat}${dateStat}
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${timed?"TIMED":archiveDate?"ARCHIVE":isDaily?"DAILY":"PRAC"}</div></div>
    </div>
    <div class="board" style="padding:8px 6px">
      <div class="lx-slots" id="lx-slots">${slotsHTML()}</div>
      <div id="lx-preview">&nbsp;</div>
      <div id="lx-wheelwrap">
        <div class="lx-ring"></div>
        <svg id="lx-svg" viewBox="0 0 230 230">
          <polyline id="lx-line" points="" fill="none" stroke="var(--marker)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".45"/>
        </svg>
        ${puz.letters.map((ch,i)=>{
          const a=-Math.PI/2+i*2*Math.PI/puz.letters.length;
          const x=115+78*Math.cos(a),y=115+78*Math.sin(a);
          return `<div class="lx-letter" data-i="${i}" style="left:${x}px;top:${y}px">${ch}</div>`;
        }).join("")}
      </div>
      <div class="lx-tools">
        <button id="lx-back">⌫</button>
        <button id="lx-check" style="border-color:var(--marker);color:var(--marker)">✓ Check</button>
        <button id="lx-shuffle">🔀</button>
        <button id="lx-hint">💡 Hint</button>
      </div>
    </div>
    <div class="btnrow">
      <button class="btn${isDaily?"":" pri"}" id="lx-new">New puzzle</button>
      <button class="btn${isDaily?" pri":""}" id="lx-today">Today's</button>
      ${isPremium()?'<button class="btn" id="lx-timed">⏱ Timed</button><button class="btn" id="lx-archive">📅 Archive</button>':""}
    </div>
    <div class="slimhost"></div>`;
  wheelEl=pane.querySelector("#lx-wheelwrap");
  elPrev=pane.querySelector("#lx-preview");
  letterEls=[...pane.querySelectorAll(".lx-letter")];
  centers=puz.letters.map((_,i)=>{
    const a=-Math.PI/2+i*2*Math.PI/puz.letters.length;
    return[115+78*Math.cos(a),115+78*Math.sin(a)];
  });
  pane.querySelector("#lx-help").onclick=()=>showHelp(LX_HELP);
  pane.querySelector("#lx-shuffle").onclick=shuffle;
  pane.querySelector("#lx-back").onclick=()=>{seq.pop();drawSeq();};
  pane.querySelector("#lx-check").onclick=()=>{submitSeq();};
  pane.querySelector("#lx-hint").onclick=hint;
  pane.querySelector("#lx-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#lx-today").onclick=()=>openDaily();
  const timedBtn=pane.querySelector("#lx-timed");if(timedBtn)timedBtn.onclick=()=>startTimed();
  const archiveBtn=pane.querySelector("#lx-archive");if(archiveBtn)archiveBtn.onclick=()=>openArchive(d=>startArchive(d));
  wheelEl.addEventListener("touchmove",e=>e.preventDefault(),{passive:false});
  wheelEl.addEventListener("touchstart",e=>{if(e.touches.length===1)e.preventDefault();},{passive:false});
  suppressZoomGestures(wheelEl);
  wheelEl.addEventListener("pointerdown",onDown);
  wheelEl.addEventListener("pointermove",onMove);
  wheelEl.addEventListener("pointerup",onUp);
  wheelEl.addEventListener("pointercancel",onUp);
}
function shuffle(){
  const idx=puz.letters.map((_,i)=>i);
  for(let i=idx.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=idx[i];idx[i]=idx[j];idx[j]=t;}
  puz.letters=idx.map(i=>puz.letters[i]);
  seq=[];build();persist();
}
function hint(){
  const unfound=puz.targets.filter(w=>!found.has(w));
  if(!unfound.length||status!=="play")return;
  const w=unfound[0];
  found.add(w);hinted.add(w);hints++;
  persist();refresh();
  checkWin();
}
function letterFromPoint(x,y){
  const rect=wheelEl.getBoundingClientRect();
  const px=(x-rect.left)*(230/rect.width),py=(y-rect.top)*(230/rect.height);
  for(let i=0;i<centers.length;i++){
    const dx=px-centers[i][0],dy=py-centers[i][1];
    if(dx*dx+dy*dy<26*26)return i;
  }
  return -1;
}
function drawSeq(){
  letterEls.forEach((el,i)=>el.classList.toggle("sel",seq.indexOf(i)>=0));
  pane.querySelector("#lx-line").setAttribute("points",seq.map(i=>centers[i].join(",")).join(" "));
  elPrev.textContent=seq.length?seq.map(i=>puz.letters[i]).join(""):" ";
  elPrev.style.color="var(--marker)";
}
function onDown(e){
  if(status!=="play")return;
  try{wheelEl.setPointerCapture(e.pointerId);}catch(err){}
  dragging=true;moved=false;
  const i=letterFromPoint(e.clientX,e.clientY);
  if(i<0)return;
  const pos=seq.indexOf(i);
  if(pos<0)seq.push(i);                    // tap or swipe-start: add letter
  else if(pos===seq.length-1)seq.pop();    // tapping the last letter again = undo
  drawSeq();
}
function onMove(e){
  if(!dragging||status!=="play")return;
  e.preventDefault();
  const i=letterFromPoint(e.clientX,e.clientY);
  if(i<0)return;
  const pos=seq.indexOf(i);
  if(pos>=0){
    if(pos===seq.length-2){seq.pop();moved=true;drawSeq();} // retrace to undo
  }else{
    seq.push(i);moved=true;drawSeq();
  }
}
function onUp(){
  if(!dragging)return;
  dragging=false;
  if(status!=="play")return;
  if(moved)submitSeq();            // swipe gesture: release = submit
  // plain tap: keep building — submit via ✓ Check or a finishing swipe
}
function submitSeq(){
  const word=seq.map(i=>puz.letters[i]).join("");
  if(word.length>=3){
    if(puz.targets.indexOf(word)>=0&&!found.has(word)){
      found.add(word);
      persist();refresh();
      elPrev.textContent=word;
      elPrev.style.color="var(--win)";
      checkWin();
    }else if(found.has(word)){
      elPrev.style.color="var(--faded)";
    }else{
      elPrev.style.color="var(--bad)";
      wheelEl.classList.remove("shakeX");void wheelEl.offsetWidth;wheelEl.classList.add("shakeX");
    }
  }
  seq=[];
  setTimeout(()=>{if(!dragging&&!seq.length){letterEls.forEach(el=>el.classList.remove("sel"));pane.querySelector("#lx-line").setAttribute("points","");}},350);
}
function refresh(){
  pane.querySelector("#lx-slots").innerHTML=slotsHTML();
  pane.querySelector("#lx-found").textContent=found.size+"/"+puz.targets.length;
  pane.querySelector("#lx-hints").textContent=hints;
}
function checkWin(){
  if(found.size===puz.targets.length){
    status="win";
    if(timed)stopwatch.stop();
    persist();
    finish();
  }
}
function result(){
  const label=hints===0?"Wordsmith! 🏆":hints<=2?"Sharp!":"Solved!";
  if(timed){
    const elapsed=stopwatch.elapsed();
    const best=getBestTime("lexi");
    const isNewBest=best===null||elapsed<best;
    if(isNewBest)setBestTime("lexi",elapsed);
    const t=formatMs(elapsed);
    const share="DAYBATCH · LEXI ⏱ Timed\n"+t+(isNewBest?" — new best! 🏆":"")+"\n"+SITE_URL;
    return{win:true,title:label,
      line:t+(isNewBest?" — new best!":" · best "+formatMs(best)),share,
      onAgain:()=>startTimed(),
      slimHost:pane.querySelector(".slimhost")};
  }
  const share="DAYBATCH · LEXI 🔤 "+label+"\n"+puz.targets.length+" words · "+hints+" hint"+(hints===1?"":"s")+"\n"+SITE_URL; // B3 link footer
  return{win:true,title:label,
    line:puz.targets.length+" words · "+hints+" hint"+(hints===1?"":"s"),share,
    onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")};
}
function finish(){
  if(isDaily)addHistory({date:dateCur,game:"lexi",tier:tierFor(hints),metrics:{words:puz.targets.length,hints,win:true}});
  showResult(result());
}
const LX_HELP=`<b>Swipe through the letters</b> and release to submit — or <b>tap letters one by one</b> and press ✓ Check. Every word uses each wheel letter at most once.<br><br>Fill every slot above the wheel — all target words are <b>common English words</b> of 3+ letters made from today's six letters.<br><br><b>🔀 Shuffle</b> rearranges the wheel when you're stuck — it often shakes a word loose. <b>💡 Hint</b> reveals a whole word, but hints count against your rank.<br><br>Retrace your swipe to undo a letter.`;
export function initLexi(){
  pane=document.getElementById("pane-lexi");
  openDaily();
}
