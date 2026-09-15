/* ============================================================
   GATE-LEVEL NETWORK TIMING ANALYSIS  —  3-stage guided problem,
   data-driven over a `network` spec on the problem object so a new
   fixed circuit is just a new PROBLEMS entry, not new code:

     network:{
       inputs:["A","B",...],
       gates:[ {out:"W", kind:"AND2", in:["A","B"]}, ... ]  // topological order
       output:"Y",
       delays:{ NOT:{tpd,tcd}, AND2:{tpd,tcd}, ... },
       waveform:{ A:{init:0|1, transitions:[{time,value}, ...]}, ... },
       duration: <bins, 1 per tau>,
       diagramSvg: "<svg ...>...</svg>"   // hand-authored, like switch/cmos `layout`
     }

   Stage 1: complete the logic truth table (inputs -> every gate output).
   Stage 2: list every input's path to the output; fill in its
            propagation delay, contamination delay, and mark the
            critical path (largest t_pd) and short path (smallest t_cd).
   Stage 3: complete the timing diagram for every gate output — a signal
            holds its old value until t_cd after the triggering edge, is
            "unknown" until t_pd after it, then holds the new value.

   The delay/interval propagation (glComputeSignal), truth-table
   generation, and path enumeration are fully generic; only the SVG
   diagram is hand-authored per problem (matching js/cmos.js's and
   js/switch.js's own "hand-laid-out, not auto-routed" schematic).
   ============================================================ */

const GL_GATE_FN={
  NOT:a=>a?0:1,
  AND2:(a,b)=>a&b,
  OR2:(a,b)=>a|b,
  NAND2:(a,b)=>(a&b)?0:1,
  NOR2:(a,b)=>(a||b)?0:1,
  XOR2:(a,b)=>a^b,
  XNOR2:(a,b)=>(a^b)?0:1
};

function glList(arr){
  if(arr.length===1) return arr[0];
  if(arr.length===2) return arr.join(" and ");
  return arr.slice(0,-1).join(", ")+", and "+arr[arr.length-1];
}

const GL_STAGES=[
  { num:"01", title:"Logic behaviour",
    desc:()=>"Get to know the circuit by completing its truth table.",
    instr:()=>"" },
  { num:"02", title:"Timing analysis",
    desc:()=>"List every path through the network and find the critical and short paths.",
    instr:()=>"",
    tip:()=>`For example, one path is <b>${glPathLabel(gl.paths[0])}</b>. Figure out the gate sequence for the other path${gl.paths.length>2?"s":""} yourself, then compute each path's <b>propagation delay</b> (sum every gate's t<sub>pd</sub> along the path) and <b>contamination delay</b> (sum every t<sub>cd</sub>). Finally, mark whichever path(s) have the largest propagation delay as the <b>critical path</b>, and whichever have the smallest contamination delay as the <b>short path</b>.` },
  { num:"03", title:"Timing diagram",
    desc:()=>`Complete the timing diagram for ${glList(gl.derived)}.`,
    instr:()=>"Using the gate delays below, complete the timing diagram. Make sure to show propagation delay and contamination delay explicitly." }
];

/* ============================================================
   Generic circuit engine — truth table, structural paths, and
   delay-interval propagation, all driven by a `network` spec.
   ============================================================ */
function glPathDelay(chain,key){ return chain.reduce((sum,g)=>sum+gl.net.delays[g][key],0); }
function glPathLabel(p){ return `${p.from} → ${p.chain.join(" → ")} → ${gl.net.output}`; }

function glComputeTruthRows(net){
  const n=net.inputs.length, rows=[];
  for(let m=0;m<(1<<n);m++){
    const row={};
    net.inputs.forEach((name,i)=>{ row[name]=(m>>(n-1-i))&1; });
    net.gates.forEach(g=>{ row[g.out]=GL_GATE_FN[g.kind](...g.in.map(s=>row[s])); });
    rows.push(row);
  }
  return rows;
}

/* Backward trace from the output to every primary input, collecting the
   gate-kind sequence along the way (prepending as we walk further back
   naturally reconstructs forward, input-to-output order). */
function glTracePaths(net){
  const byOut={}; net.gates.forEach(g=>{ byOut[g.out]=g; });
  const paths=[];
  (function walk(node,chain){
    if(net.inputs.includes(node)){ paths.push({from:node,chain:chain.slice()}); return; }
    const g=byOut[node];
    if(!g) return;
    g.in.forEach(inp=>walk(inp,[g.kind,...chain]));
  })(net.output,[]);
  paths.sort((a,b)=>net.inputs.indexOf(a.from)-net.inputs.indexOf(b.from));
  return paths;
}

