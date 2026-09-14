/* ============================================================
   SUM OF CANONICAL PRODUCTS — WIRING
   Given a truth table, a fixed gate-level network is already drawn:
   one NOT gate per variable (producing its complement), one AND gate
   per row where Y=1 (fixed in count and position), and one OR gate
   combining all the AND outputs into Y (AND-to-OR wiring is fixed —
   only the literal-to-AND-input wiring is the exercise). The student
   drags a wire from a variable's true/complement line to an AND
   gate's input pin; any AND gate may implement any of the required
   product terms, in any order — grading is by set comparison, not by
   position. Data-driven, like js/kmap.js: a problem carries
   `variables` and `minterms` (decimal indices of rows where Y=1).
   ============================================================ */
const sop={
  p:null,
  vars:[],
  minterms:[],
  geom:null,
  answer:[],        // per AND gate: {pins:Array(n) of literal key ("A"/"A'") or null}
  checked:false,
  completed:false,
  grade:null,       // set by sopCheck(), used while sop.checked is true
  wiring:null       // {from:literalKey, fromPos, cursor, snap:{gate,pin}|null}
};

function sopComp(v){ return v+"'"; }
function sopIsComp(lit){ return lit.endsWith("'"); }
function sopVarOf(lit){ return sopIsComp(lit) ? lit.slice(0,-1) : lit; }

function sopTruthRows(vars,minterms){
  const n=vars.length, rows=[];
  for(let m=0;m<(1<<n);m++){
    const row={};
    vars.forEach((v,i)=>{ row[v]=(m>>(n-1-i))&1; });
    row.Y=minterms.includes(m)?1:0;
    rows.push(row);
  }
  return rows;
}

/* ---- geometry: every coordinate derives from n (variables) and k (AND gates).
   Variables run top-to-bottom as vertical buses (matching the course's own
   canonical-SOP figures) — each variable is two adjacent vertical lines (true,
   then its complement just to the right), the complement fed by a NOT gate
   near the top. AND gates sit in a column to the right and tap straight
   across into whichever bus height lines up with each of their input pins;
   AND -> OR wiring is fixed, drawn once, and not interactive. ---- */
function sopGeom(p){
  const n=p.variables.length, k=p.minterms.length;
  // Rotated 90°, the NOT glyph's local y-extent (±16, its thickness) becomes its
  // horizontal footprint — so COMP_OFF (true line -> complement line) must clear
  // that 16 on each side, or the triangle visually overlaps the true line it
  // isn't wired to. LANE_W must then clear one variable's complement line plus
  // the next variable's true line.
  const COMP_OFF=34, LANE_W=68, RAIL_X0=28;
  // sopNotGlyph() is a horizontal triangle+bubble (local x: -20 base .. +20 tip .. +29 bubble edge)
  // rotated 90° here, so its local x-extent becomes vertical: NOT_LEAD_END is where the triangle
  // starts and NOT_MID_Y+29 is the bubble's trailing edge (matches COMP_TOP). A short vertical lead
  // (NOT_LEAD) runs from the branch dot down into the triangle, like a normal gate's input wire.
  const LABEL_Y=13, TRUE_TOP=20, BRANCH_Y=52, NOT_LEAD=14,
    NOT_LEAD_END=BRANCH_Y+NOT_LEAD, NOT_MID_Y=NOT_LEAD_END+20, COMP_TOP=NOT_MID_Y+31;
  const AND_HALF_W=22;                        // AND body half-width (flat edge to curve tip)
  const AND_HALF_H=Math.max(20,((n-1)*14+22)/2);
  const AND_GAP=14;
  const AND_SPACING=AND_HALF_H*2+AND_GAP;
  const GATE_TOP=Math.max(COMP_TOP+44,80);
  const OR_GAP=46;
  const OR_HALF_W=34;
  const OR_HALF_H=Math.max(22,((k-1)*14+22)/2);

  const trueX=[], compX=[];
  for(let i=0;i<n;i++){ trueX.push(RAIL_X0+i*LANE_W); compX.push(trueX[i]+COMP_OFF); }
  const GATE_IN_X=(n?compX[n-1]:RAIL_X0)+50;   // x of every AND gate's flat left edge (input pins)
  const railX={};
  p.variables.forEach((v,i)=>{ railX[v]=trueX[i]; railX[sopComp(v)]=compX[i]; });

  const andCenterY=[]; for(let g=0; g<k; g++) andCenterY.push(GATE_TOP+AND_HALF_H+g*AND_SPACING);
  const andBottom=andCenterY.length ? andCenterY[k-1]+AND_HALF_H : GATE_TOP;
  const railBottom=andBottom+20;
  const andOutX=GATE_IN_X+AND_HALF_W*2;

  const pinLocalY=[]; // local y offsets (relative to a gate's own center) for n input pins
  for(let i=0;i<n;i++){
    pinLocalY.push(n===1 ? 0 : -AND_HALF_H+9+i*((AND_HALF_H*2-18)/(n-1)));
  }

  const orBackX=andOutX+OR_GAP;
  const orTipX=orBackX+OR_HALF_W*2;
  const orCenterY=k ? (andCenterY[0]+andCenterY[k-1])/2 : GATE_TOP;
  const orInLocalY=[];
  for(let j=0;j<k;j++){
    orInLocalY.push(k===1 ? 0 : -OR_HALF_H+10+j*((OR_HALF_H*2-20)/(k-1)));
  }

  const W=orTipX+50;
  const H=Math.max(railBottom,orCenterY+OR_HALF_H)+24;

  return {
    n,k,LANE_W,COMP_OFF,RAIL_X0,LABEL_Y,TRUE_TOP,BRANCH_Y,NOT_LEAD_END,NOT_MID_Y,COMP_TOP,railBottom,
    trueX,compX,railX,GATE_IN_X,AND_HALF_W,AND_HALF_H,AND_GAP,AND_SPACING,GATE_TOP,COMB_LEN:16,
    andCenterY,andOutX,pinLocalY,orBackX,orTipX,orCenterY,OR_HALF_W,OR_HALF_H,orInLocalY,W,H
  };
}

