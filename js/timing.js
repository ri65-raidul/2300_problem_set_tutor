/* ============================================================
   TIMING DIAGRAM PROBLEM TYPE  —  5-stage guided problem
   for the fixed inverter (Va→Vx) → NAND (Vx,Vb→Vy) circuit.

   Stage A : complete the logic truth table
   Stage B : draw Vx, Vy — zero-delay model
   Stage C : draw Vx, Vy — constant delay (t_inv, t_nand)
   Stage D : draw Vx, Vy — input-dependent delay (t_a→x, t_b→y, t_x→y)
   Stage E : draw Vx, Vy — transition- & input-dependent delay

   Stages run sequentially: a stage must be submitted correctly before
   moving on; a correct stage turns the card green and swaps "Submit" for
   "Next / Previous"; the last stage offers only "Explore / Previous".
   ============================================================ */
const timing = {
  p:null,
  stage:0,
  completed:null,
  verdict:false,
  tbl:null,           // stage A answers
  draw:null,          // {B:{Vx,Vy}, C:..., D:..., E:...}
  expected:null,      // {B:{Vx,Vy}, ...} correct waveforms
  undo:null,          // {B:[{Vx,Vy},...], C:..., ...} per-stage undo stacks
  dragging:false, dragSig:null, drawValue:null, lastBin:null
};

/* -- fixed model of the circuit -- */
const TSTEP=10, TDUR=160, TN=TDUR/TSTEP;                 // 16 bins of 10 ps
const TVA=[0,0,0,1,1,1,1,1,0,0,0,0,1,1,1,1];             // rises 30, falls 80, rises 120
const TVB=[1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0];             // falls 40
const TDELAY={ inv:10, nand:20, ax:10, by:20, xy:10,
               ax_hl:10, ax_lh:20, by_hl:20, by_lh:30, xy_hl:10, xy_lh:30 };

const TCOLS=[
  {key:"Va",kind:"in"},{key:"P0",kind:"trans"},{key:"N0",kind:"trans"},{key:"Vx",kind:"node"},
  {key:"Vb",kind:"in"},{key:"P1",kind:"trans"},{key:"P2",kind:"trans"},{key:"N1",kind:"trans"},{key:"N2",kind:"trans"},{key:"Vy",kind:"node"}
];

const TSTAGES=[
  { key:"A", kind:"table", num:"6.A", title:"Logic behaviour",
    desc:"Get to know the circuit by completing its truth table.",
    instr:"As a first step, complete the table to get to know the logical behaviour of this circuit. Label closed transistors with <b>C</b> and leave cells of open transistors empty.",
    model:null },
  { key:"B", kind:"draw", model:"zero", num:"6.B", title:"Timing diagram — zero-delay model",
    desc:"Draw V\u2093 and V\u1d67 assuming no gate delay.",
    instr:"Complete the timing diagram for a <b>zero-delay model</b>. Remember from Topic 1 that voltages change <i>continuously</i> between levels — they never jump instantly from one level to the other." },
  { key:"C", kind:"draw", model:"const", num:"6.C", title:"Timing diagram — constant-delay model",
    desc:"Draw V\u2093 and V\u1d67 with a fixed gate delay.",
    instr:"Complete the timing diagram for a <b>constant-delay model</b>. Use the delays below for the inverter and the NAND gate.",
    delays:["t<sub>inv</sub> = <b>10 ps</b>","t<sub>nand</sub> = <b>20 ps</b>"] },
  { key:"D", kind:"draw", model:"inputdep", num:"6.D", title:"Timing diagram — input-dependent constant delay",
    desc:"Draw V\u2093 and V\u1d67 with per-path delays.",
    instr:"Complete the timing diagram for an <b>input-dependent constant-delay model</b>. Use the per-path delays below.",
    delays:["t<sub>a\u2192x</sub> = <b>10 ps</b>","t<sub>b\u2192y</sub> = <b>20 ps</b>","t<sub>x\u2192y</sub> = <b>10 ps</b>"] },
  { key:"E", kind:"draw", model:"trans", num:"6.E", title:"Timing diagram — transition- & input-dependent delay",
    desc:"Draw V\u2093 and V\u1d67 with per-path, per-edge delays.",
    instr:"Complete the timing diagram for a <b>transition- and input-dependent delay model</b>. The delay depends on the direction of the resulting output edge \u2014 use the per-path, per-edge delays below.",
    delays:["t<sub>a\u2192x,hl</sub> = <b>10 ps</b>","t<sub>a\u2192x,lh</sub> = <b>20 ps</b>","t<sub>b\u2192y,hl</sub> = <b>20 ps</b>","t<sub>b\u2192y,lh</sub> = <b>30 ps</b>","t<sub>x\u2192y,hl</sub> = <b>10 ps</b>","t<sub>x\u2192y,lh</sub> = <b>30 ps</b>"] }
];