/* signal shape: {init, transitions:[{time,value,earliest,latest}]} */
function glComputeSignal(kind,inputs,delays){
  const fn=GL_GATE_FN[kind], delay=delays[kind];
  const cur=inputs.map(s=>s.init);
  let ideal=fn(...cur);
  const init=ideal;
  const events=[];
  inputs.forEach((s,idx)=>s.transitions.forEach(tr=>events.push({...tr,idx})));
  events.sort((a,b)=>a.time-b.time);
  const out=[];
  let i=0;
  while(i<events.length){
    const t=events[i].time, group=[];
    while(i<events.length && events[i].time===t){ group.push(events[i]); i++; }
    group.forEach(e=>{ cur[e.idx]=e.value; });
    const next=fn(...cur);
    if(next!==ideal){
      const earliest=Math.min(...group.map(e=>e.earliest))+delay.tcd;
      const latest=Math.max(...group.map(e=>e.latest))+delay.tpd;
      out.push({time:t,value:next,earliest,latest});
      ideal=next;
    }
  }
  return {init,transitions:out};
}

/* Every input's given waveform (exact, no uncertainty: earliest===latest),
   then every gate's output signal, in the network's declared (topological) order. */
function glComputeAllSignals(net){
  const signals={};
  net.inputs.forEach(name=>{
    const wf=net.waveform[name];
    signals[name]={ init:wf.init, transitions:(wf.transitions||[]).map(tr=>({time:tr.time,value:tr.value,earliest:tr.time,latest:tr.time})) };
  });
  net.gates.forEach(g=>{
    signals[g.out]=glComputeSignal(g.kind, g.in.map(n=>signals[n]), net.delays);
  });
  return signals;
}

/* Per-bin state for a signal: 0, 1, or 'X' (unknown, inside [earliest,latest)). */
function glBinStates(sig,n){
  const states=[];
  for(let i=0;i<n;i++){
    let unknown=false;
    for(const tr of sig.transitions){ if(i>=tr.earliest && i<tr.latest){ unknown=true; break; } }
    if(unknown){ states.push("X"); continue; }
    let v=sig.init;
    for(const tr of sig.transitions){ if(tr.latest<=i) v=tr.value; }
    states.push(v);
  }
  return states;
}

/* ============================================================
   State
   ============================================================ */
const gl={
  p:null,
  net:null,               // p.network
  derived:null,           // [gate output names], in declared order — fillable in stage 1/3
  truthRows:null,         // glComputeTruthRows(net)
  paths:null,             // glTracePaths(net) — paths[0] is the given worked example
  signals:null,           // glComputeAllSignals(net): {name: {init,transitions}}
  duration:0,             // net.duration, in bins of 1 tau
  gateKinds:null,         // Object.keys(net.delays), in declared order
  stage:0,
  completed:new Set(),
  checked:false,          // show correctness marks for the current stage
  truthAns:null,          // [{...derived:null|0|1}] per truthRows row
  pathAns:null,           // [{prop,cont,crit,short,chain}] per paths entry — chain is null for the
                          // given first path, else an array of the student's gate-name guesses
  diagram:null,           // {derivedName: Array(duration) of null|0|1|'X'}
  diagramHistory:[],      // undo stack of past gl.diagram snapshots (stage 3, Ctrl+Z)
  dragging:false, dragSig:null, drawValue:null, lastBin:null
};

function glFreshTruthAns(){ return gl.truthRows.map(()=>{ const o={}; gl.derived.forEach(k=>o[k]=null); return o; }); }
function glFreshPathAns(){ return gl.paths.map((p,i)=>({prop:null,cont:null,crit:false,short:false,chain:i===0?null:p.chain.map(()=>null)})); }
function glFreshDiagram(){ const d={}; gl.derived.forEach(k=>d[k]=Array(gl.duration).fill(null)); return d; }

function buildGlnet(p){
  gl.p=p;
  gl.net=p.network;
  gl.derived=gl.net.gates.map(g=>g.out);
  gl.truthRows=glComputeTruthRows(gl.net);
  gl.paths=glTracePaths(gl.net);
  gl.signals=glComputeAllSignals(gl.net);
  gl.duration=gl.net.duration;
  gl.gateKinds=Object.keys(gl.net.delays);
  gl.completed=new Set();
  gl.truthAns=glFreshTruthAns();
  gl.pathAns=glFreshPathAns();
  gl.diagram=glFreshDiagram();
  gl.diagramHistory=[];
  gl.dragging=false; gl.dragSig=null; gl.drawValue=null; gl.lastBin=null;
  glGoStage(0);
}