function sopPinPos(g,i){
  const geo=sop.geom;
  return {x:geo.GATE_IN_X, y:geo.andCenterY[g]+geo.pinLocalY[i]};
}
function sopAndOutPos(g){ return {x:sop.geom.andOutX, y:sop.geom.andCenterY[g]}; }

/* The OR body's back (input) edge is a single concave cubic bezier — see
   sopOrBodyPath's last "C" segment — from (-44,50) to (-44,-50) via control
   points at x=-29, so it only touches x=-44 right at the top/bottom corners
   and bulges inward (toward larger x) everywhere else. An input line drawn
   straight to x=orBackX (the corner x) would land in empty space for any
   input near the middle, so instead solve the bezier for the exact x at
   that input's y (bisection: the curve's y runs monotonically 50 -> -50). */
function sopOrBackBezier(t){
  const P0=-44,P1=-29,P2=-29,P3=-44, Q0=50,Q1=25,Q2=-25,Q3=-50;
  const mt=1-t;
  const x=mt*mt*mt*P0+3*mt*mt*t*P1+3*mt*t*t*P2+t*t*t*P3;
  const y=mt*mt*mt*Q0+3*mt*mt*t*Q1+3*mt*t*t*Q2+t*t*t*Q3;
  return {x,y};
}
function sopOrBackLocalX(localY){
  let lo=0, hi=1;
  for(let i=0;i<30;i++){
    const mid=(lo+hi)/2;
    if(sopOrBackBezier(mid).y>localY) lo=mid; else hi=mid;
  }
  return sopOrBackBezier((lo+hi)/2).x;
}
function sopOrInPos(j){
  const geo=sop.geom;
  const sx=geo.OR_HALF_W/44, sy=geo.OR_HALF_H/50;
  const localY=geo.orInLocalY[j]/sy;
  const localX=sopOrBackLocalX(localY);
  return {x:(geo.orBackX+geo.OR_HALF_W)+localX*sx, y:geo.orCenterY+geo.orInLocalY[j]};
}

/* ---- gate glyph templates (local coords, centered at 0,0).
   Both are scaled from the exact AND/OR proportions used elsewhere in the
   app (js/gate.js, js/glnet.js): AND's flat lip is 25/35 of its half-width
   before the curve to the tip; OR's back/tip control points are fractions
   of its own 44-unit half-width. Taking halfW as a real parameter (instead
   of hardcoding it) keeps the curve tip — where the output wire starts —
   exactly in sync with andOutX/orTipX, so the wire never starts short,
   inside the body. ---- */