/* ============================================================
   Delay engine (event-driven) for this specific circuit
   ============================================================ */
function tEdges(bins){
  const e=[{t:0,v:bins[0]}];
  for(let i=1;i<bins.length;i++) if(bins[i]!==bins[i-1]) e.push({t:i*TSTEP,v:bins[i]});
  return e;
}
function tBins(edges,n){
  const es=edges.slice().sort((a,b)=>a.t-b.t);
  const out=Array(n);
  for(let i=0;i<n;i++){ const t=i*TSTEP; let v=es[0].v; for(const e of es){ if(e.t<=t) v=e.v; else break; } out[i]=v; }
  return out;
}
function tNand(a,b){ return (a===1 && b===1) ? 0 : 1; }

/* Vx = NOT Va, delayed per model. */
function tComputeVx(model){
  const va=tEdges(TVA);
  const edges=[{t:0, v:1-TVA[0]}];
  for(let k=1;k<va.length;k++){
    const vxNew=1-va[k].v, dir=vxNew?"lh":"hl";
    let d=0;
    if(model==="const") d=TDELAY.inv;
    else if(model==="inputdep") d=TDELAY.ax;
    else if(model==="trans") d=(dir==="lh"?TDELAY.ax_lh:TDELAY.ax_hl);
    edges.push({t:va[k].t+d, v:vxNew});
  }
  return tBins(edges,TN);
}
function tDelayVy(model,path,dir){
  if(model==="zero") return 0;
  if(model==="const") return TDELAY.nand;
  if(model==="inputdep") return path==="x"?TDELAY.xy:TDELAY.by;
  if(path==="x") return dir==="lh"?TDELAY.xy_lh:TDELAY.xy_hl;
  return dir==="lh"?TDELAY.by_lh:TDELAY.by_hl;
}
/* Vy = NAND(Vx, Vb), each output edge delayed by the path + direction that
   caused it. Simultaneous causes: a falling NAND (needs both inputs high)
   waits for the slower path; a rising NAND (either input low) follows the
   faster one. */
function tComputeVy(model,vxBins){
  const ev=[];
  tEdges(vxBins).slice(1).forEach(e=>ev.push({t:e.t,path:"x",v:e.v}));
  tEdges(TVB).slice(1).forEach(e=>ev.push({t:e.t,path:"b",v:e.v}));
  ev.sort((a,b)=>a.t-b.t);
  let curVx=vxBins[0], curVb=TVB[0], ideal=tNand(curVx,curVb);
  const edges=[{t:0,v:ideal}];
  let i=0;
  while(i<ev.length){
    const t=ev[i].t, group=[];
    while(i<ev.length && ev[i].t===t){ group.push(ev[i]); i++; }
    const before=ideal;
    group.forEach(e=>{ if(e.path==="x") curVx=e.v; else curVb=e.v; });
    const after=tNand(curVx,curVb);
    if(after!==before){
      const dir=after?"lh":"hl";
      const ds=group.map(e=>tDelayVy(model,e.path,dir));
      const d = after===0 ? Math.max(...ds) : Math.min(...ds);
      edges.push({t:t+d, v:after});
      ideal=after;
    } else ideal=after;
  }
  return tBins(edges,TN);
}
function tComputeWaves(model){ const Vx=tComputeVx(model); return {Vx, Vy:tComputeVy(model,Vx)}; }

/* Stage-A truth: closed switches + node voltages per input row.
   Second stage is a NAND: P1/P2 (gated by Vx/Vb) sit in parallel between
   VDD and Vy, while N1/N2 (gated by Vx/Vb) sit in series between Vy and
   ground — Vy pulls low only when both N1 and N2 conduct. */
function tTruthRows(){
  const rows=[{Va:0,Vb:0},{Va:0,Vb:3.3},{Va:3.3,Vb:0},{Va:3.3,Vb:3.3}];
  return rows.map(r=>{
    const Vx=r.Va===0?3.3:0;
    const Vy=(Vx===3.3 && r.Vb===3.3)?0:3.3;
    return { Va:r.Va, Vb:r.Vb, Vx, Vy,
      closed:{ P0:r.Va===0, N0:r.Va===3.3, P1:Vx===0, P2:r.Vb===0, N1:Vx===3.3, N2:r.Vb===3.3 } };
  });
}
function tFmt(v){ return v===3.3?"3.3V":v===0?"0V":v; }

/* Render a column key like "Va"/"Vx"/"P0"/"N2" with a real <sub> suffix,
   matching the course's hand-drawn V_a / P_0 style table headers. A real
   <sub> element (rather than lookalike Unicode "subscript" letters, which
   don't exist for every letter and render inconsistently — some are actually
   superscript modifier letters, e.g. U+1D47, and some substitute a different
   glyph entirely, e.g. U+1D67 is Greek gamma, not a Latin y) keeps every
   column heading visually consistent. */