/* Undo stack for the stage-3 diagram: one snapshot per click/drag stroke. */
function glSnapshotDiagram(){
  const d={}; gl.derived.forEach(k=>d[k]=gl.diagram[k].slice()); return d;
}
function glPushHistory(){
  gl.diagramHistory.push(glSnapshotDiagram());
  if(gl.diagramHistory.length>100) gl.diagramHistory.shift();
}
function glUndo(){
  if(gl.stage!==2 || !gl.diagramHistory.length) return;
  gl.diagram=gl.diagramHistory.pop();
  glInvalidate();
  glRenderDiagram(document.getElementById("gl-right-body"));
}
if(!window.__glKeyBound){
  window.__glKeyBound=true;
  window.addEventListener("keydown",e=>{
    if((e.key!=="z" && e.key!=="Z") || !(e.ctrlKey||e.metaKey) || e.shiftKey) return;
    const view=document.getElementById("solver-glnet");
    if(!view || view.style.display==="none" || gl.stage!==2) return;
    e.preventDefault();
    glUndo();
  });
}

function glGoStage(i){
  gl.stage=i;
  gl.checked=gl.completed.has(i);
  const fc=document.getElementById("gl-feedback-card");
  if(fc) fc.style.display="none";
  glRefresh();
}
function glPrev(){ if(gl.stage>0) glGoStage(gl.stage-1); }
function glNext(){ if(gl.completed.has(gl.stage) && gl.stage<GL_STAGES.length-1) glGoStage(gl.stage+1); }

/* Reset only the CURRENT stage's answers — other stages (and gl.stage itself)
   are left untouched, so resetting stage 3 doesn't cost you stage 1 or 2. */
function glResetStage(){
  if(gl.stage===0) gl.truthAns=glFreshTruthAns();
  else if(gl.stage===1) gl.pathAns=glFreshPathAns();
  else { glPushHistory(); gl.diagram=glFreshDiagram(); }
  gl.completed.delete(gl.stage);
  gl.checked=false;
  const fc=document.getElementById("gl-feedback-card");
  if(fc) fc.style.display="none";
  glRefresh();
}
function glExploreMoreProblems(){ const b=document.getElementById("crumb-back-chapter"); if(b) b.click(); }

function glInvalidate(){
  gl.checked=false;
  gl.completed.delete(gl.stage);
  const fc=document.getElementById("gl-feedback-card");
  if(fc) fc.style.display="none";
  glRenderActions();
  glUpdateCardState();
}

function glRefresh(){
  const s=GL_STAGES[gl.stage];
  document.getElementById("gl-stage-num").textContent=s.num;
  document.getElementById("gl-stage-title").textContent=s.title;
  document.getElementById("gl-stage-desc").textContent=s.desc();
  const instrText=s.instr();
  const instrEl=document.getElementById("gl-instruction");
  instrEl.innerHTML=instrText;
  instrEl.style.display=instrText?"":"none";

  glRenderStagebar();
  glRenderCircuit();

  const rightLabel=document.getElementById("gl-right-label");
  const delayLabel=document.getElementById("gl-delay-label");
  const delayInfo=document.getElementById("gl-delay-info");
  const rightBody=document.getElementById("gl-right-body");

  if(gl.stage===0){
    delayLabel.style.display="none";
    delayInfo.style.display="none";
    rightLabel.textContent="Truth table";
    glRenderStage1Table(rightBody);
  } else {
    delayLabel.style.display="";
    delayInfo.style.display="";
    glRenderDelayInfo(delayInfo);
    if(gl.stage===1){
      rightLabel.innerHTML="Timing analysis"+GL_HELP(s.tip());
      glRenderPathTable(rightBody);
    } else {
      rightLabel.innerHTML="Timing diagram"+GL_HELP(GL_DIAGRAM_HINT);
      glRenderDiagram(rightBody);
    }
  }

  glRenderActions();
  glUpdateCardState();
}

function glRenderStagebar(){
  const host=document.getElementById("gl-stagebar");
  const steps=GL_STAGES.map((s,i)=>{
    const done=gl.completed.has(i), cur=i===gl.stage;
    return `<span class="t-step${done?" done":""}${cur?" current":""}">${done && !cur ? "✓" : i+1}</span>`;
  }).join("");
  const dev = (DEV_MODE && gl.stage!==GL_STAGES.length-1)
    ? `<button type="button" class="dev-skip-link" onclick="glGoStage(${GL_STAGES.length-1})">Dev: skip to last stage &rarr;</button>` : "";
  host.innerHTML=`<div class="t-stepbar">${steps}</div>${dev}`;
}

function glUpdateCardState(){
  document.getElementById("gl-card").classList.toggle("is-correct", gl.completed.has(gl.stage));
}

