/* ============================================================
   BUILD GATES FROM A UNIVERSAL PRIMITIVE (NOR2 or NAND2)
   drag/wire builder, staged by target gate.
   (mirrors the CMOS builder's pointer-gesture model in js/cmos.js, but
   composes logic gates instead of transistors: no rails, one device
   kind, and the "simulation" is a fixed-point logic evaluation instead
   of an electrical-conduction check.)
   The problem's `primitive` field ("NOR", default, or "NAND") selects which
   2-input gate the student places — see NOR_PRIMITIVES. Everything else
   (placement, wiring, evaluation, stage progression) is primitive-agnostic.
   ============================================================ */
const nor={
  p:null,
  stageIndex:0,
  completed:new Set(),
  stages:[],             // per-stage canvas state: {devices,wires,junctions,nextIdx} — kept independently so "Previous gate" doesn't lose a finished circuit
  selected:null,         // {type:"device"|"wire"|"junction", id}
  armed:false,
  armedHover:null,
  drag:null,             // {mode:"place"|"move", ...}
  wiring:null            // {from,fromPos,cursor,snap}
};

/* The active stage's canvas state (devices/wires/junctions/nextIdx). */
function norS(){ return nor.stages[nor.stageIndex]; }

/* Which 2-input gate the student places. NOR is the default so existing
   problems that predate this field keep working unchanged. */
const NOR_PRIMITIVES={
  NOR:{ label:"NOR2", fn:(a,b)=>(a||b)?0:1, glyph:norGlyphNOR },
  NAND:{ label:"NAND2", fn:(a,b)=>(a&&b)?0:1, glyph:norGlyphNAND }
};
function norPrim(){ return NOR_PRIMITIVES[nor.p.primitive||"NOR"]; }

/* Target gates the student can be asked to build, with a build hint per
   primitive (the correct construction differs between NOR2 and NAND2). */
const NOR_TARGETS={
  NOT:{ label:"NOT", inputs:["A"], fn:a=>a?0:1,
    hints:{
      NOR:"Tie both inputs of a single NOR2 to A. NOR(A,A) always equals NOT A.",
      NAND:"Tie both inputs of a single NAND2 to A. NAND(A,A) always equals NOT A."
    }},
  AND:{ label:"AND", inputs:["A","B"], fn:(a,b)=>a&b,
    hints:{
      NOR:"By De Morgan's law, NOR(NOT A, NOT B) = A AND B. Build two NOR2 gates as inverters, then feed both outputs into a third NOR2.",
      NAND:"A NAND2 already computes NOT(A AND B). Invert its output with a second NAND2 wired as an inverter."
    }},
  OR:{ label:"OR", inputs:["A","B"], fn:(a,b)=>a|b,
    hints:{
      NOR:"NOR2 already computes NOT(A OR B). Invert its output with a second NOR2 wired as an inverter.",
      NAND:"By De Morgan's law, NAND(NOT A, NOT B) = A OR B. Build two NAND2 gates as inverters, then feed both outputs into a third NAND2."
    }}
};

function norTarget(){ return NOR_TARGETS[nor.p.stages[nor.stageIndex]]; }
function norTargetHint(target){ return target.hints[nor.p.primitive||"NOR"]; }
function norArticle(label){ return /^[AEIOU]/i.test(label) ? "an" : "a"; }

function norTruthRows(inputs,fn){
  const n=inputs.length, rows=[];
  for(let m=0;m<(1<<n);m++){
    const row={};
    inputs.forEach((name,i)=>{ row[name]=(m>>(n-1-i))&1; });
    row.Y=fn(...inputs.map(k=>row[k]));
    rows.push(row);
  }
  return rows;
}

/* ---- canvas geometry (per stage) ---- */
function norGeom(){
  if(norTarget().inputs.length===1){
    return {
      W:420,H:200,
      workLeft:100,workRight:340,workTop:26,workBottom:174,
      inputs:[{id:"A",x:34,y:100,label:"A"}],
      output:{x:386,y:100,label:"Y"}
    };
  }
  return {
    W:500,H:340,
    workLeft:100,workRight:420,workTop:26,workBottom:314,
    inputs:[{id:"A",x:34,y:100,label:"A"},{id:"B",x:34,y:260,label:"B"}],
    output:{x:466,y:180,label:"Y"}
  };
}

/* device geometry: a gate centered at (d.x,d.y) with inputs/output offset symmetrically */
const NOR_DEV={dx:62,dy:20};
function norDevIn0(d){ return {x:d.x-NOR_DEV.dx,y:d.y-NOR_DEV.dy}; }
function norDevIn1(d){ return {x:d.x-NOR_DEV.dx,y:d.y+NOR_DEV.dy}; }
function norDevOut(d){ return {x:d.x+NOR_DEV.dx,y:d.y}; }

