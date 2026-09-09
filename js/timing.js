/* ============================================================
   TIMING DIAGRAM PROBLEM TYPE  —  5-stage guided problem
   for the fixed inverter (Va→Vx) → NOR (Vx,Vb→Vy) circuit.

   Stage A : complete the logic truth table
   Stage B : draw Vx, Vy — zero-delay model
   Stage C : draw Vx, Vy — constant delay (t_inv, t_nor)
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
  dragging:false, dragSig:null, drawValue:null, lastBin:null
};

/* -- fixed model of the circuit -- */
const TSTEP=10, TDUR=160, TN=TDUR/TSTEP;                 // 16 bins of 10 ps
const TVA=[0,0,0,1,1,1,1,1,0,0,0,0,1,1,1,1];             // rises 30, falls 80, rises 120
const TVB=[1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0];             // falls 40
const TDELAY={ inv:10, nor:20, ax:10, by:20, xy:10,
               ax_hl:10, ax_lh:20, by_hl:20, by_lh:30, xy_hl:10, xy_lh:30 };

const TCOLS=[
  {key:"Va",kind:"in"},{key:"P0",kind:"trans"},{key:"N0",kind:"trans"},{key:"Vx",kind:"node"},
  {key:"Vb",kind:"in"},{key:"P1",kind:"trans"},{key:"P2",kind:"trans"},{key:"N1",kind:"trans"},{key:"N2",kind:"trans"},{key:"Vy",kind:"node"}
];

const TSTAGES=[
  { key:"A", kind:"table", num:"6.A", title:"Logic behaviour",
    desc:"Get to know the circuit by completing its truth table.",
    instr:"As a first step, complete the table to get to know the logical behaviour of this circuit. Label closed transistors with <b>C</b> and leave cells of open transistors empty.",
    model:null,
    modelText:"Read each node from the switches: a <b>PMOS</b> conducts when its gate is <b>0&nbsp;V</b>; an <b>NMOS</b> conducts when its gate is <b>3.3&nbsp;V</b>." },
  { key:"B", kind:"draw", model:"zero", num:"6.B", title:"Timing diagram — zero-delay model",
    desc:"Draw V\u2093 and V\u1d67 assuming no gate delay.",
    instr:"Complete the timing diagram for a <b>zero-delay model</b>. Remember from Topic 1 that voltages change <i>continuously</i> between levels — they never jump instantly from one level to the other.",
    modelText:"Zero-delay model. Output changes occur immediately when the logical inputs change." },
  { key:"C", kind:"draw", model:"const", num:"6.C", title:"Timing diagram — constant-delay model",
    desc:"Draw V\u2093 and V\u1d67 with a fixed gate delay.",
    instr:"Complete the timing diagram for a <b>constant-delay model</b>. Use a delay of t<sub>inv</sub>&nbsp;=&nbsp;10&nbsp;ps for the inverter and t<sub>nor</sub>&nbsp;=&nbsp;20&nbsp;ps for the NOR gate.",
    modelText:"Constant delay.<br>Inverter: <b>10 ps</b><br>NOR: <b>20 ps</b>" },
  { key:"D", kind:"draw", model:"inputdep", num:"6.D", title:"Timing diagram — input-dependent constant delay",
    desc:"Draw V\u2093 and V\u1d67 with per-path delays.",
    instr:"Complete the timing diagram for an <b>input-dependent constant-delay model</b>. Use t<sub>a\u2192x</sub>&nbsp;=&nbsp;10&nbsp;ps; t<sub>b\u2192y</sub>&nbsp;=&nbsp;20&nbsp;ps; t<sub>x\u2192y</sub>&nbsp;=&nbsp;10&nbsp;ps.",
    modelText:"Input-dependent delay.<br>a\u2192x: <b>10 ps</b><br>b\u2192y: <b>20 ps</b><br>x\u2192y: <b>10 ps</b>" },
  { key:"E", kind:"draw", model:"trans", num:"6.E", title:"Timing diagram — transition- & input-dependent delay",
    desc:"Draw V\u2093 and V\u1d67 with per-path, per-edge delays.",
    instr:"Complete the timing diagram for a <b>transition- and input-dependent delay model</b>. The delay depends on the direction of the resulting output edge: t<sub>a\u2192x,hl</sub>=10, t<sub>a\u2192x,lh</sub>=20, t<sub>b\u2192y,hl</sub>=20, t<sub>b\u2192y,lh</sub>=30, t<sub>x\u2192y,hl</sub>=10, t<sub>x\u2192y,lh</sub>=30&nbsp;ps.",
    modelText:"Transition- & input-dependent.<br>a\u2192x: 10 / 20 ps (hl / lh)<br>b\u2192y: 20 / 30 ps<br>x\u2192y: 10 / 30 ps" }
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
function tNor(a,b){ return (a===0 && b===0) ? 1 : 0; }

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
  if(model==="const") return TDELAY.nor;
  if(model==="inputdep") return path==="x"?TDELAY.xy:TDELAY.by;
  if(path==="x") return dir==="lh"?TDELAY.xy_lh:TDELAY.xy_hl;
  return dir==="lh"?TDELAY.by_lh:TDELAY.by_hl;
}
/* Vy = NOR(Vx, Vb), each output edge delayed by the path + direction that
   caused it. Simultaneous causes: a rising NOR (needs both inputs low) waits
   for the slower path; a falling NOR (either input high) follows the faster. */