function sopAndBodyPath(halfW,halfH){
  const s=halfW/35, lipX=-10*s;
  return `M ${-halfW} ${-halfH} H ${lipX} C ${20*s} ${-halfH} ${halfW} ${(-halfH/2).toFixed(1)} ${halfW} 0 `+
         `C ${halfW} ${(halfH/2).toFixed(1)} ${20*s} ${halfH} ${lipX} ${halfH} H ${-halfW} Z`;
}
function sopOrBodyPath(halfW,halfH){
  const sx=halfW/44, sy=halfH/50, y=v=>(v*sy).toFixed(1), x=v=>(v*sx).toFixed(1);
  return `M ${x(-44)} ${y(-50)} C ${x(-14)} ${y(-50)} ${x(11)} ${y(-40)} ${x(28)} ${y(-22)} `+
         `C ${x(38)} ${y(-12)} ${x(44)} ${y(-6)} ${x(44)} 0 C ${x(44)} ${y(6)} ${x(38)} ${y(12)} ${x(28)} ${y(22)} `+
         `C ${x(11)} ${y(40)} ${x(-14)} ${y(50)} ${x(-44)} ${y(50)} C ${x(-29)} ${y(25)} ${x(-29)} ${y(-25)} ${x(-44)} ${y(-50)} Z`;
}
function sopNotGlyph(){
  return `<path class="gate-symbol" d="M -20 -16 L 20 0 L -20 16 Z"/><circle class="gate-symbol" cx="25" cy="0" r="4"/>`;
}

/* ---- build / reset ---- */
function buildSop(p){
  sop.p=p;
  sop.vars=p.variables;
  sop.minterms=p.minterms;
  sop.geom=sopGeom(p);
  sop.answer=p.minterms.map(()=>({pins:Array(p.variables.length).fill(null)}));
  sop.checked=false;
  sop.completed=false;
  sop.grade=null;
  sop.wiring=null;
  document.getElementById("sop-workspace").classList.remove("is-correct");
  document.getElementById("sop-actions").style.display="flex";
  document.getElementById("sop-complete-actions").style.display="none";
  document.getElementById("sop-feedback-card").style.display="none";
  sopRenderTable();
  sopRenderCanvas();
}

function sopReset(){
  sop.answer=sop.minterms.map(()=>({pins:Array(sop.vars.length).fill(null)}));
  sopInvalidate();
}

function sopInvalidate(){
  sop.checked=false;
  sop.completed=false;
  document.getElementById("sop-workspace").classList.remove("is-correct");
  document.getElementById("sop-actions").style.display="flex";
  document.getElementById("sop-complete-actions").style.display="none";
  document.getElementById("sop-feedback-card").style.display="none";
  sopRenderCanvas();
}