function glRenderActions(){
  const host=document.getElementById("gl-actions");
  const solved=gl.completed.has(gl.stage);
  const isLast=gl.stage===GL_STAGES.length-1;
  const back = gl.stage>0 ? `<button class="btn ghost" type="button" onclick="glPrev()">&larr; Previous</button>` : "";
  const undo = gl.stage===2
    ? `<button class="btn ghost" type="button" onclick="glUndo()" title="Ctrl+Z" ${gl.diagramHistory.length?"":"disabled"}>Undo</button>` : "";
  const checkLabel = gl.stage===0?"Check table":gl.stage===1?"Check analysis":"Check diagram";
  if(!solved){
    host.innerHTML=`<button class="btn" type="button" onclick="glCheck()">${checkLabel}</button>
      <button class="btn ghost" type="button" onclick="glResetStage()">Reset</button>${undo}${back}`;
  } else if(isLast){
    host.innerHTML=`<button class="btn" type="button" onclick="glExploreMoreProblems()">Explore more problems &rarr;</button>${back}`;
  } else {
    host.innerHTML=`<button class="btn" type="button" onclick="glNext()">Next stage &rarr;</button>${back}`;
  }
}

function glRenderCircuit(){
  document.getElementById("gl-circuit").innerHTML=gl.net.diagramSvg;
}

/* ============================================================
   Stage 1 — interactive truth table
   ============================================================ */
function glRenderStage1Table(host){
  const head=[...gl.net.inputs.map(k=>`<th class="given">${k}</th>`), ...gl.derived.map(k=>`<th class="derived">${k}</th>`)].join("");
  const body=gl.truthRows.map((row,ri)=>{
    const given=gl.net.inputs.map(k=>`<td class="given">${row[k]}</td>`).join("");
    const derived=gl.derived.map(k=>{
      const v=gl.truthAns[ri][k];
      let cls="gate-answer";
      if(gl.checked && v!==null) cls+= v===row[k] ? " mark-good" : " mark-bad";
      return `<td class="${cls}" data-ri="${ri}" data-col="${k}"><button type="button" ${gl.completed.has(0)?"disabled":""}>${v===null?"?":v}</button></td>`;
    }).join("");
    return `<tr>${given}${derived}</tr>`;
  }).join("");
  host.innerHTML=`<table class="gate-truth-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  host.querySelectorAll(".gate-answer button").forEach(btn=>{
    btn.onclick=()=>{
      const td=btn.closest("td"), ri=+td.dataset.ri, k=td.dataset.col;
      const cur=gl.truthAns[ri][k];
      gl.truthAns[ri][k]= cur===0 ? 1 : 0;
      glInvalidate();
      glRenderStage1Table(host);
    };
  });
}

function glRenderDelayInfo(host){
  const rows=gl.gateKinds.map(g=>
    `<tr><td>${g}</td><td>${gl.net.delays[g].tpd}τ</td><td>${gl.net.delays[g].tcd}τ</td></tr>`
  ).join("");
  host.innerHTML=
    `<table class="match-truth-table gl-delay-table"><thead><tr><th>Gate</th><th>t<sub>pd</sub></th><th>t<sub>cd</sub></th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ============================================================
   Stage 2 — timing analysis table
   ============================================================ */
function glChainSelectHtml(i,hopIdx,value,locked){
  const opts=["<option value=\"\">–</option>"].concat(
    gl.gateKinds.map(g=>`<option value="${g}"${value===g?" selected":""}>${g}</option>`)
  ).join("");
  return `<select class="gl-chain-select" data-i="${i}" data-hop="${hopIdx}" ${locked?"disabled":""}>${opts}</select>`;
}

function glRenderPathTable(host){
  const props=gl.paths.map(p=>glPathDelay(p.chain,"tpd"));
  const conts=gl.paths.map(p=>glPathDelay(p.chain,"tcd"));
  const maxProp=Math.max(...props), minCont=Math.min(...conts);
  const locked=gl.completed.has(1);

  const rows=gl.paths.map((p,i)=>{
    const ans=gl.pathAns[i];
    let pathCell, pathMark="";
    if(i===0){
      pathCell=glPathLabel(p);
    } else {
      pathCell=p.from+" &rarr; "+p.chain.map((g,hop)=>glChainSelectHtml(i,hop,ans.chain[hop],locked)).join(" &rarr; ")+" &rarr; "+gl.net.output;
      if(gl.checked) pathMark = ans.chain.every((g,hop)=>g===p.chain[hop]) ? " mark-good" : " mark-bad";
    }
    const propMark = gl.checked && ans.prop!==null ? (ans.prop===props[i]?" mark-good":" mark-bad") : "";
    const contMark = gl.checked && ans.cont!==null ? (ans.cont===conts[i]?" mark-good":" mark-bad") : "";
    const critExpected=props[i]===maxProp, shortExpected=conts[i]===minCont;
    const critMark = gl.checked ? (ans.crit===critExpected?" mark-good":" mark-bad") : "";
    const shortMark = gl.checked ? (ans.short===shortExpected?" mark-good":" mark-bad") : "";
    return `<tr>
      <td class="gl-path-cell${pathMark}">${pathCell}</td>
      <td class="gl-num-cell${propMark}"><input type="number" class="gl-num-input" data-i="${i}" data-k="prop" value="${ans.prop===null?"":ans.prop}" min="0" step="1" ${locked?"disabled":""}> τ</td>
      <td class="gl-num-cell${contMark}"><input type="number" class="gl-num-input" data-i="${i}" data-k="cont" value="${ans.cont===null?"":ans.cont}" min="0" step="1" ${locked?"disabled":""}> τ</td>
      <td class="gl-toggle-cell${critMark}" data-i="${i}" data-k="crit">${ans.crit?"✓":""}</td>
      <td class="gl-toggle-cell${shortMark}" data-i="${i}" data-k="short">${ans.short?"✓":""}</td>
    </tr>`;
  }).join("");

  host.innerHTML=`<table class="match-truth-table gl-path-table"><thead><tr>
      <th>Path</th><th>Prop.&nbsp;delay</th><th>Cont.&nbsp;delay</th><th>Critical?</th><th>Short?</th>
    </tr></thead><tbody>${rows}</tbody></table>`;

  host.querySelectorAll(".gl-chain-select").forEach(sel=>{
    sel.addEventListener("change",()=>{
      const i=+sel.dataset.i, hop=+sel.dataset.hop;
      gl.pathAns[i].chain[hop]= sel.value===""?null:sel.value;
      glInvalidate();
    });
  });
  host.querySelectorAll(".gl-num-input").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const i=+inp.dataset.i, k=inp.dataset.k, v=inp.value.trim();
      gl.pathAns[i][k]= v===""?null:Number(v);
      glInvalidate();
    });
  });
  if(!locked){
    host.querySelectorAll(".gl-toggle-cell").forEach(td=>{
      td.addEventListener("click",()=>{
        const i=+td.dataset.i, k=td.dataset.k;
        gl.pathAns[i][k]=!gl.pathAns[i][k];
        td.textContent= gl.pathAns[i][k] ? "✓" : "";
        glInvalidate();
      });
    });
  }
}