function tComputeVy(model,vxBins){
  const ev=[];
  tEdges(vxBins).slice(1).forEach(e=>ev.push({t:e.t,path:"x",v:e.v}));
  tEdges(TVB).slice(1).forEach(e=>ev.push({t:e.t,path:"b",v:e.v}));
  ev.sort((a,b)=>a.t-b.t);
  let curVx=vxBins[0], curVb=TVB[0], ideal=tNor(curVx,curVb);
  const edges=[{t:0,v:ideal}];
  let i=0;
  while(i<ev.length){
    const t=ev[i].t, group=[];
    while(i<ev.length && ev[i].t===t){ group.push(ev[i]); i++; }
    const before=ideal;
    group.forEach(e=>{ if(e.path==="x") curVx=e.v; else curVb=e.v; });
    const after=tNor(curVx,curVb);
    if(after!==before){
      const dir=after?"lh":"hl";
      const ds=group.map(e=>tDelayVy(model,e.path,dir));
      const d = after===1 ? Math.max(...ds) : Math.min(...ds);
      edges.push({t:t+d, v:after});
      ideal=after;
    } else ideal=after;
  }
  return tBins(edges,TN);
}
function tComputeWaves(model){ const Vx=tComputeVx(model); return {Vx, Vy:tComputeVy(model,Vx)}; }

/* Stage-A truth: closed switches + node voltages per input row. */
function tTruthRows(){
  const rows=[{Va:0,Vb:0},{Va:0,Vb:3.3},{Va:3.3,Vb:0},{Va:3.3,Vb:3.3}];
  return rows.map(r=>{
    const Vx=r.Va===0?3.3:0;
    const Vy=(Vx===0 && r.Vb===0)?3.3:0;
    return { Va:r.Va, Vb:r.Vb, Vx, Vy,
      closed:{ P0:r.Va===0, N0:r.Va===3.3, P1:Vx===0, P2:r.Vb===0, N1:Vx===3.3, N2:r.Vb===3.3 } };
  });
}
function tFmt(v){ return v===3.3?"3.3V":v===0?"0V":v; }

/* ============================================================
   Circuit schematic (fixed) — annotated with the stage's delays
   ============================================================ */