/* ---- truth table (given, read-only reference) ---- */
function sopRenderTable(){
  const rows=sopTruthRows(sop.vars,sop.minterms);
  const head=[...sop.vars.map(v=>`<th>${v}</th>`),`<th>Y</th>`].join("");
  const body=rows.map(row=>{
    const cells=sop.vars.map(v=>`<td>${row[v]}</td>`).join("");
    return `<tr>${cells}<td>${row.Y}</td></tr>`;
  }).join("");
  document.getElementById("sop-table").innerHTML=
    `<table class="match-truth-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* ---- grading: per-gate derived minterm (or null if not fully/validly wired) ---- */
function sopGateMinterm(gateAns){
  const n=sop.vars.length;
  const bitFor={};
  for(let i=0;i<n;i++){
    const lit=gateAns.pins[i];
    if(lit==null) return null;
    const v=sopVarOf(lit);
    if(bitFor[v]!==undefined) return null; // same variable wired twice
    bitFor[v]=sopIsComp(lit)?0:1;
  }
  let m=0;
  sop.vars.forEach(v=>{ m=(m<<1)|bitFor[v]; });
  return m;
}
function sopGrade(){
  const req=sop.minterms;
  const derived=sop.answer.map(sopGateMinterm);
  const counts={};
  derived.forEach(v=>{ if(v!=null) counts[v]=(counts[v]||0)+1; });
  let incomplete=0, wrong=0, duplicate=0;
  derived.forEach(v=>{
    if(v==null){ incomplete++; return; }
    if(!req.includes(v)){ wrong++; return; }
    if(counts[v]>1) duplicate++;
  });
  const missing=req.filter(r=>!derived.includes(r)).length;
  const correct=incomplete===0 && wrong===0 && duplicate===0 && missing===0;
  return {derived,counts,incomplete,wrong,duplicate,missing,correct};
}

function sopMark(g){
  if(!sop.checked) return "";
  const v=sop.grade.derived[g];
  if(v==null) return "";
  const ok=sop.minterms.includes(v) && sop.grade.counts[v]===1;
  return ok?" mark-good":" mark-bad";
}

/* ---- canvas render ---- */
function sopRenderCanvas(){
  const geo=sop.geom, n=geo.n, k=geo.k;
  const snap=sop.wiring && sop.wiring.snap;
  const isSnapPin=(g,i)=>snap && snap.kind==="pin" && snap.gate===g && snap.pin===i;

  let svg=`<svg class="schem-svg sop-svg" viewBox="0 0 ${geo.W} ${geo.H}" width="${geo.W}" height="${geo.H}" xmlns="http://www.w3.org/2000/svg">`;

  // variable buses: true line runs full height, uninterrupted; a stub near
  // the top branches off through a NOT gate (rotated to point downward) to
  // produce a second, parallel complement line alongside it.
  sop.p.variables.forEach((v,i)=>{
    const tx=geo.trueX[i], cx=geo.compX[i];
    svg+=`<path class="gate-wire" d="M ${tx} ${geo.TRUE_TOP} V ${geo.railBottom}"/>`;
    svg+=`<path class="gate-wire" d="M ${tx} ${geo.BRANCH_Y} H ${cx} V ${geo.NOT_LEAD_END}"/>`;
    svg+=`<circle class="sop-tap-dot" cx="${tx}" cy="${geo.BRANCH_Y}" r="3"/>`;
    svg+=`<g transform="translate(${cx},${geo.NOT_MID_Y}) rotate(90)">${sopNotGlyph()}</g>`;
    svg+=`<path class="gate-wire" d="M ${cx} ${geo.COMP_TOP} V ${geo.railBottom}"/>`;
    svg+=`<text class="gate-label" x="${tx}" y="${geo.LABEL_Y}" text-anchor="middle">${v}</text>`;
    svg+=`<rect class="sop-rail-hit" data-rail="${v}" x="${tx-7}" y="${geo.TRUE_TOP}" width="14" height="${geo.railBottom-geo.TRUE_TOP}"/>`;
    svg+=`<rect class="sop-rail-hit" data-rail="${sopComp(v)}" x="${cx-7}" y="${geo.COMP_TOP}" width="14" height="${geo.railBottom-geo.COMP_TOP}"/>`;
  });

  // literal-to-AND wiring (interactive) + AND bodies + pins, one <g> per gate for check-mark styling.
  // A pin's connection is marked by a single dot right on the bus line's own
  // border (where the wire actually branches off A/B/C), not by a second dot
  // at the gate; an unwired pin is just a plain stub, like the blank figure.
  for(let g=0; g<k; g++){
    const cy=geo.andCenterY[g];
    svg+=`<g class="sop-and-group${sopMark(g)}">`;
    for(let i=0;i<n;i++){
      const lit=sop.answer[g].pins[i];
      const pin=sopPinPos(g,i);
      if(lit==null){
        svg+=`<path class="gate-wire" d="M ${pin.x-geo.COMB_LEN} ${pin.y} H ${pin.x}"/>`;
        svg+=`<circle class="terminal" cx="${pin.x-geo.COMB_LEN}" cy="${pin.y}" r="3.6"/>`;
      } else {
        const rx=geo.railX[lit];
        svg+=`<path class="sop-wire" d="M ${rx} ${pin.y} H ${pin.x}"/>`;
        svg+=`<circle class="sop-tap-dot" cx="${rx}" cy="${pin.y}" r="3"/>`;
      }
      if(isSnapPin(g,i)) svg+=`<circle class="sop-snap-dot" cx="${pin.x}" cy="${pin.y}" r="4.5"/>`;
    }
    svg+=`<path class="gate-symbol" transform="translate(${geo.GATE_IN_X+geo.AND_HALF_W},${cy})" d="${sopAndBodyPath(geo.AND_HALF_W,geo.AND_HALF_H)}"/>`;
    for(let i=0;i<n;i++){
      const pin=sopPinPos(g,i);
      const lit=sop.answer[g].pins[i];
      // Hit target sits right on the visible dot: the outer stub tip when
      // empty (that's the only dot drawn then), the gate edge once wired.
      const hx = lit==null ? pin.x-geo.COMB_LEN : pin.x;
      svg+=`<circle class="terminal-hot" data-gate="${g}" data-pin="${i}" cx="${hx}" cy="${pin.y}" r="7.5"/>`;
    }
    svg+=`</g>`;
  }

  // fixed AND -> OR wiring (given, not interactive) + OR body + Y output
  for(let g=0; g<k; g++){
    const out=sopAndOutPos(g), into=sopOrInPos(g);
    svg+=`<path class="gate-wire" d="M ${out.x} ${out.y} C ${(out.x+into.x)/2} ${out.y} ${(out.x+into.x)/2} ${into.y} ${into.x} ${into.y}"/>`;
  }
  svg+=`<path class="gate-symbol" transform="translate(${geo.orBackX+geo.OR_HALF_W},${geo.orCenterY})" d="${sopOrBodyPath(geo.OR_HALF_W,geo.OR_HALF_H)}"/>`;
  svg+=`<path class="gate-wire" d="M ${geo.orTipX} ${geo.orCenterY} H ${geo.W-20}"/>`;
  svg+=`<text class="gate-label" x="${geo.W-16}" y="${geo.orCenterY+5}" text-anchor="start">Y</text>`;

  // live wiring preview — a drag can start from a rail (dragging to a pin) or,
  // symmetrically, from an empty pin's own dot (dragging out to a rail).
  if(sop.wiring){
    const w=sop.wiring;
    if(w.snap){
      const pin = w.fromKind==="rail" ? sopPinPos(w.snap.gate,w.snap.pin) : sopPinPos(w.gate,w.pin);
      const rx = w.fromKind==="rail" ? geo.railX[w.railKey] : geo.railX[w.snap.key];
      svg+=`<path class="schem-preview" d="M ${rx} ${pin.y} H ${pin.x}"/>`;
      svg+=`<circle class="sop-snap-dot" cx="${w.fromKind==="rail"?pin.x:rx}" cy="${pin.y}" r="4.5"/>`;
    } else {
      const from=sop.wiring.fromPos, c=sop.wiring.cursor;
      svg+=`<path class="schem-preview" d="M ${from.x} ${from.y} L ${c.x} ${c.y}"/>`;
    }
  }

  svg+=`</svg>`;

  const host=document.getElementById("sop-canvas");
  host.innerHTML=svg;
  const svgEl=host.querySelector("svg");
  if(!svgEl) return;

  svgEl.querySelectorAll(".sop-rail-hit").forEach(el=>{
    el.style.touchAction="none";
    el.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      const pnt=sopClientToSvg(e.clientX,e.clientY);
      if(!pnt) return;
      const key=el.dataset.rail;
      const rx=sop.geom.railX[key];
      sop.wiring={fromKind:"rail", railKey:key, fromPos:{x:rx,y:pnt.y}, cursor:{x:rx,y:pnt.y}, snap:null};
      sopBeginGesture();
      sopRenderCanvas();
    });
  });

  svgEl.querySelectorAll(".terminal-hot").forEach(el=>{
    el.style.touchAction="none";
    el.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      const g=+el.dataset.gate, i=+el.dataset.pin;
      if(sop.answer[g].pins[i]!=null){
        e.preventDefault(); e.stopPropagation();
        sop.answer[g].pins[i]=null;
        sopInvalidate();
      } else {
        e.preventDefault(); e.stopPropagation();
        const pin=sopPinPos(g,i);
        sop.wiring={fromKind:"pin", gate:g, pin:i, fromPos:pin, cursor:pin, snap:null};
        sopBeginGesture();
        sopRenderCanvas();
      }
    });
  });

  sopRenderToolbar();
}

function sopRenderToolbar(){
  const total=sop.geom.k*sop.geom.n;
  const filled=sop.answer.reduce((sum,g)=>sum+g.pins.filter(x=>x!=null).length,0);
  document.getElementById("sop-canvas-toolbar").innerHTML=
    `<div class="schem-status">${filled}/${total} pins wired. Drag from a literal's line to an empty AND-gate pin; click a wired pin to remove it.</div>`;
}