/* Both glyphs share one local coordinate system — viewBox 0 0 130 84, center
   (68,42), input leads reaching to (6,22)/(6,62), output lead ending at
   (130,42) — so device/terminal placement (NOR_DEV) never varies by primitive.
   NOR2: OR body + output bubble. NAND2: AND ("D") body + output bubble. */
function norGlyphNOR(){
  return `<path class="gate-wire" d="M6 22 H34"/><path class="gate-wire" d="M6 62 H34"/><path class="gate-wire" d="M120 42 H130"/>
    <path class="gate-symbol" d="M34 8 C52 8 70 8 86 20 C100 30 108 36 108 42 C108 48 100 54 86 64 C70 76 52 76 34 76 C46 58 46 26 34 8 Z"/>
    <circle class="gate-symbol" cx="114" cy="42" r="6"/>`;
}
function norGlyphNAND(){
  return `<path class="gate-wire" d="M6 22 H40"/><path class="gate-wire" d="M6 62 H40"/><path class="gate-wire" d="M120 42 H130"/>
    <path class="gate-symbol" d="M40 8 H64 C92 8 108 24 108 42 C108 60 92 76 64 76 H40 Z"/>
    <circle class="gate-symbol" cx="114" cy="42" r="6"/>`;
}
function norGlyphInner(){ return norPrim().glyph(); }
function norPaletteIconSvg(){
  return `<svg class="match-gate-svg" viewBox="0 0 130 84" role="img" aria-label="${norPrim().label} gate">${norGlyphInner()}</svg>`;
}

/* ---- top-level build / render ---- */
function buildNorProblem(p){
  nor.p=p;
  nor.stageIndex=0;
  nor.completed=new Set();
  nor.stages=p.stages.map(()=>({devices:[],wires:[],junctions:[],nextIdx:0}));
  norEnterStage();
}

/* Switch into whichever stage nor.stageIndex now points at, WITHOUT touching
   that stage's (or any other stage's) saved canvas — used by Next/Previous. */
function norEnterStage(){
  nor.selected=null;
  nor.armed=false;
  nor.armedHover=null;
  norCancelGesture();
  document.getElementById("nor-feedback-card").style.display="none";
  norRender();
}

/* Wipe the CURRENT stage's canvas and un-mark it complete — bound to "Reset". */
function norResetStage(){
  const s=norS();
  s.devices=[]; s.wires=[]; s.junctions=[]; s.nextIdx=0;
  nor.completed.delete(nor.stageIndex);
  norEnterStage();
}

function norRender(){
  const target=norTarget();
  const solved=nor.completed.has(nor.stageIndex);
  document.getElementById("nor-workspace").classList.toggle("is-correct",solved);
  document.getElementById("nor-stage-num").textContent="0"+(nor.stageIndex+1);
  document.getElementById("nor-stage-title").textContent=`Build ${norArticle(target.label)} ${target.label} gate`;
  document.getElementById("nor-stage-desc").textContent=
    `Drag ${norPrim().label} gates onto the canvas and wire them so the circuit always matches the target truth table on the right.`;
  document.getElementById("nor-target-label").textContent=`Target: ${target.label}`;
  document.getElementById("nor-palette-label").textContent=`${norPrim().label}: drag onto the canvas`;
  document.getElementById("nor-ref-label").textContent=`${norPrim().label} truth table`;
  document.getElementById("nor-figcap-label").textContent=norPrim().label;

  norRenderStagebar();
  norRenderPalette();
  norRenderReferenceTable();
  norRenderCanvasToolbar();
  norRenderCanvas();

  const rows=norTruthRows(target.inputs,target.fn);
  let results=null;
  if(solved){
    results=rows.map(row=>{
      const assign={}; target.inputs.forEach(k=>assign[k]=row[k]);
      return norEvaluate(assign);
    });
  }
  norRenderTargetTable(rows,results);
  norRenderActions();
}

function norRenderStagebar(){
  const host=document.getElementById("nor-stagebar");
  const steps=nor.p.stages.map((key,i)=>{
    const done=nor.completed.has(i), cur=i===nor.stageIndex;
    return `<span class="t-step${done?" done":""}${cur?" current":""}">${done && !cur ? "✓" : NOR_TARGETS[key].label}</span>`;
  }).join("");
  const lastIdx=nor.p.stages.length-1;
  const dev = (DEV_MODE && nor.stageIndex!==lastIdx)
    ? `<button type="button" class="dev-skip-link" onclick="norGoStage(${lastIdx})">Dev: skip to last stage &rarr;</button>` : "";
  host.innerHTML=`<div class="t-stepbar">${steps}</div>${dev}`;
}

function norRenderReferenceTable(){
  const rows=norTruthRows(["A","B"],norPrim().fn);
  const body=rows.map(r=>`<tr><td>${r.A}</td><td>${r.B}</td><td>${r.Y}</td></tr>`).join("");
  document.getElementById("nor-ref-table").innerHTML=
    `<table class="match-truth-table"><thead><tr><th>A</th><th>B</th><th>Y</th></tr></thead><tbody>${body}</tbody></table>`;
}