function tSubscriptLabel(key){
  return key.length>1 ? key[0]+"<sub>"+key.slice(1)+"</sub>" : key;
}

/* ============================================================
   Circuit schematic (fixed) — annotated with the stage's delays
   ============================================================ */
function renderTimingCircuit(){
  const svg = `
    <svg class="timing-circuit-svg" viewBox="0 0 580 400" role="img"
      aria-label="A CMOS inverter driven by Va produces Vx. Vx and Vb drive a CMOS NAND gate that produces Vy."
      xmlns="http://www.w3.org/2000/svg">

      <!-- Stage 1: CMOS inverter -->
      <line class="timing-circuit-wire" x1="130" y1="40" x2="170" y2="40"/>

      <line class="timing-circuit-wire" x1="150" y1="40" x2="150" y2="70"/>
      <path class="timing-circuit-trans" d="M150 70 V80 H142 V120 H150 V140"/>
      <line class="timing-circuit-trans" x1="128" y1="80" x2="128" y2="120"/>
      <circle class="timing-circuit-bubble" cx="122" cy="100" r="5"/>
      <text class="timing-circuit-label" x="162" y="105">P0</text>

      <path class="timing-circuit-trans" d="M150 140 V150 H142 V190 H150 V210"/>
      <line class="timing-circuit-trans" x1="128" y1="150" x2="128" y2="190"/>
      <text class="timing-circuit-label" x="162" y="175">N0</text>

      <line class="timing-circuit-wire" x1="48" y1="135" x2="90" y2="135"/>
      <circle class="timing-circuit-node" cx="90" cy="135" r="4"/>
      <line class="timing-circuit-wire" x1="90" y1="100" x2="90" y2="170"/>
      <line class="timing-circuit-wire" x1="90" y1="100" x2="117" y2="100"/>
      <line class="timing-circuit-wire" x1="90" y1="170" x2="128" y2="170"/>
      <text class="timing-circuit-net-label" x="12" y="143">V<tspan baseline-shift="sub" font-size="14">a</tspan></text>

      <circle class="timing-circuit-node" cx="150" cy="140" r="4.5"/>
      <line class="timing-circuit-wire" x1="150" y1="140" x2="260" y2="140"/>
      <text class="timing-circuit-net-label" x="205" y="128" text-anchor="middle">V<tspan baseline-shift="sub" font-size="14">x</tspan></text>

      <line class="timing-circuit-wire" x1="150" y1="210" x2="150" y2="238"/>
      <path class="timing-circuit-ground" d="M138 238 L162 238 L150 258 Z"/>

      <!-- Stage 2: CMOS NAND — P1/P2 in parallel (pull-up), N1/N2 in series (pull-down).
           P1 and P2 are separate parallel branches, so each gets its own independent
           VDD tick instead of a shared rail. -->
      <line class="timing-circuit-wire" x1="305" y1="40" x2="345" y2="40"/>

      <line class="timing-circuit-wire" x1="325" y1="40" x2="325" y2="70"/>
      <path class="timing-circuit-trans" d="M325 70 V80 H317 V120 H325 V140"/>
      <line class="timing-circuit-trans" x1="303" y1="80" x2="303" y2="120"/>
      <circle class="timing-circuit-bubble" cx="297" cy="100" r="5"/>
      <text class="timing-circuit-label" x="337" y="105">P1</text>

      <line class="timing-circuit-wire" x1="455" y1="40" x2="495" y2="40"/>
      <line class="timing-circuit-wire" x1="475" y1="40" x2="475" y2="70"/>
      <path class="timing-circuit-trans" d="M475 70 V80 H467 V120 H475 V140"/>
      <line class="timing-circuit-trans" x1="453" y1="80" x2="453" y2="120"/>
      <circle class="timing-circuit-bubble" cx="447" cy="100" r="5"/>
      <text class="timing-circuit-label" x="487" y="105">P2</text>
      <line class="timing-circuit-wire" x1="385" y1="100" x2="442" y2="100"/>
      <text class="timing-circuit-net-label" x="400" y="85">V<tspan baseline-shift="sub" font-size="14">b</tspan></text>

      <line class="timing-circuit-wire" x1="325" y1="140" x2="475" y2="140"/>
      <circle class="timing-circuit-node" cx="400" cy="140" r="4.5"/>
      <line class="timing-circuit-wire" x1="400" y1="140" x2="500" y2="140"/>
      <text class="timing-circuit-net-label" x="510" y="150">V<tspan baseline-shift="sub" font-size="14">y</tspan></text>

      <line class="timing-circuit-wire" x1="400" y1="140" x2="400" y2="170"/>
      <path class="timing-circuit-trans" d="M400 170 V180 H392 V220 H400 V240"/>
      <line class="timing-circuit-trans" x1="378" y1="180" x2="378" y2="220"/>
      <text class="timing-circuit-label" x="412" y="205">N1</text>

      <path class="timing-circuit-trans" d="M400 240 V250 H392 V290 H400 V310"/>
      <line class="timing-circuit-trans" x1="378" y1="250" x2="378" y2="290"/>
      <text class="timing-circuit-label" x="412" y="275">N2</text>

      <circle class="timing-circuit-node" cx="260" cy="140" r="4"/>
      <line class="timing-circuit-wire" x1="260" y1="100" x2="260" y2="200"/>
      <line class="timing-circuit-wire" x1="260" y1="100" x2="292" y2="100"/>
      <line class="timing-circuit-wire" x1="260" y1="200" x2="378" y2="200"/>
      <line class="timing-circuit-wire" x1="340" y1="270" x2="378" y2="270"/>
      <text class="timing-circuit-net-label" x="300" y="278">V<tspan baseline-shift="sub" font-size="14">b</tspan></text>

      <line class="timing-circuit-wire" x1="400" y1="310" x2="400" y2="338"/>
      <path class="timing-circuit-ground" d="M388 338 L412 338 L400 358 Z"/>
    </svg>
  `;
  const _c=tEl("timing-circuit"); if(_c) _c.innerHTML = svg;
}