/* ---- pointer-gesture plumbing (rail -> pin drag only; no placement/move) ---- */
let sopGestureHandlers=null;
function sopRemoveGestureListeners(){
  if(sopGestureHandlers){
    window.removeEventListener("pointermove",sopGestureHandlers.move);
    window.removeEventListener("pointerup",sopGestureHandlers.up);
    window.removeEventListener("pointercancel",sopGestureHandlers.up);
    sopGestureHandlers=null;
  }
}
function sopBeginGesture(){
  sopRemoveGestureListeners();
  const move=e=>sopGestureMove(e);
  const up=e=>sopGestureUp(e);
  sopGestureHandlers={move,up};
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
  window.addEventListener("pointercancel",up);
}
function sopClientToSvg(clientX,clientY){
  const svgEl=document.querySelector("#sop-canvas svg");
  if(!svgEl||!svgEl.getScreenCTM) return null;
  const m=svgEl.getScreenCTM();
  if(!m) return null;
  const pt=svgEl.createSVGPoint();
  pt.x=clientX; pt.y=clientY;
  const p=pt.matrixTransform(m.inverse());
  return {x:p.x,y:p.y};
}
function sopNearestPin(point,radius=26){
  let best=null,bestD=radius;
  for(let g=0;g<sop.geom.k;g++){
    for(let i=0;i<sop.geom.n;i++){
      const pos=sopPinPos(g,i);
      const d=Math.hypot(pos.x-point.x,pos.y-point.y);
      if(d<=bestD){ bestD=d; best={kind:"pin",gate:g,pin:i}; }
    }
  }
  return best;
}
/* A rail is a vertical run, not a point, so "nearest" clamps to its own
   y-span before measuring distance — used when dragging out from a pin's
   own dot instead of starting from the rail. */