function norRenderTargetTable(rows,results){
  const target=norTarget();
  const head=[...target.inputs.map(k=>`<th>${k}</th>`),`<th>Y</th>`,`<th>Your&nbsp;Y</th>`].join("");
  const rowsHtml=rows.map((row,i)=>{
    const ins=target.inputs.map(k=>`<td>${row[k]}</td>`).join("");
    let yours=`<td class="nor-your-y">–</td>`;
    if(results){
      const v=results[i];
      const ok=v===row.Y;
      yours=`<td class="nor-your-y ${ok?"mark-good":"mark-bad"}">${v}</td>`;
    }
    return `<tr>${ins}<td>${row.Y}</td>${yours}</tr>`;
  }).join("");
  document.getElementById("nor-target-table").innerHTML=
    `<table class="match-truth-table nor-target-truth-table"><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

function norRenderPalette(){
  document.getElementById("nor-palette").innerHTML=
    `<div class="match-gate-card nor-palette-card${nor.armed?" is-armed":""}" id="nor-palette-item" style="touch-action:none;" title="Drag onto the canvas, or click then click a spot to place">
      <span class="match-gate-icon">${norPaletteIconSvg()}</span>
      <span class="match-gate-name">${norPrim().label}</span>
    </div>`;
  const el=document.getElementById("nor-palette-item");
  el.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse" && e.button!==0) return;
    e.preventDefault();
    nor.drag={mode:"place",x:null,y:null,inside:false,everInside:false};
    norBeginGesture();
    norRenderCanvas();
  });
}

function norSelectedDevice(){
  if(!nor.selected || nor.selected.type!=="device") return null;
  return norS().devices.find(d=>d.id===nor.selected.id)||null;
}

function norRenderCanvasToolbar(){
  const host=document.getElementById("nor-canvas-toolbar");
  const d=norSelectedDevice();
  let status;
  if(d) status=`Selected <b>${d.name}</b>: drag to move, or delete.`;
  else if(nor.selected) status=`Selected a wire: delete it, or click away.`;
  else if(nor.armed) status=`Placing a <b>${norPrim().label}</b>: click the canvas to drop it.`;
  else status=`No item selected.`;
  host.innerHTML=`
    <div class="schem-status"><span>${status}</span></div>
    <div class="schem-actions">
      <button class="btn ghost sm" id="nor-delete" type="button" ${nor.selected?"":"disabled"}>Delete</button>
    </div>`;
  const del=document.getElementById("nor-delete");
  if(del) del.onclick=norDeleteSelected;
}

function norDeleteSelected(){
  if(!nor.selected) return;
  const s=norS();
  if(nor.selected.type==="device"){
    const id=nor.selected.id;
    s.devices=s.devices.filter(d=>d.id!==id);
    s.wires=s.wires.filter(w=>!w.a.startsWith(id+":") && !w.b.startsWith(id+":"));
  } else if(nor.selected.type==="wire"){
    s.wires=s.wires.filter(w=>w.id!==nor.selected.id);
  } else if(nor.selected.type==="junction"){
    const id=nor.selected.id;
    s.wires=s.wires.filter(w=>w.a!==id && w.b!==id);
    s.junctions=s.junctions.filter(j=>j.id!==id);
  }
  nor.selected=null;
  norRenderCanvasToolbar();
  norRenderCanvas();
  norHideFeedback();
}

function norSnapGrid(v,step=10){ return Math.round(v/step)*step; }

function norClampPoint(pnt){
  const g=norGeom();
  const x=norSnapGrid(Math.max(g.workLeft+72,Math.min(g.workRight-72,pnt.x)));
  const y=norSnapGrid(Math.max(g.workTop+40,Math.min(g.workBottom-40,pnt.y)));
  return {x,y};
}

function norAddDevice(x,y){
  const pt=norClampPoint({x,y});
  const id="g"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const s=norS();
  s.devices.push({id,name:"G"+(s.nextIdx++),x:pt.x,y:pt.y});
  nor.selected=null;
  norRenderPalette();
  norRenderCanvasToolbar();
  norRenderCanvas();
  norHideFeedback();
}

function norWireExists(a,b){
  return norS().wires.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));
}
function norAddWire(a,b){
  if(!a||!b||a===b||norWireExists(a,b)) return;
  norS().wires.push({id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a,b});
  norRenderCanvasToolbar();
  norRenderCanvas();
  norHideFeedback();
}

function norEndpointPos(id){
  const g=norGeom();
  if(id==="Y") return {x:g.output.x,y:g.output.y};
  const inp=g.inputs.find(i=>i.id===id);
  if(inp) return {x:inp.x,y:inp.y};
  if(id.startsWith("j")){
    const j=norS().junctions.find(x=>x.id===id);
    return j?{x:j.x,y:j.y}:null;
  }
  const [devId,term]=id.split(":");
  const d=norS().devices.find(x=>x.id===devId);
  if(!d) return null;
  if(term==="in0") return norDevIn0(d);
  if(term==="in1") return norDevIn1(d);
  return norDevOut(d);
}

function norAllEndpoints(){
  const s=norS();
  const ids=["Y",...norGeom().inputs.map(i=>i.id)];
  s.devices.forEach(d=>ids.push(d.id+":in0",d.id+":in1",d.id+":out"));
  s.junctions.forEach(j=>ids.push(j.id));
  return ids.map(id=>({id,pos:norEndpointPos(id)})).filter(e=>e.pos);
}

function norNearestEndpoint(point,excludeId=null,radius=28){
  let best=null,bestD=radius;
  norAllEndpoints().forEach(ep=>{
    if(ep.id===excludeId) return;
    const d=Math.hypot(ep.pos.x-point.x,ep.pos.y-point.y);
    if(d<=bestD){ bestD=d; best=ep; }
  });
  return best;
}

function norOrthogonalPoints(a,b){
  if(!a||!b) return [];
  if(Math.abs(a.x-b.x)<2 || Math.abs(a.y-b.y)<2) return [a,b];
  const midY=norSnapGrid((a.y+b.y)/2,10);
  return [a,{x:a.x,y:midY},{x:b.x,y:midY},b];
}
function norOrthogonalPath(a,b){
  const pts=norOrthogonalPoints(a,b);
  if(!pts.length) return "";
  return pts.map((p,i)=>`${i?"L":"M"} ${p.x} ${p.y}`).join(" ");
}
function norNearestPointOnSegment(p,a,b){
  const vx=b.x-a.x,vy=b.y-a.y;
  const len2=vx*vx+vy*vy;
  if(len2===0) return {x:a.x,y:a.y,d:Math.hypot(p.x-a.x,p.y-a.y)};
  let t=((p.x-a.x)*vx+(p.y-a.y)*vy)/len2;
  t=Math.max(0,Math.min(1,t));
  const x=a.x+t*vx,y=a.y+t*vy;
  return {x,y,d:Math.hypot(p.x-x,p.y-y)};
}
function norNearestPointOnWire(w,p){
  const a=norEndpointPos(w.a),b=norEndpointPos(w.b);
  if(!a||!b) return null;
  const pts=norOrthogonalPoints(a,b);
  let best=null;
  for(let i=0;i<pts.length-1;i++){
    const q=norNearestPointOnSegment(p,pts[i],pts[i+1]);
    if(!best||q.d<best.d) best={...q,seg:i};
  }
  if(!best) return null;
  const p0=pts[best.seg],p1=pts[best.seg+1];
  if(Math.abs(p0.x-p1.x)<2){ best.x=p0.x; best.y=norSnapGrid(best.y,10); }
  else { best.y=p0.y; best.x=norSnapGrid(best.x,10); }
  return best;
}
function norNearestWire(point,excludeWireId=null,radius=20){
  let best=null;
  norS().wires.forEach(w=>{
    if(w.id===excludeWireId) return;
    const hit=norNearestPointOnWire(w,point);
    if(!hit||hit.d>radius) return;
    if(!best||hit.d<best.d) best={wire:w,...hit};
  });
  return best;
}

function norCreateJunctionOnWire(wireId,point){
  const s=norS();
  const w=s.wires.find(x=>x.id===wireId);
  if(!w) return null;
  const hit=norNearestPointOnWire(w,point);
  if(!hit) return null;
  const aPos=norEndpointPos(w.a),bPos=norEndpointPos(w.b);
  if(!aPos||!bPos) return null;
  if(Math.hypot(hit.x-aPos.x,hit.y-aPos.y)<12) return w.a;
  if(Math.hypot(hit.x-bPos.x,hit.y-bPos.y)<12) return w.b;
  const id="j"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  s.junctions.push({id,x:hit.x,y:hit.y});
  s.wires=s.wires.filter(x=>x.id!==wireId);
  s.wires.push(
    {id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a:w.a,b:id},
    {id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a:id,b:w.b}
  );
  return id;
}
function norConnectEndpointToWire(endpoint,wireId,point){
  const junctionId=norCreateJunctionOnWire(wireId,point);
  if(!junctionId||junctionId===endpoint) return;
  if(!norWireExists(endpoint,junctionId)){
    norS().wires.push({id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a:endpoint,b:junctionId});
  }
  norRenderCanvasToolbar();
  norRenderCanvas();
  norHideFeedback();
}

/* ---- logic evaluation: union-find over wires, then fixed-point propagation ---- */
function norUnionFind(){
  const s=norS();
  const ids=["Y",...norGeom().inputs.map(i=>i.id)];
  s.devices.forEach(d=>ids.push(d.id+":in0",d.id+":in1",d.id+":out"));
  s.junctions.forEach(j=>ids.push(j.id));
  const parent=Object.fromEntries(ids.map(id=>[id,id]));
  function find(x){ if(!(x in parent)) return x; if(parent[x]!==x) parent[x]=find(parent[x]); return parent[x]; }
  function unite(a,b){ if(!(a in parent)||!(b in parent)) return; const ra=find(a),rb=find(b); if(ra!==rb) parent[rb]=ra; }
  s.wires.forEach(w=>unite(w.a,w.b));
  return {find};
}
function norEvaluate(assign){
  const {find}=norUnionFind();
  const netValue={};
  Object.keys(assign).forEach(k=>{ netValue[find(k)]=assign[k]; });
  let changed=true,guard=0;
  while(changed && guard++<25){
    changed=false;
    norS().devices.forEach(d=>{
      const outNet=find(d.id+":out");
      if(netValue[outNet]!==undefined) return;
      const v0=netValue[find(d.id+":in0")], v1=netValue[find(d.id+":in1")];
      if(v0!==undefined && v1!==undefined){
        netValue[outNet]=norPrim().fn(v0,v1);
        changed=true;
      }
    });
  }
  return netValue[find("Y")];
}

/* ============================================================
   Pointer gesture plumbing (adapted from js/cmos.js — place / move / wire)
   ============================================================ */
let norGestureHandlers=null;
function norRemoveGestureListeners(){
  if(norGestureHandlers){
    window.removeEventListener("pointermove",norGestureHandlers.move);
    window.removeEventListener("pointerup",norGestureHandlers.up);
    window.removeEventListener("pointercancel",norGestureHandlers.up);
    norGestureHandlers=null;
  }
}
function norBeginGesture(){
  norRemoveGestureListeners();
  const move=e=>norGestureMove(e);
  const up=e=>norGestureUp(e);
  norGestureHandlers={move,up};
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
  window.addEventListener("pointercancel",up);
}
function norCancelGesture(){
  norRemoveGestureListeners();
  nor.drag=null;
  nor.wiring=null;
}
function norClientToSvg(clientX,clientY){
  const svgEl=document.querySelector("#nor-canvas svg");
  if(!svgEl||!svgEl.getScreenCTM) return null;
  const m=svgEl.getScreenCTM();
  if(!m) return null;
  const pt=svgEl.createSVGPoint();
  pt.x=clientX; pt.y=clientY;
  const p=pt.matrixTransform(m.inverse());
  return {x:p.x,y:p.y};
}
function norInsideSheet(pnt){
  const g=norGeom();
  return !!pnt && pnt.x>g.workLeft-10 && pnt.x<g.workRight+10 && pnt.y>g.workTop-10 && pnt.y<g.workBottom+10;
}

function norGestureMove(e){
  const pnt=norClientToSvg(e.clientX,e.clientY);
  if(!pnt) return;

  if(nor.drag && nor.drag.mode==="place"){
    const inside=norInsideSheet(pnt);
    nor.drag.inside=inside;
    if(inside) nor.drag.everInside=true;
    const c=norClampPoint(pnt);
    nor.drag.x=c.x; nor.drag.y=c.y;
    norRenderCanvas();

  } else if(nor.drag && nor.drag.mode==="move"){
    const d=norS().devices.find(x=>x.id===nor.drag.id);
    if(!d) return;
    const c=norClampPoint({x:pnt.x+nor.drag.dx,y:pnt.y+nor.drag.dy});
    d.x=c.x; d.y=c.y;
    norRenderCanvas();

  } else if(nor.wiring){
    const snap=norNearestEndpoint(pnt,nor.wiring.from,28);
    const wireSnap=snap?null:norNearestWire(pnt,null,18);
    nor.wiring.snap = snap ? {type:"endpoint",id:snap.id}
      : wireSnap ? {type:"wire",id:wireSnap.wire.id,point:{x:wireSnap.x,y:wireSnap.y}}
      : null;
    nor.wiring.cursor = snap ? snap.pos : wireSnap ? {x:wireSnap.x,y:wireSnap.y} : pnt;
    norRenderCanvas();
  }
}

function norGestureUp(e){
  const drag=nor.drag, wiring=nor.wiring;
  norRemoveGestureListeners();
  nor.drag=null; nor.wiring=null;

  if(drag && drag.mode==="place"){
    const pnt=norClientToSvg(e.clientX,e.clientY);
    if(norInsideSheet(pnt)){
      nor.armed=false; nor.armedHover=null;
      norAddDevice(pnt.x,pnt.y);
    } else if(!drag.everInside){
      nor.armed=!nor.armed;
      nor.armedHover=null;
      norRenderPalette();
      norRenderCanvasToolbar();
      norRenderCanvas();
    } else {
      norRenderPalette();
      norRenderCanvas();
    }

  } else if(drag && drag.mode==="move"){
    norRenderCanvas();

  } else if(wiring){
    const snap=wiring.snap;
    let target=null;
    if(snap && snap.type==="endpoint" && snap.id!==wiring.from) target={kind:"endpoint",id:snap.id};
    else if(snap && snap.type==="wire") target={kind:"wire",id:snap.id,point:snap.point};

    if(target){
      if(target.kind==="endpoint"){
        if(target.id!==wiring.from) norAddWire(wiring.from,target.id); else norRenderCanvas();
      } else {
        norConnectEndpointToWire(wiring.from,target.id,target.point);
      }
    } else {
      norRenderCanvas();
    }
  }
}

function norRenderCanvas(){
  const g=norGeom();
  const s=norS();
  const snapId=(nor.wiring && nor.wiring.snap && nor.wiring.snap.type==="endpoint") ? nor.wiring.snap.id : null;
  const tgt=id=>snapId===id ? " snap-target" : "";

  let svg=`<svg class="schem-svg${nor.armed?" armed":""}" viewBox="0 0 ${g.W} ${g.H}" width="${g.W}" height="${g.H}" xmlns="http://www.w3.org/2000/svg">`;

  for(let x=g.workLeft-10;x<g.workRight+10;x+=20){
    for(let y=g.workTop-10;y<g.workBottom+10;y+=20){
      svg+=`<circle class="schem-grid-dot" cx="${x}" cy="${y}" r=".7"/>`;
    }
  }

  // wires (drawn before every terminal below, so a wire's fat invisible hit-stroke
  // never sits on top of — and steals hover/click from — a terminal it connects to)
  s.wires.forEach(w=>{
    const a=norEndpointPos(w.a), b=norEndpointPos(w.b);
    if(!a||!b) return;
    const selected=nor.selected?.type==="wire" && nor.selected.id===w.id;
    const path=norOrthogonalPath(a,b);
    svg+=`<path class="schem-wire${selected?" selected":""}" d="${path}"/>`;
    svg+=`<path class="schem-wire-hit" data-wire="${w.id}" d="${path}"/>`;
  });

  // circuit inputs (fixed points, fan-out allowed)
  g.inputs.forEach(inp=>{
    svg+=`<circle class="terminal fixed${tgt(inp.id)}" data-endpoint="${inp.id}" cx="${inp.x}" cy="${inp.y}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${inp.id}" cx="${inp.x}" cy="${inp.y}" r="16"/>`;
    svg+=`<text class="nor-io-label" x="${inp.x}" y="${inp.y-14}" text-anchor="middle">${inp.label}</text>`;
  });
  // circuit output (fixed point)
  svg+=`<circle class="terminal fixed${tgt("Y")}" data-endpoint="Y" cx="${g.output.x}" cy="${g.output.y}" r="4"/>`;
  svg+=`<circle class="terminal-hot" data-endpoint="Y" cx="${g.output.x}" cy="${g.output.y}" r="16"/>`;
  svg+=`<text class="nor-io-label" x="${g.output.x}" y="${g.output.y-14}" text-anchor="middle">${g.output.label}</text>`;

  // devices
  s.devices.forEach(d=>{
    const selected=nor.selected?.type==="device" && nor.selected.id===d.id;
    svg+=`<g class="schem-device${selected?" selected":""}" data-device="${d.id}">`;
    svg+=`<rect class="device-select-ring" x="${d.x-66}" y="${d.y-46}" width="132" height="92" rx="10"/>`;
    svg+=`<g transform="translate(${d.x-68},${d.y-42})">${norGlyphInner()}</g>`;
    svg+=`<text class="nor-dev-name" x="${d.x-58}" y="${d.y-30}">${d.name}</text>`;
    svg+=`<rect class="device-hit" fill="transparent" x="${d.x-66}" y="${d.y-40}" width="132" height="80" rx="8"/>`;
    svg+=`</g>`;

    const in0=norDevIn0(d), in1=norDevIn1(d), out=norDevOut(d);
    svg+=`<circle class="terminal${tgt(d.id+":in0")}" data-endpoint="${d.id}:in0" cx="${in0.x}" cy="${in0.y}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:in0" cx="${in0.x}" cy="${in0.y}" r="16"/>`;
    svg+=`<circle class="terminal${tgt(d.id+":in1")}" data-endpoint="${d.id}:in1" cx="${in1.x}" cy="${in1.y}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:in1" cx="${in1.x}" cy="${in1.y}" r="16"/>`;
    svg+=`<circle class="terminal${tgt(d.id+":out")}" data-endpoint="${d.id}:out" cx="${out.x}" cy="${out.y}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:out" cx="${out.x}" cy="${out.y}" r="16"/>`;
  });

  // junction dots at any endpoint used 2+ times, plus explicit junctions
  const endpointUse={};
  s.wires.forEach(w=>{ endpointUse[w.a]=(endpointUse[w.a]||0)+1; endpointUse[w.b]=(endpointUse[w.b]||0)+1; });
  Object.entries(endpointUse).forEach(([id,count])=>{
    if(count<2||id.startsWith("j")) return;
    const pnt=norEndpointPos(id);
    if(pnt) svg+=`<circle class="schem-junction" cx="${pnt.x}" cy="${pnt.y}" r="3.1"/>`;
  });
  s.junctions.forEach(j=>{
    const selected=(nor.selected?.type==="junction" && nor.selected.id===j.id) || snapId===j.id;
    svg+=`<circle class="terminal${selected?" snap-target":""}" data-endpoint="${j.id}" cx="${j.x}" cy="${j.y}" r="3.8"/>`;
    svg+=`<circle class="terminal-hot junction-hot" data-endpoint="${j.id}" data-junction="${j.id}" cx="${j.x}" cy="${j.y}" r="16"/>`;
  });

  if(!s.devices.length && !(nor.drag && nor.drag.mode==="place") && !nor.armed){
    svg+=`<text class="schem-empty-note" x="${(g.workLeft+g.workRight)/2}" y="${(g.workTop+g.workBottom)/2}" text-anchor="middle">Drag or click a ${norPrim().label} gate here</text>`;
  }

  // live previews
  if(nor.drag && nor.drag.mode==="place" && nor.drag.inside && nor.drag.x!=null){
    svg+=`<g class="schem-ghost" style="opacity:.5;pointer-events:none" transform="translate(${nor.drag.x-68},${nor.drag.y-42})">${norGlyphInner()}</g>`;
  }
  if(nor.armed && nor.armedHover){
    svg+=`<g class="schem-ghost" style="opacity:.45;pointer-events:none" transform="translate(${nor.armedHover.x-68},${nor.armedHover.y-42})">${norGlyphInner()}</g>`;
  }
  if(nor.wiring){
    const from=nor.wiring.fromPos||norEndpointPos(nor.wiring.from);
    const to=nor.wiring.cursor||from;
    if(from&&to) svg+=`<path class="schem-preview" style="pointer-events:none" d="${norOrthogonalPath(from,to)}"/>`;
    if(nor.wiring.snap && nor.wiring.snap.type==="wire"){
      const pt=nor.wiring.snap.point;
      svg+=`<circle class="schem-junction" style="pointer-events:none" cx="${pt.x}" cy="${pt.y}" r="3.6"/>`;
    }
  }

  svg+=`</svg>`;

  const host=document.getElementById("nor-canvas");
  host.classList.add("editor");
  host.innerHTML=svg;
  const svgEl=host.querySelector("svg");
  if(!svgEl) return;

  host.querySelectorAll(".schem-device").forEach(gEl=>{
    gEl.style.touchAction="none";
    gEl.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault(); e.stopPropagation();
      nor.armed=false; nor.armedHover=null;
      const id=gEl.dataset.device;
      const d=norS().devices.find(x=>x.id===id);
      if(!d) return;
      const pnt=norClientToSvg(e.clientX,e.clientY)||{x:d.x,y:d.y};
      nor.selected={type:"device",id};
      nor.drag={mode:"move",id,dx:d.x-pnt.x,dy:d.y-pnt.y};
      norBeginGesture();
      norRenderPalette();
      norRenderCanvasToolbar();
      norRenderCanvas();
    });
  });

  host.querySelectorAll(".terminal-hot").forEach(term=>{
    term.style.touchAction="none";
    term.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault(); e.stopPropagation();
      nor.armed=false; nor.armedHover=null;
      const endpoint=term.dataset.endpoint;
      const from=norEndpointPos(endpoint);
      if(!from) return;
      nor.wiring={from:endpoint,fromPos:from,cursor:from,snap:null};
      norBeginGesture();
      norRenderPalette();
      norRenderCanvas();
    });
  });

  host.querySelectorAll(".junction-hot").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      if(nor.drag||nor.wiring) return;
      nor.selected={type:"junction",id:el.dataset.junction};
      norRenderCanvasToolbar();
      norRenderCanvas();
    });
  });

  host.querySelectorAll(".schem-wire-hit").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      if(nor.drag||nor.wiring) return;
      nor.selected={type:"wire",id:el.dataset.wire};
      norRenderCanvasToolbar();
      norRenderCanvas();
    });
  });

  svgEl.addEventListener("pointermove",e=>{
    if(!nor.armed||nor.drag||nor.wiring) return;
    const pnt=norClientToSvg(e.clientX,e.clientY);
    if(!pnt) return;
    if(!norInsideSheet(pnt)){
      if(nor.armedHover){ nor.armedHover=null; norRenderCanvas(); }
      return;
    }
    const c=norClampPoint(pnt);
    if(!nor.armedHover || nor.armedHover.x!==c.x || nor.armedHover.y!==c.y){
      nor.armedHover=c;
      norRenderCanvas();
    }
  });

  svgEl.addEventListener("click",e=>{
    if(nor.drag||nor.wiring) return;
    if(nor.armed){
      if(e.target.closest("[data-device],[data-endpoint],[data-wire],[data-junction]")) return;
      const pnt=norClientToSvg(e.clientX,e.clientY);
      nor.armed=false; nor.armedHover=null;
      if(norInsideSheet(pnt)) norAddDevice(pnt.x,pnt.y);
      else { norRenderPalette(); norRenderCanvas(); }
      return;
    }
    if(e.target.closest("[data-device],[data-endpoint],[data-wire],[data-junction]")) return;
    if(!nor.selected) return;
    nor.selected=null;
    norRenderCanvasToolbar();
    norRenderCanvas();
  });
}

/* ---- check / feedback / stage progression ---- */
function norShowFeedback(msgs){
  const host=document.getElementById("nor-feedback");
  host.innerHTML="";
  const tags={error:"Fix",warn:"Nudge",success:"Correct",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    d.innerHTML=`<span class="mtag">${tags[mo.s]||""}</span>${mo.t}`;
    host.appendChild(d);
  });
  document.getElementById("nor-feedback-card").style.display="block";
}
function norHideFeedback(){
  document.getElementById("nor-feedback-card").style.display="none";
}

function norCheck(){
  const target=norTarget();
  const rows=norTruthRows(target.inputs,target.fn);

  if(norS().devices.length===0){
    norRenderTargetTable(rows,null);
    norShowFeedback([{s:"info",t:`Drag a ${norPrim().label} gate onto the canvas to get started.`}]);
    return;
  }

  const results=rows.map(row=>{
    const assign={}; target.inputs.forEach(k=>assign[k]=row[k]);
    return norEvaluate(assign);
  });
  const incomplete=results.some(v=>v===undefined);

  if(incomplete){
    norRenderTargetTable(rows,null);
    norShowFeedback([{s:"info",t:`The circuit isn't fully wired yet. Every input needs an unbroken path through ${norPrim().label} gates to Y.`}]);
    return;
  }

  norRenderTargetTable(rows,results);
  const wrong=results.filter((v,i)=>v!==rows[i].Y).length;
  const card=document.getElementById("nor-workspace");

  if(wrong){
    card.classList.remove("is-correct");
    norShowFeedback([{s:"warn",t:`${wrong} row${wrong===1?"":"s"} of the truth table ${wrong===1?"doesn't":"don't"} match yet. See the highlighted cells. ${norTargetHint(target)}`}]);
  } else {
    card.classList.add("is-correct");
    nor.completed.add(nor.stageIndex);
    norRenderStagebar();
    norShowFeedback([{s:"success",t:`Correct. This circuit behaves exactly like ${norArticle(target.label)} ${target.label} gate.`}]);
  }
  norRenderActions();
}