/* ============================================================
   Build + stage plumbing
   ============================================================ */
function buildTiming(p){
  timing.p=p;
  timing.stage=0;
  timing.completed=new Set();
  timing.verdict=false;
  timing.dragging=false; timing.dragSig=null; timing.drawValue=null; timing.lastBin=null;

  timing.tbl=tTruthRows().map(()=>({marks:new Set(), V:{Vx:null,Vy:null}}));
  timing.draw={}; timing.expected={}; timing.undo={};
  TSTAGES.forEach(s=>{
    if(s.kind==="draw"){
      timing.draw[s.key]={Vx:Array(TN).fill(null), Vy:Array(TN).fill(null)};
      timing.expected[s.key]=tComputeWaves(s.model);
      timing.undo[s.key]=[];
    }
  });

  const clr=document.getElementById("timing-clear");
  if(clr) clr.onclick=()=>{
    const s=TSTAGES[timing.stage];
    if(s.kind!=="draw") return;
    tPushUndo(s.key);
    timing.draw[s.key].Vx.fill(null);
    timing.draw[s.key].Vy.fill(null);
    timing.verdict=false;
    timing.completed.delete(timing.stage);
    tShow("timing-feedback-card","none");
    timingRefresh();
  };

  const undoBtn=document.getElementById("timing-undo");
  if(undoBtn) undoBtn.onclick=timingUndo;

  timingRefresh();
  tShow("timing-feedback-card","none");
}

function timingRefresh(){
  const s=TSTAGES[timing.stage];
  tSetText("timing-stage-num", s.num);
  tSetText("timing-stage-title", s.title);
  tSetText("timing-stage-desc", s.desc);
  tSetHTML("timing-instruction", s.instr);
  const chips=document.getElementById("timing-delay-chips");
  if(chips){
    if(s.delays){ chips.innerHTML=s.delays.map(d=>`<span class="timing-delay-chip">${d}</span>`).join(""); chips.style.display=""; }
    else { chips.innerHTML=""; chips.style.display="none"; }
  }

  renderTimingStagebar();
  renderTimingCircuit();

  const tbl=document.getElementById("timing-table");
  const diag=document.getElementById("timing-diagram-wrap");
  const ref=document.getElementById("timing-tableref-col");
  if(s.kind==="table"){
    if(tbl) tbl.style.display="";
    if(diag) diag.style.display="none";
    if(ref) ref.style.display="none";
    renderTimingTable();
  } else {
    if(tbl) tbl.style.display="none";
    if(diag) diag.style.display="";
    if(ref) ref.style.display="";
    renderTimingDiagram();
    renderTimingTableRef();
  }

  timingRenderActions();
  timingUpdateCardState();
  timingUpdateUndoButton();
}
function tSetText(id,t){ const e=document.getElementById(id); if(e) e.textContent=t; }
function tSetHTML(id,h){ const e=document.getElementById(id); if(e) e.innerHTML=h; }
function tEl(id){ return document.getElementById(id); }
function tShow(id,disp){ const e=tEl(id); if(e) e.style.display=disp; }