function sopNearestRail(point,radius=26){
  const geo=sop.geom;
  let best=null,bestD=radius;
  sop.p.variables.forEach((v,i)=>{
    [[v,geo.trueX[i],geo.TRUE_TOP],[sopComp(v),geo.compX[i],geo.COMP_TOP]].forEach(([key,x,yTop])=>{
      const cy=Math.max(yTop,Math.min(geo.railBottom,point.y));
      const d=Math.hypot(x-point.x,cy-point.y);
      if(d<=bestD){ bestD=d; best={kind:"rail",key}; }
    });
  });
  return best;
}
function sopGestureMove(e){
  if(!sop.wiring) return;
  const pnt=sopClientToSvg(e.clientX,e.clientY);
  if(!pnt) return;
  sop.wiring.snap = sop.wiring.fromKind==="rail" ? sopNearestPin(pnt) : sopNearestRail(pnt);
  sop.wiring.cursor=pnt;
  sopRenderCanvas();
}
function sopGestureUp(e){
  const wiring=sop.wiring;
  sopRemoveGestureListeners();
  sop.wiring=null;
  if(!wiring) return;
  if(wiring.snap){
    if(wiring.fromKind==="rail") sop.answer[wiring.snap.gate].pins[wiring.snap.pin]=wiring.railKey;
    else sop.answer[wiring.gate].pins[wiring.pin]=wiring.snap.key;
    sopInvalidate();
  } else {
    sopRenderCanvas();
  }
}

/* ---- check / feedback ---- */
function sopShowFeedback(msgs){
  const host=document.getElementById("sop-feedback");
  host.innerHTML="";
  const tags={error:"Fix",warn:"Nudge",success:"Correct",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    d.innerHTML=`<span class="mtag">${tags[mo.s]||""}</span>${mo.t}`;
    host.appendChild(d);
  });
  document.getElementById("sop-feedback-card").style.display="block";
}

function sopCheck(){
  const g=sopGrade();
  sop.checked=true;
  sop.grade=g;
  const msgs=[];

  if(g.incomplete){
    msgs.push({s:"info",t:`${g.incomplete} AND gate${g.incomplete===1?" isn't":"s aren't"} fully wired yet — every gate needs exactly one literal (the variable or its complement) on each input, covering every variable once.`});
  } else if(g.duplicate){
    msgs.push({s:"warn",t:`Two AND gates are wired to the same product term — each row where Y=1 should be covered exactly once, by exactly one gate.`});
  } else if(g.wrong){
    msgs.push({s:"warn",t:`${g.wrong} AND gate${g.wrong===1?" doesn't":"s don't"} match any row where Y=1 — check the truth table row that gate should implement, then use the true line for a 1 and the complement line for a 0.`});
  } else if(g.missing){
    msgs.push({s:"warn",t:`${g.missing} row${g.missing===1?"":"s"} where Y=1 ${g.missing===1?"isn't":"aren't"} covered by any AND gate yet.`});
  }

  sop.completed=g.correct;
  document.getElementById("sop-workspace").classList.toggle("is-correct",g.correct);
  document.getElementById("sop-actions").style.display=g.correct?"none":"flex";
  document.getElementById("sop-complete-actions").style.display=g.correct?"flex":"none";

  if(g.correct) msgs.push({s:"success",t:"Correct — every AND gate implements one canonical product term, and together they sum to exactly the given truth table."});

  sopRenderCanvas();
  sopShowFeedback(msgs);
}

function sopExploreMoreProblems(){
  const back=document.getElementById("crumb-back-chapter");
  if(back) back.click();
}
