// CROSSING — ported verbatim from v13 (reference/daybatch-v13.html).
// gen() is exported for logic tests; initCrossing() wires the DOM.
import { mulberry32, dailySeed } from "../core/rng.js";
import { showResult, showHelp } from "../core/ui.js";

const ROWS=7,COLS=5;
let pane;
let puz,pos,seen,boomed,lives,steps,status,seed,isDaily;

export function gen(sd){
  const rng=mulberry32(sd);
  const cStart=1+Math.floor(rng()*(COLS-2));
  const key=(r,c)=>r*COLS+c;
  let r=0,c=cStart;
  const visited=new Set([key(r,c)]),pathSet=new Set([key(r,c)]);
  while(r<ROWS-1){
    const opts=[];
    if(rng()<.55)opts.push([r+1,c]);
    if(c>0&&!visited.has(key(r,c-1)))opts.push([r,c-1]);
    if(c<COLS-1&&!visited.has(key(r,c+1)))opts.push([r,c+1]);
    const pick=opts.length?opts[Math.floor(rng()*opts.length)]:[r+1,c];
    r=pick[0];c=pick[1];visited.add(key(r,c));pathSet.add(key(r,c));
  }
  const traps=new Set();
  for(let i=0;i<ROWS*COLS;i++)if(!pathSet.has(i)&&rng()<.34)traps.add(i);
  const clues=[];
  for(let i=0;i<ROWS*COLS;i++){
    const rr=Math.floor(i/COLS),cc=i%COLS;let n=0;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc)continue;
      const ar=rr+dr,ac=cc+dc;
      if(ar>=0&&ar<ROWS&&ac>=0&&ac<COLS&&traps.has(ar*COLS+ac))n++;
    }
    clues.push(n);
  }
  return{traps,clues,start:cStart};
}
const CR_HELP=`A hidden safe path runs top to bottom. Reach the 🏁 row. You have <b>3 lives</b>. Two different things:
  <div class="legend">
    <div>
      <div class="mini">
        <span style="background:#EDF3F9;border:1px dotted var(--grid)">💥</span><span></span><span></span>
        <span></span><span style="background:#FDFEFE;border:1.5px solid var(--amber);color:var(--amber);font-weight:700" class="mono">2</span><span style="background:#EDF3F9;border:1px dotted var(--grid)">💥</span>
        <span></span><span></span><span></span>
      </div>
      <b>The number</b><div>counts traps in all <b>8</b> tiles around it — diagonals included</div>
    </div>
    <div>
      <div class="mini">
        <span></span><span style="background:var(--markerSoft);color:var(--marker);font-weight:700">↑</span><span></span>
        <span style="background:var(--markerSoft);color:var(--marker);font-weight:700">←</span><span style="background:#FDFEFE;border:1px solid var(--grid)">🚶</span><span style="background:var(--markerSoft);color:var(--marker);font-weight:700">→</span>
        <span></span><span style="background:var(--markerSoft);color:var(--marker);font-weight:700">↓</span><span></span>
      </div>
      <b>Your moves</b><div>only <b>4</b> ways — the dashed tiles</div>
    </div>
  </div>
  <div style="margin-top:8px">A <b>·</b> means zero traps nearby — it opens its neighbours for free. Stepping on a trap costs a life but you stay put.</div>`;