function renderTimingStagebar(){
  const host=document.getElementById("timing-stagebar");
  if(!host) return;
  const dots=TSTAGES.map((s,i)=>{
    const done=timing.completed.has(i), cur=i===timing.stage;
    return `<span class="t-step${done?" done":""}${cur?" current":""}">${done && !cur ? "\u2713" : s.key}</span>`;
  }).join("");
  const dev = (DEV_MODE && timing.stage!==TSTAGES.length-1)
    ? `<button type="button" class="dev-skip-link" onclick="timingGoStage(${TSTAGES.length-1})">Dev: skip to last stage &rarr;</button>` : "";
  host.innerHTML=`<div class="t-stepbar">${dots}</div>${dev}
    <button class="sw-reset-link" id="timing-reset-link" type="button">Reset problem</button>`;
  const rb=document.getElementById("timing-reset-link");
  if(rb) rb.onclick=timingReset;
}

function timingUpdateCardState(){
  const card=document.getElementById("timing-main-card");
  if(card) card.classList.toggle("is-correct", timing.completed.has(timing.stage));
}

function timingRenderActions(){
  const host=document.getElementById("timing-actions");
  if(!host) return;
  const N=TSTAGES.length, s=timing.stage;
  const solved=timing.completed.has(s);
  const isLast=s===N-1;
  const back = s>0 ? `<button class="btn ghost" type="button" onclick="timingPrev()">&larr; Previous</button>` : "";
  let html;
  if(!solved){
    html=`<button class="btn" type="button" onclick="timingCheck()">Submit ${TSTAGES[s].kind==="table"?"table":"diagram"}</button>${back}`;
  } else if(isLast){
    html=`<button class="btn" type="button" onclick="timingExploreMoreProblems()">Explore more problems &rarr;</button>${back}`;
  } else {
    html=`<button class="btn" type="button" onclick="timingNext()">Next stage &rarr;</button>${back}`;
  }
  host.innerHTML=html;
}

function timingGoStage(i){
  i=Math.max(0,Math.min(TSTAGES.length-1,i));
  timing.stage=i;
  timing.verdict=false;
  timing.dragging=false; timing.dragSig=null;
  tShow("timing-feedback-card","none");
  timingRefresh();
}
function timingPrev(){ if(timing.stage>0) timingGoStage(timing.stage-1); }
function timingNext(){ if(timing.completed.has(timing.stage) && timing.stage<TSTAGES.length-1) timingGoStage(timing.stage+1); }
function timingExploreMoreProblems(){ const b=document.getElementById("crumb-back-chapter"); if(b) b.click(); }

/* Per-stage undo history for the drawing stages: one snapshot of both rows
   per gesture (a single click, or a whole drag stroke), pushed once before
   the gesture's first edit so "Undo" reverts the whole stroke at once. */
function tPushUndo(key){
  const stack=timing.undo[key] || (timing.undo[key]=[]);
  stack.push({Vx:timing.draw[key].Vx.slice(), Vy:timing.draw[key].Vy.slice()});
  if(stack.length>100) stack.shift();
  timingUpdateUndoButton();
}
function timingUndo(){
  const s=TSTAGES[timing.stage];
  if(s.kind!=="draw") return;
  const stack=timing.undo[s.key];
  if(!stack || !stack.length) return;
  timing.draw[s.key]=stack.pop();
  timing.verdict=false;
  timing.completed.delete(timing.stage);
  tShow("timing-feedback-card","none");
  renderTimingDiagram();
  timingRenderActions();
  timingUpdateCardState();
  timingUpdateUndoButton();
}
function timingUpdateUndoButton(){
  const btn=document.getElementById("timing-undo");
  if(!btn) return;
  const s=TSTAGES[timing.stage];
  const stack=s.kind==="draw" ? timing.undo[s.key] : null;
  btn.disabled = !stack || !stack.length;
}

/* ============================================================
   Stage A — truth table
   ============================================================ */