function renderTimingCircuit(){
  const s=TSTAGES[timing.stage];
  const showConst = s && s.model==="const";
  const invDelay = showConst?TDELAY.inv:null;
  const norDelay = showConst?TDELAY.nor:null;

  const svg = `
    <svg class="timing-circuit-svg" viewBox="0 0 760 300" role="img"
      aria-label="A CMOS inverter driven by Va produces Vx. Vx and Vb drive a CMOS NOR gate that produces Vy."
      xmlns="http://www.w3.org/2000/svg">

      <!-- Stage 1: CMOS inverter -->
      <line class="timing-circuit-wire" x1="88" y1="30" x2="272" y2="30"/>
      <text class="timing-circuit-label" x="94" y="20">VDD</text>

      <line class="timing-circuit-wire" x1="180" y1="30" x2="180" y2="60"/>
      <path class="timing-circuit-trans" d="M180 60 V66 H175 V96 H180 V125"/>
      <line class="timing-circuit-trans" x1="164" y1="66" x2="164" y2="96"/>
      <line class="timing-circuit-wire" x1="112" y1="81" x2="155" y2="81"/>
      <circle class="timing-circuit-bubble" cx="160" cy="81" r="4"/>
      <text class="timing-circuit-label" x="190" y="80">P0</text>

      <path class="timing-circuit-trans" d="M180 125 V148 H175 V178 H180 V220"/>
      <line class="timing-circuit-trans" x1="164" y1="148" x2="164" y2="178"/>
      <line class="timing-circuit-wire" x1="112" y1="163" x2="164" y2="163"/>
      <text class="timing-circuit-label" x="190" y="162">N0</text>

      <line class="timing-circuit-wire" x1="68" y1="122" x2="112" y2="122"/>
      <line class="timing-circuit-wire" x1="112" y1="81" x2="112" y2="163"/>
      <text class="timing-circuit-label" x="40" y="126">V<tspan baseline-shift="sub" font-size="9">a</tspan></text>

      <circle class="timing-circuit-node" cx="180" cy="125" r="3.7"/>
      <line class="timing-circuit-wire" x1="180" y1="125" x2="360" y2="125"/>
      <text class="timing-circuit-label" x="236" y="115">V<tspan baseline-shift="sub" font-size="9">x</tspan></text>

      <!-- Vx branches directly to the P1 and N1 gates -->
      <circle class="timing-circuit-node" cx="360" cy="125" r="3.2"/>
      <line class="timing-circuit-wire" x1="360" y1="75" x2="360" y2="203"/>
      <line class="timing-circuit-wire" x1="360" y1="75" x2="515" y2="75"/>
      <line class="timing-circuit-wire" x1="360" y1="203" x2="464" y2="203"/>

      <line class="timing-circuit-wire" x1="180" y1="220" x2="180" y2="232"/>
      <line class="timing-circuit-wire" x1="158" y1="232" x2="202" y2="232"/>
      <line class="timing-circuit-wire" x1="164" y1="240" x2="196" y2="240"/>
      <line class="timing-circuit-wire" x1="171" y1="248" x2="189" y2="248"/>
      ${invDelay!=null ? `<text class="timing-circuit-delay" x="138" y="276">t_inv = ${invDelay} ps</text>` : ""}

      <!-- Stage 2: CMOS NOR -->
      <line class="timing-circuit-wire" x1="398" y1="30" x2="680" y2="30"/>
      <text class="timing-circuit-label" x="646" y="20">VDD</text>

      <line class="timing-circuit-wire" x1="540" y1="30" x2="540" y2="56"/>
      <path class="timing-circuit-trans" d="M540 56 V62 H535 V88 H540 V104"/>
      <line class="timing-circuit-trans" x1="524" y1="62" x2="524" y2="88"/>
      <circle class="timing-circuit-bubble" cx="520" cy="75" r="4"/>
      <text class="timing-circuit-label" x="552" y="76">P1</text>

      <path class="timing-circuit-trans" d="M540 104 V112 H535 V138 H540 V166"/>
      <line class="timing-circuit-trans" x1="524" y1="112" x2="524" y2="138"/>
      <line class="timing-circuit-wire" x1="466" y1="125" x2="515" y2="125"/>
      <circle class="timing-circuit-bubble" cx="520" cy="125" r="4"/>
      <text class="timing-circuit-label" x="552" y="126">P2</text>
      <text class="timing-circuit-label" x="438" y="129">V<tspan baseline-shift="sub" font-size="9">b</tspan></text>

      <circle class="timing-circuit-node" cx="540" cy="166" r="3.7"/>
      <line class="timing-circuit-wire" x1="540" y1="166" x2="696" y2="166"/>
      <text class="timing-circuit-label" x="706" y="170">V<tspan baseline-shift="sub" font-size="9">y</tspan></text>

      <line class="timing-circuit-wire" x1="480" y1="166" x2="600" y2="166"/>
      <line class="timing-circuit-wire" x1="480" y1="166" x2="480" y2="184"/>
      <path class="timing-circuit-trans" d="M480 184 V190 H475 V216 H480 V232"/>
      <line class="timing-circuit-trans" x1="464" y1="190" x2="464" y2="216"/>
      <text class="timing-circuit-label" x="490" y="204">N1</text>

      <line class="timing-circuit-wire" x1="600" y1="166" x2="600" y2="184"/>
      <path class="timing-circuit-trans" d="M600 184 V190 H595 V216 H600 V232"/>
      <line class="timing-circuit-trans" x1="584" y1="190" x2="584" y2="216"/>
      <line class="timing-circuit-wire" x1="536" y1="203" x2="584" y2="203"/>
      <text class="timing-circuit-label" x="508" y="207">V<tspan baseline-shift="sub" font-size="9">b</tspan></text>
      <text class="timing-circuit-label" x="610" y="204">N2</text>

      <line class="timing-circuit-wire" x1="480" y1="232" x2="600" y2="232"/>
      <line class="timing-circuit-wire" x1="540" y1="232" x2="540" y2="244"/>
      <line class="timing-circuit-wire" x1="518" y1="244" x2="562" y2="244"/>
      <line class="timing-circuit-wire" x1="524" y1="252" x2="556" y2="252"/>
      <line class="timing-circuit-wire" x1="531" y1="260" x2="549" y2="260"/>
      ${norDelay!=null ? `<text class="timing-circuit-delay" x="500" y="286">t_nor = ${norDelay} ps</text>` : ""}
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
  timing.draw={}; timing.expected={};
  TSTAGES.forEach(s=>{
    if(s.kind==="draw"){
      timing.draw[s.key]={Vx:Array(TN).fill(null), Vy:Array(TN).fill(null)};
      timing.expected[s.key]=tComputeWaves(s.model);
    }
  });

  const clr=document.getElementById("timing-clear");
  if(clr) clr.onclick=()=>{
    const s=TSTAGES[timing.stage];
    if(s.kind!=="draw") return;
    timing.draw[s.key].Vx.fill(null);
    timing.draw[s.key].Vy.fill(null);
    timing.verdict=false;
    timing.completed.delete(timing.stage);
    tShow("timing-feedback-card","none");
    timingRefresh();
  };

  timingRefresh();
  tShow("timing-feedback-card","none");
}

function timingRefresh(){
  const s=TSTAGES[timing.stage];
  tSetText("timing-stage-num", s.num);
  tSetText("timing-stage-title", s.title);
  tSetText("timing-stage-desc", s.desc);
  tSetHTML("timing-instruction", s.instr);
  tSetHTML("timing-model-text", s.modelText);

  renderTimingStagebar();
  renderTimingCircuit();

  const tbl=document.getElementById("timing-table");
  const diag=document.getElementById("timing-diagram-wrap");
  if(s.kind==="table"){
    if(tbl) tbl.style.display="";
    if(diag) diag.style.display="none";
    renderTimingTable();
  } else {
    if(tbl) tbl.style.display="none";
    if(diag) diag.style.display="";
    renderTimingDiagram();
  }

  timingRenderActions();
  timingUpdateCardState();
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
  host.innerHTML=`<div class="t-stepbar">${dots}</div>
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

/* ============================================================
   Stage A — truth table
   ============================================================ */
function renderTimingTable(){
  const truth=tTruthRows();
  let html=`<table class="simtable"><thead><tr>`;
  TCOLS.forEach(c=>{
    const cls=c.kind==="in"?"grp-in":(c.key[0]==="P"?"grp-p":(c.key[0]==="N"?"grp-n":""));
    const lbl=c.key.replace(/^V([axyb])$/,(m,g)=>"V"+({a:"\u2090",x:"\u2093",b:"\u1d47",y:"\u1d67"}[g]||g));
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

function timingPath(bins,left,y0,rowH,binW){
  const hi=y0+10, lo=y0+rowH-10, slant=Math.min(9,binW*0.35);
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
  const W=760,left=94,right=24,top=16,rowH=62;
  const plotW=W-left-right, binW=plotW/TN;
  const H=top+rowH*TSIGNALS.length+40;

  const geom={};
  TSIGNALS.forEach((name,ri)=>{ const y0=top+ri*rowH; geom[name]={y0,hi:y0+10,lo:y0+rowH-10,mid:y0+rowH/2}; });

  let svg=`<svg class="timing-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  for(let i=0;i<=TN;i++){
    const x=left+i*binW;
    svg+=`<line class="timing-grid" x1="${x}" y1="${top}" x2="${x}" y2="${top+rowH*TSIGNALS.length}"/>`;
  }

  TSIGNALS.forEach((name)=>{
    const g=geom[name];
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.hi}" x2="${W-right}" y2="${g.hi}"/>`;
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.lo}" x2="${W-right}" y2="${g.lo}"/>`;
    const lbl="V"+({Va:"\u2090",Vx:"\u2093",Vb:"\u1d47",Vy:"\u1d67"}[name]||"");
    svg+=`<text class="timing-label" x="${left-52}" y="${g.mid+4}">${lbl}</text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${g.hi+3}" text-anchor="end">3.3V</text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${g.lo+3}" text-anchor="end">0V</text>`;

    if(TGIVEN[name]){
      svg+=`<path class="timing-wave-given" d="${timingPath(TGIVEN[name],left,g.y0,rowH,binW)}"/>`;
    } else {
      if(timing.verdict){
        svg+=`<path class="timing-wave-expected" d="${timingPath(expected[name],left,g.y0,rowH,binW)}"/>`;
      }
      svg+=`<path class="timing-wave-answer" id="ans-${name}" d="${timingPath(draw[name],left,g.y0,rowH,binW)}"/>`;
      svg+=`<path class="timing-hover-preview" id="prev-${name}" d=""/>`;
      svg+=`<circle class="timing-hover-dot" id="dot-${name}" cx="0" cy="0" r="4" style="display:none"/>`;
      svg+=`<rect class="timing-hit" id="hit-${name}" data-sig="${name}" x="${left}" y="${g.y0}" width="${plotW}" height="${rowH}"/>`;
    }
  });

  for(let t=20;t<TDUR;t+=20){
    const x=left+(t/TDUR)*plotW;
    svg+=`<text class="timing-small" x="${x}" y="${top+rowH*TSIGNALS.length+20}" text-anchor="middle">${t}ps</text>`;
  }
  svg+=`<line class="timing-axis" x1="${left}" y1="${top+rowH*TSIGNALS.length+4}" x2="${W-right}" y2="${top+rowH*TSIGNALS.length+4}"/>`;
  svg+=`<text class="timing-small" x="${W-right}" y="${top+rowH*TSIGNALS.length+20}" text-anchor="end">time</text>`;
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

  TDRAWABLE.forEach(sig=>{
    const g=geom[sig], arr=draw[sig];
    const hit=document.getElementById("hit-"+sig);
    const ans=document.getElementById("ans-"+sig);
    const prev=document.getElementById("prev-"+sig);
    const dot=document.getElementById("dot-"+sig);
    if(!hit) return;

    const loc=e=>{ const pt=clientToSvg(e); const bin=Math.max(0,Math.min(TN-1,Math.floor((pt.x-left)/binW))); const val=pt.y<g.mid?1:0; return {bin,val}; };
    const refresh=()=>ans.setAttribute("d",timingPath(arr,left,g.y0,rowH,binW));
    const showPrev=(bin,val)=>{ if(timing.dragging) return; const y=val?g.hi:g.lo; const x0=left+bin*binW+3, x1=left+(bin+1)*binW-3; prev.setAttribute("d",`M ${x0} ${y} L ${x1} ${y}`); dot.setAttribute("cx",(x0+x1)/2); dot.setAttribute("cy",y); dot.style.display=""; };
    const hidePrev=()=>{ prev.setAttribute("d",""); dot.style.display="none"; };
    const paint=(a,b,val)=>{ const lo=Math.min(a,b),hi=Math.max(a,b); for(let i=lo;i<=hi;i++) arr[i]=val; timing.verdict=false; timing.completed.delete(timing.stage); tShow("timing-feedback-card","none"); refresh(); timingRenderActions(); timingUpdateCardState(); };

    hit.addEventListener("pointermove",e=>{
      const l=loc(e);
      if(timing.dragging && timing.dragSig===sig){
        if(l.bin!==timing.lastBin){ paint(timing.lastBin,l.bin,timing.drawValue); timing.lastBin=l.bin; }
      } else if(!timing.dragging){ showPrev(l.bin,l.val); }
    });
    hit.addEventListener("pointerenter",e=>{ if(!timing.dragging){ const l=loc(e); showPrev(l.bin,l.val); } });
    hit.addEventListener("pointerleave",()=>{ if(!timing.dragging) hidePrev(); });
    hit.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.preventDefault();
      const l=loc(e);
      timing.dragging=true; timing.dragSig=sig; timing.drawValue=l.val; timing.lastBin=l.bin;
      hidePrev(); paint(l.bin,l.bin,l.val);
      try{ hit.setPointerCapture(e.pointerId); }catch(err){}
    });
    hit.addEventListener("pointerup",e=>{
      if(!timing.dragging) return;
      timing.dragging=false; timing.dragSig=null; timing.drawValue=null; timing.lastBin=null;
      try{ hit.releasePointerCapture(e.pointerId); }catch(err){}
      const l=loc(e); showPrev(l.bin,l.val);
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