/* ============================================================
   Stage 3 — timing diagram
   ============================================================ */
function glWavePath(states,left,y0,rowH,binW){
  const pad=rowH/4, hi=y0+pad, lo=y0+rowH-pad, slant=Math.min(9,binW*0.35);
  let d="", started=false, prevY=null;
  for(let i=0;i<states.length;i++){
    const v=states[i];
    if(v===null || v==="X"){ started=false; prevY=null; continue; }
    const y=v?hi:lo, x0=left+i*binW, x1=left+(i+1)*binW;
    if(!started){ d+=`M ${x0} ${y}`; started=true; }
    else if(prevY!==null && prevY!==y){ d+=` L ${x0+slant} ${y}`; }
    d+=` L ${x1} ${y}`;
    prevY=y;
  }
  return d;
}
function glUncertainRuns(states){
  const runs=[]; let start=null;
  for(let i=0;i<states.length;i++){
    if(states[i]==="X"){ if(start===null) start=i; }
    else if(start!==null){ runs.push([start,i]); start=null; }
  }
  if(start!==null) runs.push([start,states.length]);
  return runs;
}
function glUncertainSvg(x0,x1,hi,lo,expected){
  const rc=expected?"gl-uncertain-rect gl-uncertain-expected":"gl-uncertain-rect";
  return `<rect class="${rc}" x="${x0}" y="${hi}" width="${x1-x0}" height="${lo-hi}"/>`;
}

/* Own copy of js/timing.js's edge-hover-to-erase cursor, per the no-cross-module-sharing rule. */
const GL_ERASE_CURSOR=`url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><circle cx='10' cy='10' r='9' fill='%23d0343a' stroke='white' stroke-width='1.5'/><path d='M6 6L14 14M14 6L6 14' stroke='white' stroke-width='2' stroke-linecap='round'/></svg>") 10 10, pointer`;

/* Diagram-drawing instructions, tucked behind a hover/focus "?" badge next to
   the "Timing diagram" section label instead of sitting on the page as a
   permanent line of text — see glRefresh()'s use of GL_HELP(). */
const GL_DIAGRAM_HINT="Hover to preview a cell's <b>flat</b> level (top/mid/bottom third = 1/unknown/0) or, near a gridline, its <b>edge</b>. Click or drag to draw it — or, hovering that same edge on an already-drawn cell, to <b>erase</b> it. <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes a stroke.";
function GL_HELP(tip){
  return `<span class="gl-help" tabindex="0">?<span class="gl-help-tip" role="tooltip">${tip}</span></span>`;
}