function renderTimingTable(){
  const truth=tTruthRows();
  let html=`<table class="simtable"><thead><tr>`;
  TCOLS.forEach(c=>{
    const cls=c.kind==="in"?"grp-in":c.kind==="node"?"grp-node":(c.key[0]==="P"?"grp-p":"grp-n");
    const lbl=tSubscriptLabel(c.key);
    html+=`<th class="${cls}">${lbl}</th>`;
  });
  html+=`</tr></thead><tbody>`;
  truth.forEach((row,ri)=>{
    html+=`<tr>`;
    TCOLS.forEach(c=>{
      if(c.kind==="in"){
        html+=`<td class="given">${tFmt(row[c.key])}</td>`;
      } else if(c.kind==="node"){
        const val=timing.tbl[ri].V[c.key];
        let cls="vy";
        if(timing.verdict) cls+= (val===null?"":(val===row[c.key]?" mark-good":" mark-bad"));
        html+=`<td class="${cls}" data-ri="${ri}" data-col="${c.key}" data-node="1">${val===null?"":tFmt(val)}</td>`;
      } else {
        const marked=timing.tbl[ri].marks.has(c.key);
        let cls="tcell"+(marked?" c":"");
        if(timing.verdict) cls+= (marked===row.closed[c.key]?" mark-good":" mark-bad");
        html+=`<td class="${cls}" data-ri="${ri}" data-col="${c.key}">${marked?"C":""}</td>`;
      }
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table>`;
  const host=document.getElementById("timing-table");
  if(!host) return;
  host.innerHTML=html;

  host.querySelectorAll("td.tcell").forEach(td=>td.addEventListener("click",()=>{
    const ri=+td.dataset.ri, key=td.dataset.col, marks=timing.tbl[ri].marks;
    marks.has(key)?marks.delete(key):marks.add(key);
    timingInvalidate();
    renderTimingTable();
  }));
  host.querySelectorAll("td[data-node]").forEach(td=>td.addEventListener("click",()=>{
    const ri=+td.dataset.ri, key=td.dataset.col, cur=timing.tbl[ri].V[key];
    timing.tbl[ri].V[key]= cur===null?0 : cur===0?3.3 : null;
    timingInvalidate();
    renderTimingTable();
  }));
}

/* Read-only reference copy of the stage-A truth table, shown in the sidebar
   during the drawing stages (B–E) so students can check the circuit's
   logical behaviour without leaving the diagram. Always shows the correct
   answer — no student state, no click handlers. */
function renderTimingTableRef(){
  const host=document.getElementById("timing-table-ref");
  if(!host) return;
  const truth=tTruthRows();
  let html=`<table class="simtable"><thead><tr>`;
  TCOLS.forEach(c=>{
    const cls=c.kind==="in"?"grp-in":c.kind==="node"?"grp-node":(c.key[0]==="P"?"grp-p":"grp-n");
    html+=`<th class="${cls}">${tSubscriptLabel(c.key)}</th>`;
  });
  html+=`</tr></thead><tbody>`;
  truth.forEach(row=>{
    html+=`<tr>`;
    TCOLS.forEach(c=>{
      if(c.kind==="in" || c.kind==="node"){
        html+=`<td>${tFmt(row[c.key])}</td>`;
      } else {
        html+=`<td class="${row.closed[c.key]?"tcell c":"tcell"}">${row.closed[c.key]?"C":""}</td>`;
      }
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table>`;
  host.innerHTML=html;
}

/* invalidate the current stage's verdict on any edit */
function timingInvalidate(){
  timing.verdict=false;
  timing.completed.delete(timing.stage);
  tShow("timing-feedback-card","none");
  timingRenderActions();
  timingUpdateCardState();
}

/* ============================================================
   Stages B–E — timing diagram (draw Vx and Vy)
   ============================================================ */
const TSIGNALS=["Va","Vx","Vb","Vy"];
const TGIVEN={Va:TVA, Vb:TVB};
const TDRAWABLE=["Vx","Vy"];

function timingPath(bins,left,hi,lo,binW){
  const slant=Math.min(9,binW*0.35);
  let d="",started=false,prevY=null;
  for(let i=0;i<bins.length;i++){
    const v=bins[i];
    if(v===null){ started=false; prevY=null; continue; }
    const y=v?hi:lo, x0=left+i*binW, x1=left+(i+1)*binW;
    if(!started){ d+=`M ${x0} ${y}`; started=true; }
    else if(prevY!==null && prevY!==y){ d+=` L ${x0+slant} ${y}`; }
    d+=` L ${x1} ${y}`;
    prevY=y;
  }
  return d;
}

function renderTimingDiagram(){
  const s=TSTAGES[timing.stage];
  const draw=timing.draw[s.key], expected=timing.expected[s.key];
  const W=760,left=94,right=24,top=16;
  const plotW=W-left-right, binW=plotW/TN;
  // Every vertical band in the diagram is sized off the same square cell
  // (one bin's width): a signal's own hi/lo swing is exactly one cell tall,
  // and the gap to the next signal is exactly one more cell, so no band
  // (whether it's "inside" a signal or "between" two signals) is ever a
  // different height than any other.
  const cell=binW, rowSwing=cell, rowGap=cell, rowPitch=rowSwing+rowGap;
  const plotBottom=top+rowPitch*(TSIGNALS.length-1)+rowSwing;
  const H=plotBottom+40;

  const geom={};
  TSIGNALS.forEach((name,ri)=>{ const y0=top+ri*rowPitch; geom[name]={y0,hi:y0,lo:y0+rowSwing,mid:y0+rowSwing/2}; });

  let svg=`<svg class="timing-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  for(let i=0;i<=TN;i++){
    const x=left+i*binW;
    svg+=`<line class="timing-grid" x1="${x}" y1="${top}" x2="${x}" y2="${plotBottom}"/>`;
  }
  svg+=`<line class="timing-axis" x1="${left}" y1="${top}" x2="${left}" y2="${plotBottom}"/>`;

  TSIGNALS.forEach((name)=>{
    const g=geom[name];
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.hi}" x2="${W-right}" y2="${g.hi}"/>`;
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.lo}" x2="${W-right}" y2="${g.lo}"/>`;
    svg+=`<text class="timing-label" x="${left-52}" y="${g.mid+4}">V<tspan baseline-shift="sub" font-size="9">${name[1]}</tspan></text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${g.hi+3}" text-anchor="end">3.3V</text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${g.lo+3}" text-anchor="end">0V</text>`;

    if(TGIVEN[name]){
      svg+=`<path class="timing-wave-given" d="${timingPath(TGIVEN[name],left,g.hi,g.lo,binW)}"/>`;
    } else {
      if(timing.verdict){
        svg+=`<path class="timing-wave-expected" d="${timingPath(expected[name],left,g.hi,g.lo,binW)}"/>`;
      }
      svg+=`<path class="timing-wave-answer" id="ans-${name}" d="${timingPath(draw[name],left,g.hi,g.lo,binW)}"/>`;
      svg+=`<path class="timing-hover-preview" id="prev-${name}" d=""/>`;
      svg+=`<circle class="timing-hover-dot" id="dot-${name}" cx="0" cy="0" r="4" style="display:none"/>`;
      svg+=`<line class="timing-erase-edge" id="erase-${name}" x1="0" y1="0" x2="0" y2="0" style="display:none"/>`;
      svg+=`<rect class="timing-hit" id="hit-${name}" data-sig="${name}" x="${left}" y="${g.y0}" width="${plotW}" height="${rowSwing}"/>`;
    }
  });

  for(let t=20;t<TDUR;t+=20){
    const x=left+(t/TDUR)*plotW;
    svg+=`<text class="timing-small" x="${x}" y="${plotBottom+20}" text-anchor="middle">${t}ps</text>`;
  }
  svg+=`<line class="timing-axis" x1="${left}" y1="${plotBottom+4}" x2="${W-right}" y2="${plotBottom+4}"/>`;
  svg+=`<text class="timing-small" x="${W-right}" y="${plotBottom+20}" text-anchor="end">time</text>`;
  svg+=`</svg>`;

  const host=document.getElementById("timing-canvas");
  if(!host) return;
  host.innerHTML=svg;
  const svgEl=host.querySelector("svg");
  if(!svgEl) return;

  function clientToSvg(e){
    const pt=svgEl.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  const EDGE_ZONE=0.22; // fraction of a bin's width, on either side, that erases instead of draws
  const ERASE_CURSOR=`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='10' cy='10' r='9' fill='%23d0343a' stroke='white' stroke-width='1.5'/><path d='M6 6L14 14M14 6L6 14' stroke='white' stroke-width='2' stroke-linecap='round'/></svg>") 10 10, pointer`;

  TDRAWABLE.forEach(sig=>{
    const g=geom[sig], arr=draw[sig];
    const hit=document.getElementById("hit-"+sig);
    const ans=document.getElementById("ans-"+sig);
    const prev=document.getElementById("prev-"+sig);
    const dot=document.getElementById("dot-"+sig);
    const erase=document.getElementById("erase-"+sig);
    if(!hit) return;

    const loc=e=>{
      const pt=clientToSvg(e);
      const rel=(pt.x-left)/binW;
      const bin=Math.max(0,Math.min(TN-1,Math.floor(rel)));
      const frac=rel-bin;
      const val=pt.y<g.mid?1:0;
      const edge=(frac<EDGE_ZONE || frac>1-EDGE_ZONE) && arr[bin]!=null;
      return {bin,val,edge};
    };
    const refresh=()=>ans.setAttribute("d",timingPath(arr,left,g.hi,g.lo,binW));
    const showPrev=l=>{
      if(timing.dragging) return;
      if(l.edge){
        prev.setAttribute("d",""); dot.style.display="none";
        // Highlight the bin's own drawn segment (same y as its current level),
        // right on top of the line that would be deleted.
        const y=arr[l.bin]?g.hi:g.lo, x0=left+l.bin*binW, x1=left+(l.bin+1)*binW;
        erase.setAttribute("x1",x0); erase.setAttribute("x2",x1);
        erase.setAttribute("y1",y); erase.setAttribute("y2",y);
        erase.style.display="";
        hit.style.cursor=ERASE_CURSOR;
      } else {
        erase.style.display="none";
        hit.style.cursor="";
        const y=l.val?g.hi:g.lo, x0=left+l.bin*binW+3, x1=left+(l.bin+1)*binW-3;
        prev.setAttribute("d",`M ${x0} ${y} L ${x1} ${y}`);
        dot.setAttribute("cx",(x0+x1)/2); dot.setAttribute("cy",y); dot.style.display="";
      }
    };
    const hidePrev=()=>{ prev.setAttribute("d",""); dot.style.display="none"; erase.style.display="none"; hit.style.cursor=""; };
    const paint=(a,b,val)=>{ const lo=Math.min(a,b),hi=Math.max(a,b); for(let i=lo;i<=hi;i++) arr[i]=val; timing.verdict=false; timing.completed.delete(timing.stage); tShow("timing-feedback-card","none"); refresh(); timingRenderActions(); timingUpdateCardState(); };

    hit.addEventListener("pointermove",e=>{
      const l=loc(e);
      if(timing.dragging && timing.dragSig===sig){
        if(l.bin!==timing.lastBin){ paint(timing.lastBin,l.bin,timing.drawValue); timing.lastBin=l.bin; }
      } else if(!timing.dragging){ showPrev(l); }
    });
    hit.addEventListener("pointerenter",e=>{ if(!timing.dragging) showPrev(loc(e)); });
    hit.addEventListener("pointerleave",()=>{ if(!timing.dragging) hidePrev(); });
    hit.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.preventDefault();
      const l=loc(e);
      const val = l.edge ? null : l.val;
      tPushUndo(s.key);
      timing.dragging=true; timing.dragSig=sig; timing.drawValue=val; timing.lastBin=l.bin;
      hidePrev(); paint(l.bin,l.bin,val);
      try{ hit.setPointerCapture(e.pointerId); }catch(err){}
    });
    hit.addEventListener("pointerup",e=>{
      if(!timing.dragging) return;
      timing.dragging=false; timing.dragSig=null; timing.drawValue=null; timing.lastBin=null;
      try{ hit.releasePointerCapture(e.pointerId); }catch(err){}
      showPrev(loc(e));
    });
    hit.addEventListener("pointercancel",()=>{ timing.dragging=false; timing.dragSig=null; hidePrev(); });
  });
}