function cascade(idx){
  const stack=[idx];
  while(stack.length){
    const j=stack.pop();
    if(seen.has(j))continue;
    seen.add(j);
    if(puz.clues[j]===0){
      const rr=Math.floor(j/COLS),cc=j%COLS;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc)continue;
        const ar=rr+dr,ac=cc+dc;
        if(ar>=0&&ar<ROWS&&ac>=0&&ac<COLS){
          const k=ar*COLS+ac;
          if(!puz.traps.has(k)&&!seen.has(k))stack.push(k);
        }
      }
    }
  }
}
function load(sd,daily){
  seed=sd;isDaily=daily;puz=gen(sd);pos=null;seen=new Set();boomed=new Set();
  lives=3;steps=0;status="play";render();
}
function legal(i){
  if(status!=="play")return false;
  if(pos===null)return i===puz.start;
  const pr=Math.floor(pos/COLS),pc=pos%COLS,r=Math.floor(i/COLS),c=i%COLS;
  return Math.abs(pr-r)+Math.abs(pc-c)===1;
}
function tap(i){
  if(!legal(i))return;
  steps++;
  if(puz.traps.has(i)){
    boomed.add(i);lives--;
    if(lives<=0){status="fail";render();finish();return;}
    render();return;
  }
  cascade(i);pos=i;
  if(Math.floor(i/COLS)===ROWS-1){status="win";render();finish();return;}
  render();
}
function finish(){
  const label=status!=="win"?"Blown up 💥":lives===3?"Flawless crossing!":lives===2?"Made it!":"By a whisker!";
  const share=status==="win"
    ?"DAYBATCH · CROSSING 🧭 "+label+"\n"+steps+" steps · "+"❤️".repeat(lives)+"💥".repeat(3-lives)
    :"DAYBATCH · CROSSING 💥\nDidn't make it — "+steps+" steps";
  showResult({win:status==="win",title:label,
    line:steps+" steps · "+"❤️".repeat(lives)+"💥".repeat(3-lives),share,
    onAgain:()=>load(Math.floor(Math.random()*1e9),false),
    slimHost:pane.querySelector(".slimhost")});
}
function clueColor(n){return n===0?"var(--faded)":n===1?"var(--win)":n===2?"var(--amber)":"var(--bad)";}
function render(){
  let cells="";
  for(let i=0;i<ROWS*COLS;i++){
    const r=Math.floor(i/COLS);
    const cls=[r===ROWS-1?"goal":"",seen.has(i)?"seen":"",i===pos?"pos":"",
      (boomed.has(i)||(status!=="play"&&puz.traps.has(i)))?"boom":"",legal(i)?"can":""].join(" ");
    let inner="";
    const showTrap=boomed.has(i)||(status!=="play"&&puz.traps.has(i));
    if(showTrap)inner="💥";
    else if(seen.has(i))inner=`<span style="color:${clueColor(puz.clues[i])}">${puz.clues[i]||"·"}</span>`;
    if(i===puz.start&&pos===null)inner+='<span class="tag">START</span>';
    if(r===ROWS-1&&!seen.has(i)&&!showTrap)inner+='<span class="flag">🏁</span>';
    cells+=`<button data-i="${i}" class="${cls}">${inner}</button>`;
  }
  pane.innerHTML=`
    <div class="stats">
      <button class="helpbtn" id="cr-help">?</button>
      <div class="stat big"><div class="lb">LIVES</div><div class="vl">${"❤️".repeat(lives)}${"🖤".repeat(3-lives)}</div></div>
      <div class="stat"><div class="lb">STEPS</div><div class="vl">${steps}</div></div>
      <div class="stat"><div class="lb">MODE</div><div class="vl" style="color:var(--faded)">${isDaily?"DAILY":"PRAC"}</div></div>
    </div>
    <div class="board"><div id="cr-grid">${cells}</div></div>
    <div class="btnrow">
      <button class="btn" id="cr-retry">Retry</button>
      <button class="btn" id="cr-new">New puzzle</button>
      <button class="btn pri" id="cr-today">Today's</button>
    </div>
    <div class="slimhost"></div>`;
  pane.querySelectorAll("#cr-grid button").forEach(b=>b.onclick=()=>tap(+b.dataset.i));
  pane.querySelector("#cr-help").onclick=()=>showHelp(CR_HELP);
  pane.querySelector("#cr-retry").onclick=()=>load(seed,isDaily);
  pane.querySelector("#cr-new").onclick=()=>load(Math.floor(Math.random()*1e9),false);
  pane.querySelector("#cr-today").onclick=()=>load(dailySeed("crossing"),true);
}
export function initCrossing(){
  pane=document.getElementById("pane-crossing");
  load(dailySeed("crossing"),true);
}