function glRenderDiagram(host){
  const signalNames=[...gl.net.inputs, ...gl.derived];
  const left=54, right=24, top=16, rowH=52;
  const N=gl.duration;
  // Split every row evenly in quarters: the waveform band (middle half) and the
  // gap above/below it (one quarter each) — so the gap between two signals'
  // bands (one quarter of each row's neighbor, i.e. half a row) is the same
  // size as the band itself, and every horizontal division in the diagram
  // reads as the same-height cell rather than the band looking "taller" than
  // the blank strip between signals.
  const pad=rowH/4;
  // Square cells: each bin is as wide as a row's own waveform band is tall,
  // so the plotted width (and the overall canvas) grows or shrinks with the
  // problem's duration instead of stretching bins to fill a fixed width.
  const binW=rowH-2*pad;
  const plotW=binW*N;
  const W=left+plotW+right;
  const H=top+rowH*signalNames.length+40;
  const geom={};
  signalNames.forEach((name,ri)=>{ const y0=top+ri*rowH; geom[name]={y0,hi:y0+pad,lo:y0+rowH-pad,mid:y0+rowH/2}; });

  // Unlike js/timing.js's own diagram (always a fixed, short duration), a
  // network's duration varies problem to problem, so tying bin width to
  // duration to keep cells square also makes the canvas itself wider for a
  // longer duration. Rendering it at its true pixel size (width/height
  // attributes, not a stretch-to-fill "timing-svg" class) and letting
  // .gl-diagram-svg-wrap's horizontal scroll take the overflow keeps every
  // cell — and its labels — the same legible size regardless of duration,
  // instead of squeezing a long diagram down until it's unreadable.
  let svg=`<svg class="gl-timing-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for(let i=0;i<=N;i++){
    const x=left+i*binW;
    svg+=`<line class="${i===0?"timing-axis":"timing-grid"}" x1="${x}" y1="${top}" x2="${x}" y2="${top+rowH*signalNames.length}"/>`;
  }
  signalNames.forEach(name=>{
    const g=geom[name];
    const isGiven=gl.net.inputs.includes(name);
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.hi}" x2="${W-right}" y2="${g.hi}"/>`;
    svg+=`<line class="timing-grid" x1="${left}" y1="${g.lo}" x2="${W-right}" y2="${g.lo}"/>`;
    svg+=`<text class="timing-label" x="${left-10}" y="${g.mid+4}" text-anchor="end">${name}</text>`;
    svg+=`<text class="timing-small" x="${left-38}" y="${g.hi+3}" text-anchor="end">1</text>`;
    svg+=`<text class="timing-small" x="${left-38}" y="${g.lo+3}" text-anchor="end">0</text>`;

    if(isGiven){
      const states=glBinStates(gl.signals[name],N);
      svg+=`<path class="timing-wave-given" d="${glWavePath(states,left,g.y0,rowH,binW)}"/>`;
    } else {
      svg+=`<g id="gl-exp-${name}"></g>`;
      svg+=`<path class="timing-wave-answer" id="gl-ans-${name}" d=""/>`;
      svg+=`<g id="gl-unc-${name}"></g>`;
      svg+=`<rect class="timing-hit" id="gl-hit-${name}" data-sig="${name}" x="${left}" y="${g.y0}" width="${plotW}" height="${rowH}"/>`;
      svg+=`<g id="gl-hover-${name}" class="gl-hover-group"></g>`;
    }
  });
  for(let t=2;t<N;t+=2){
    const x=left+t*binW;
    svg+=`<text class="timing-small" x="${x}" y="${top+rowH*signalNames.length+20}" text-anchor="middle">${t}τ</text>`;
  }
  svg+=`<line class="timing-axis" x1="${left}" y1="${top+rowH*signalNames.length+4}" x2="${W-right}" y2="${top+rowH*signalNames.length+4}"/>`;
  svg+=`<text class="timing-small" x="${W-right}" y="${top+rowH*signalNames.length+20}" text-anchor="end">time</text>`;
  svg+=`</svg>`;

  host.innerHTML=`<div class="gl-diagram-svg-wrap">${svg}</div>`;

  const svgEl=host.querySelector("svg");
  if(!svgEl) return;
  function clientToSvg(e){ const pt=svgEl.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; return pt.matrixTransform(svgEl.getScreenCTM().inverse()); }

  gl.derived.forEach(sig=>{
    const g=geom[sig];
    const hit=svgEl.querySelector("#gl-hit-"+sig);
    if(!hit) return;

    const refresh=()=>{
      const ans=svgEl.querySelector("#gl-ans-"+sig);
      if(ans) ans.setAttribute("d", glWavePath(gl.diagram[sig],left,g.y0,rowH,binW));
      const uncHost=svgEl.querySelector("#gl-unc-"+sig);
      if(uncHost) uncHost.innerHTML=glUncertainRuns(gl.diagram[sig]).map(([a,b])=>glUncertainSvg(left+a*binW,left+b*binW,g.hi,g.lo,false)).join("");
    };
    refresh();
    if(gl.checked){
      const expected=glBinStates(gl.signals[sig],N);
      const expHost=svgEl.querySelector("#gl-exp-"+sig);
      if(expHost){
        expHost.innerHTML=`<path class="timing-wave-expected" d="${glWavePath(expected,left,g.y0,rowH,binW)}"/>`+
          glUncertainRuns(expected).map(([a,b])=>glUncertainSvg(left+a*binW,left+b*binW,g.hi,g.lo,true)).join("");
      }
    }

    /* A cell's "horizontal side" (its wide middle) previews/sets the flat level
       for that whole bin; its "vertical side" (a strip snapped to the gridline
       at either end) previews/sets the same bin but highlights the exact edge
       you're placing — both resolve to the same bin index either way. Hovering
       that same edge strip when the bin is already filled instead offers to
       erase it (matching js/timing.js's own edge-hover-to-erase interaction). */
    const snapPx=Math.min(8,binW*0.28);
    const loc=e=>{
      const pt=clientToSvg(e);
      const relX=pt.x-left;
      const bin=Math.max(0,Math.min(N-1,Math.floor(relX/binW)));
      const frac=(pt.y-g.y0)/rowH;
      const val = frac<0.333 ? 1 : (frac>0.667 ? 0 : "X");
      const distLeft=relX-bin*binW, distRight=(bin+1)*binW-relX;
      let edgeX=null;
      if(distLeft<=snapPx) edgeX=left+bin*binW;
      else if(distRight<=snapPx) edgeX=left+(bin+1)*binW;
      const erase=edgeX!==null && gl.diagram[sig][bin]!=null;
      return {bin,val,edgeX,erase};
    };
    const paint=(a,b,val)=>{
      const lo=Math.min(a,b), hi=Math.max(a,b);
      for(let i=lo;i<=hi;i++) gl.diagram[sig][i]=val;
      glInvalidate();
      refresh();
    };

    const hoverHost=svgEl.querySelector("#gl-hover-"+sig);
    const showHover=l=>{
      if(!hoverHost) return;
      let html;
      if(l.erase){
        // Highlight the bin's own drawn segment (same y/shape as its current
        // level) in the "about to be removed" style, right on top of it.
        const cur=gl.diagram[sig][l.bin];
        html = cur==="X"
          ? `<rect class="gl-hover-erase-unknown" x="${left+l.bin*binW}" y="${g.hi}" width="${binW}" height="${g.lo-g.hi}"/>`
          : `<path class="gl-hover-erase" d="M ${left+l.bin*binW} ${cur?g.hi:g.lo} L ${left+(l.bin+1)*binW} ${cur?g.hi:g.lo}"/>`;
        hit.style.cursor=GL_ERASE_CURSOR;
      } else {
        if(l.val==="X"){
          html=`<rect class="gl-hover-unknown" x="${left+l.bin*binW}" y="${g.hi}" width="${binW}" height="${g.lo-g.hi}"/>`;
        } else {
          const y=l.val?g.hi:g.lo;
          html=`<path class="gl-hover-preview" d="M ${left+l.bin*binW} ${y} L ${left+(l.bin+1)*binW} ${y}"/>`;
        }
        if(l.edgeX!==null) html+=`<line class="gl-hover-edge" x1="${l.edgeX}" y1="${g.hi-4}" x2="${l.edgeX}" y2="${g.lo+4}"/>`;
        hit.style.cursor="";
      }
      hoverHost.innerHTML=html;
    };
    const hideHover=()=>{ if(hoverHost) hoverHost.innerHTML=""; hit.style.cursor=""; };

    hit.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.preventDefault();
      const l=loc(e);
      const val = l.erase ? null : l.val;
      glPushHistory();
      gl.dragging=true; gl.dragSig=sig; gl.drawValue=val; gl.lastBin=l.bin;
      paint(l.bin,l.bin,val);
      hideHover();
      try{ hit.setPointerCapture(e.pointerId); }catch(err){}
    });
    hit.addEventListener("pointermove",e=>{
      const l=loc(e);
      if(gl.dragging && gl.dragSig===sig){
        if(l.bin!==gl.lastBin){ paint(gl.lastBin,l.bin,gl.drawValue); gl.lastBin=l.bin; }
      } else if(!gl.dragging){
        showHover(l);
      }
    });
    hit.addEventListener("pointerenter",e=>{ if(!gl.dragging) showHover(loc(e)); });
    hit.addEventListener("pointerleave",()=>{ if(!gl.dragging) hideHover(); });
    hit.addEventListener("pointerup",e=>{
      if(!gl.dragging) return;
      gl.dragging=false; gl.dragSig=null; gl.drawValue=null; gl.lastBin=null;
      try{ hit.releasePointerCapture(e.pointerId); }catch(err){}
      showHover(loc(e));
    });
    hit.addEventListener("pointercancel",()=>{ gl.dragging=false; gl.dragSig=null; hideHover(); });
  });
}