/* ============================================================
   Check + feedback
   ============================================================ */
function timingCheck(){
  const s=TSTAGES[timing.stage];
  const msgs=[];
  let correct=false;

  if(s.kind==="table"){
    const truth=tTruthRows();
    let wrong=0, missing=0;
    truth.forEach((row,ri)=>{
      ["P0","N0","P1","P2","N1","N2"].forEach(k=>{ if(timing.tbl[ri].marks.has(k)!==row.closed[k]) wrong++; });
      ["Vx","Vy"].forEach(k=>{ const v=timing.tbl[ri].V[k]; if(v===null) missing++; else if(v!==row[k]) wrong++; });
    });
    if(missing) msgs.push({s:"info",tag:"Note",t:`Set the remaining ${missing} node-voltage cell${missing===1?"":"s"} before submitting.`});
    if(wrong){ msgs.push({s:"warn",tag:"Nudge",t:`${wrong} cell${wrong===1?" doesn't":"s don't"} match the circuit — the mismatches are outlined in red.`}); timing.verdict=true; }
    correct = !wrong && !missing;
  } else {
    const draw=timing.draw[s.key], expected=timing.expected[s.key];
    let wrong=0, missing=0;
    TDRAWABLE.forEach(sig=>{
      for(let i=0;i<TN;i++){ const v=draw[sig][i]; if(v===null) missing++; else if(v!==expected[sig][i]) wrong++; }
    });
    if(missing) msgs.push({s:"info",tag:"Note",t:`Draw the remaining ${missing} interval${missing===1?"":"s"} across V\u2093 and V\u1d67 first.`});
    if(wrong){ msgs.push({s:"warn",tag:"Nudge",t:`${wrong} interval${wrong===1?" doesn't":"s don't"} match the circuit. The dashed green trace shows the expected waveform.`}); timing.verdict=true; }
    correct = !wrong && !missing;
  }

  if(correct){
    timing.verdict=false;
    timing.completed.add(timing.stage);
    if(timing.completed.size===TSTAGES.length){
      msgs.push({s:"success",tag:"Correct",t:"Correct — and that was the final stage. You've worked through the whole circuit."});
    } else {
      msgs.push({s:"success",tag:"Correct",t:`Correct. Use <b>Next stage</b> to continue.`});
    }
  } else {
    timing.completed.delete(timing.stage);
  }

  const host=document.getElementById("timing-feedback");
  if(host){ host.innerHTML=""; }
  if(host) msgs.forEach(mo=>{ const d=document.createElement("div"); d.className="msg "+mo.s; d.innerHTML=`<span class="mtag">${mo.tag}</span>${mo.t}`; host.appendChild(d); });
  tShow("timing-feedback-card","block");

  timingRefresh();
}

function timingReset(){ buildTiming(timing.p); }