function norRenderActions(){
  const host=document.getElementById("nor-actions");
  const solved=nor.completed.has(nor.stageIndex);
  const isLast=nor.stageIndex===nor.p.stages.length-1;
  const back = nor.stageIndex>0
    ? `<button class="btn ghost" type="button" onclick="norPrevStage()">&larr; Previous gate</button>` : "";
  if(!solved){
    host.innerHTML=`<button class="btn" type="button" onclick="norCheck()">Check circuit</button>
      <button class="btn ghost" type="button" onclick="norResetStage()">Reset</button>${back}`;
  } else if(isLast){
    host.innerHTML=`<button class="btn" type="button" onclick="norExploreMoreProblems()">Explore more problems &rarr;</button>${back}`;
  } else {
    host.innerHTML=`<button class="btn" type="button" onclick="norNextStage()">Next gate &rarr;</button>${back}`;
  }
}

/* Next/Previous/GoStage only switch which stage is active — each stage's own
   canvas (built or not) is preserved independently in nor.stages[i]. */
function norGoStage(i){
  nor.stageIndex=Math.max(0,Math.min(nor.p.stages.length-1,i));
  norEnterStage();
}
function norNextStage(){
  if(!nor.completed.has(nor.stageIndex)) return;
  if(nor.stageIndex>=nor.p.stages.length-1) return;
  norGoStage(nor.stageIndex+1);
}
function norPrevStage(){
  if(nor.stageIndex<=0) return;
  norGoStage(nor.stageIndex-1);
}

function norExploreMoreProblems(){
  const back=document.getElementById("crumb-back-chapter");
  if(back) back.click();
}

/* Delete / Backspace removes the selected item while this solver is open. */
if(!window.__norKeyBound){
  window.__norKeyBound=true;
  window.addEventListener("keydown",e=>{
    if(e.key!=="Delete" && e.key!=="Backspace") return;
    const view=document.getElementById("solver-nor");
    if(!view || view.style.display==="none") return;
    const t=e.target;
    const tag=(t && t.tagName||"").toLowerCase();
    if(tag==="input"||tag==="textarea"||(t && t.isContentEditable)) return;
    if(!nor.selected) return;
    e.preventDefault();
    norDeleteSelected();
  });
}