/* ============================================================
   Check + feedback
   ============================================================ */
function glShowFeedback(msgs){
  const host=document.getElementById("gl-feedback");
  host.innerHTML="";
  const tags={error:"Fix",warn:"Nudge",success:"Correct",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    d.innerHTML=`<span class="mtag">${tags[mo.s]||""}</span>${mo.t}`;
    host.appendChild(d);
  });
  document.getElementById("gl-feedback-card").style.display="block";
}

function glCheck(){
  gl.checked=true;
  const msgs=[];
  let correct=false;

  if(gl.stage===0){
    let wrong=0, missing=0;
    gl.truthRows.forEach((row,ri)=>{
      gl.derived.forEach(k=>{
        const v=gl.truthAns[ri][k];
        if(v===null) missing++; else if(v!==row[k]) wrong++;
      });
    });
    if(missing) msgs.push({s:"info",t:`Fill in the remaining ${missing} cell${missing===1?"":"s"} before checking.`});
    else if(wrong) msgs.push({s:"warn",t:`${wrong} cell${wrong===1?" doesn't":"s don't"} match the circuit — the mismatches are outlined in red.`});
    correct=!wrong && !missing;

  } else if(gl.stage===1){
    const props=gl.paths.map(p=>glPathDelay(p.chain,"tpd"));
    const conts=gl.paths.map(p=>glPathDelay(p.chain,"tcd"));
    const maxProp=Math.max(...props), minCont=Math.min(...conts);
    let wrong=0, missing=0, chainMissing=0, chainWrong=0;
    gl.paths.forEach((p,i)=>{
      const ans=gl.pathAns[i];
      if(i>0){
        if(ans.chain.some(g=>g===null)) chainMissing++;
        else if(!ans.chain.every((g,hop)=>g===p.chain[hop])) chainWrong++;
      }
      if(ans.prop===null || ans.cont===null){ missing++; }
      else {
        if(ans.prop!==props[i]) wrong++;
        if(ans.cont!==conts[i]) wrong++;
      }
      if(ans.crit!==(props[i]===maxProp)) wrong++;
      if(ans.short!==(conts[i]===minCont)) wrong++;
    });
    if(chainMissing) msgs.push({s:"info",t:`Figure out the gate sequence for ${chainMissing} more path${chainMissing===1?"":"s"} first.`});
    else if(missing) msgs.push({s:"info",t:`Fill in the propagation and contamination delay for ${missing} more path${missing===1?"":"s"}.`});
    else if(chainWrong) msgs.push({s:"warn",t:`${chainWrong} path${chainWrong===1?"":"s"} ${chainWrong===1?"doesn't":"don't"} list the right gate sequence yet — trace each input through the diagram to ${gl.net.output}.`});
    else if(wrong) msgs.push({s:"warn",t:`${wrong} value${wrong===1?" doesn't":"s don't"} match yet. See the highlighted cells. Propagation delay sums every t<sub>pd</sub> along the path; contamination delay sums every t<sub>cd</sub>; the critical path has the largest propagation delay, the short path the smallest contamination delay.`});
    correct=!wrong && !missing && !chainMissing && !chainWrong;

  } else {
    let wrong=0, missing=0;
    gl.derived.forEach(sig=>{
      const expected=glBinStates(gl.signals[sig],gl.duration);
      const arr=gl.diagram[sig];
      for(let i=0;i<gl.duration;i++){
        if(arr[i]===null) missing++;
        else if(arr[i]!==expected[i]) wrong++;
      }
    });
    if(missing) msgs.push({s:"info",t:`Draw the remaining ${missing} interval${missing===1?"":"s"} across ${glList(gl.derived)} first.`});
    else if(wrong) msgs.push({s:"warn",t:`${wrong} interval${wrong===1?" doesn't":"s don't"} match yet. The dashed green trace shows the expected waveform.`});
    correct=!wrong && !missing;
  }

  if(correct){
    gl.completed.add(gl.stage);
    msgs.push({s:"success", t: gl.completed.size===GL_STAGES.length
      ? "Correct — and that was the final stage. You've worked all the way through the circuit's timing."
      : "Correct. Use <b>Next stage</b> to continue."});
  } else {
    gl.completed.delete(gl.stage);
  }

  glRefresh();
  glShowFeedback(msgs);
}
