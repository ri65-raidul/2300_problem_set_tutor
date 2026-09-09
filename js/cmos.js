/* ============================================================
   CMOS PROBLEM TYPE  —  builder + simulation + table + feedback
   (Claude-maintained; add problems via the data list at the top)

   Interaction model (unified pointer input; works for mouse + touch):
     • Drag PMOS / NMOS from the palette onto the sheet — OR click one to
       arm it, then click a spot on the sheet to drop it there.
       A snapped ghost shows exactly where it will land.
     • Drag a transistor body to reposition it (purely cosmetic — never
       changes the circuit or clears your answer).
     • Drag from any terminal to another terminal, onto an existing wire,
       or onto ANY point along the VDD / Vy rail to connect. A live
       preview + snap highlight shows the target.
     • With a transistor selected, tap PMOS / NMOS to change its type.
     • Tap a wire / junction to select it; Delete (button or key) removes it.
   All gestures run through window-level listeners so the canvas can freely
   re-render mid-drag without dropping the gesture. The toolbar keeps a
   constant height so selecting a transistor never shifts or rescales the
   diagram.
   ============================================================ */
const cmos = {
  p:null,
  devices:[],
  wires:[],
  junctions:[],          // {id,x,y[,rail]}  rail-tagged junctions sit on a rail net
  nextTrans:0,
  selected:null,         // {type:"device"|"wire"|"junction", id}
  tool:{kind:"pmos", gate:"Va"},
  armed:null,            // "pmos" | "nmos" | null   (click-to-place mode)
  armedHover:null,       // {x,y} snapped ghost position while armed
  table:[],
  verdict:null,
  buildPassed:false,     // last Build check was correct (enables "Continue")
  simUnlocked:false,     // student has moved on: the Simulate stage is revealed
  questionWasVisible:false,
  drag:null,             // {mode:"place"|"move", ...}
  wiring:null            // {from, fromRail, fromPos, cursor, snap}
};

/* -- simulation helpers -- */
function transOn(t, assign){
  const g=assign[t.gate];
  return t.kind==="pmos" ? g===0 : g===3.3;
}

function seriesConduct(list, assign){
  return list.length>0 && list.every(t=>transOn(t,assign));
}

function givenTransistors(net){
  if(net.branches) return net.branches.flat();
  return net.transistors || [];
}

function networkConduct(net, assign){
  if(net.structure==="series") return seriesConduct(givenTransistors(net), assign);
  if(net.structure==="parallelBranches") return net.branches.some(branch=>seriesConduct(branch, assign));
  return givenTransistors(net).some(t=>transOn(t,assign));
}

function cmosInputRows(p){
  const ins=p.inputs, n=ins.length, out=[];
  for(let m=0;m<(1<<n);m++){
    const a={};
    for(let k=0;k<n;k++) a[ins[k]]=((m>>(n-1-k))&1)?3.3:0;
    out.push(a);
  }
  return out;
}

function placedPullup(){
  return cmos.devices.map(d=>({t:d,name:d.name,id:d.id}));
}

function endpointIdsForDevice(d){
  return [`${d.id}:top`,`${d.id}:bottom`];
}

function endpointPosition(id){
  const g=cmosGeom();
  if(id==="VDD") return {x:g.cx,y:g.vddY};
  if(id==="VY")  return {x:g.cx,y:g.vyY};
  if(id==="GND") return {x:g.cx,y:g.gndY};

  if(id.startsWith("j")){
    const j=cmos.junctions.find(x=>x.id===id);
    return j ? {x:j.x,y:j.y} : null;
  }

  const [devId,term]=id.split(":");
  const d=cmos.devices.find(x=>x.id===devId);
  if(!d) return null;
  return {x:d.x,y:d.y+(term==="top"?-22:22)};
}

function cmosGeom(){
  const W=430;
  const cx=W/2;
  const vddY=28;

  if(cmos.p && cmos.p.build==="pulldown"){
    const vyY=220;
    const workTop=258;
    const workBottom=438;
    const gndY=470;
    return {W,cx,vddY,workTop,workBottom,vyY,gndY};
  }

  const workTop=58;
  const workBottom=238;
  const vyY=270;
  const gndY=500;
  return {W,cx,vddY,workTop,workBottom,vyY,gndY};
}

/* Rails the student may connect to for the current build. */
function railsForBuild(){
  const g=cmosGeom();
  if(cmos.p && cmos.p.build==="pulldown") return [{id:"VY",y:g.vyY}];
  return [{id:"VDD",y:g.vddY},{id:"VY",y:g.vyY}];
}

function unionFindEndpoints(){
  const ids=["VDD","VY"];
  cmos.devices.forEach(d=>ids.push(...endpointIdsForDevice(d)));

  const parent=Object.fromEntries(ids.map(id=>[id,id]));

  function find(x){
    if(parent[x]!==x) parent[x]=find(parent[x]);
    return parent[x];
  }
  function unite(a,b){
    if(!(a in parent) || !(b in parent)) return;
    const ra=find(a), rb=find(b);
    if(ra!==rb) parent[rb]=ra;
  }

  cmos.wires.forEach(w=>unite(w.a,w.b));
  return {find,unite,parent};
}

function builtNetworkConduct(assign){
  if(!cmos.devices.length) return false;

  const source = cmos.p.build==="pulldown" ? "VY" : "VDD";
  const sink   = cmos.p.build==="pulldown" ? "GND" : "VY";
  const ids=[source,sink];
  cmos.devices.forEach(d=>ids.push(...endpointIdsForDevice(d)));
  cmos.junctions.forEach(j=>ids.push(j.id));

  const parent=Object.fromEntries(ids.map(id=>[id,id]));
  function find(x){
    if(parent[x]!==x) parent[x]=find(parent[x]);
    return parent[x];
  }
  function unite(a,b){
    if(!(a in parent) || !(b in parent)) return;
    const ra=find(a), rb=find(b);
    if(ra!==rb) parent[rb]=ra;
  }

  cmos.wires.forEach(w=>unite(w.a,w.b));

  // Rail-tagged junctions belong to their rail's electrical net.
  cmos.junctions.forEach(j=>{ if(j.rail) unite(j.id,j.rail); });

  cmos.devices.forEach(d=>{
    if(transOn(d,assign)) unite(`${d.id}:top`,`${d.id}:bottom`);
  });

  return find(source)===find(sink);
}

function simRow(p,assign){
  const built=builtNetworkConduct(assign);
  const given=networkConduct(p.given,assign);

  const up = p.build==="pulldown" ? given : built;
  const dn = p.build==="pulldown" ? built : given;

  const vy=up&&!dn ? 3.3 : (dn&&!up ? 0 : (up&&dn ? "SHORT":"FLOAT"));
  return {up,dn,vy};
}

function fmtV(v){
  return v===3.3 ? "3.3V" : v===0 ? "0V" : v;
}

/* -- transistor glyph (schematic) -- */
function glyph(cx, cy, t, name){
  const pmos=t.kind==="pmos";
  const channelX=cx-5;          // small inward step, like the course schematic style
  const gatePlateX=channelX-9;
  const leadX=cx-35;

  let s=`<g class="tsym">`;

  // Source/drain leads with a short inward "indent" into the channel.
  s+=`<path class="term" d="M ${cx} ${cy-20} L ${cx} ${cy-11} L ${channelX} ${cy-11}"/>`;
  s+=`<path class="term" d="M ${channelX} ${cy+11} L ${cx} ${cy+11} L ${cx} ${cy+20}"/>`;

  // Channel and isolated gate plate.
  s+=`<line x1="${channelX}" y1="${cy-11}" x2="${channelX}" y2="${cy+11}"/>`;
  s+=`<line x1="${gatePlateX}" y1="${cy-10}" x2="${gatePlateX}" y2="${cy+10}"/>`;

  // Gate connection; PMOS gets the inversion bubble.
  if(pmos){
    s+=`<line x1="${leadX}" y1="${cy}" x2="${gatePlateX-7}" y2="${cy}"/>`;
    s+=`<circle cx="${gatePlateX-3.5}" cy="${cy}" r="3.5"/>`;
  }else{
    s+=`<line x1="${leadX}" y1="${cy}" x2="${gatePlateX}" y2="${cy}"/>`;
  }

  if(name!=="") s+=`<text class="tname" x="${cx+8}" y="${cy-12}">${name}</text>`;
  if(t.gate!=="") s+=`<text x="${leadX-4}" y="${cy+3}" text-anchor="end">${t.gate}</text>`;
  s+=`</g>`;
  return s;
}

/* A compact schematic symbol for the palette buttons — same glyph as the
   diagram, so the palette matches the standard exactly. */
function paletteSymbolSvg(kind){
  const w=64,h=48,cx=40,cy=24;
  return `<svg class="palette-glyph" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`+
    glyph(cx,cy,{kind,gate:""},"")+
  `</svg>`;
}

/* One-time CSS augment: palette highlight/press effect, constant status
   height, and rail cursor. Uses existing theme variables. */
function cmosInjectStyles(){
  if(document.getElementById("cmos-inline-augment")) return;
  const st=document.createElement("style");
  st.id="cmos-inline-augment";
  st.textContent=`
    .palette-part{transition:transform .08s ease, border-color .12s ease, box-shadow .12s ease, background .12s ease;}
    .palette-part.pressed{transform:scale(.95);}
    .palette-part.on{border-color:var(--ink);}
    .palette-part.armed{border-color:var(--focus);background:rgba(47,107,255,.10);box-shadow:0 0 0 2px var(--focus) inset;}
    .palette-glyph{display:block;margin:0 auto 2px;}
    .palette-label{display:block;text-align:center;}
    .schem-status{min-height:2.6em;}
    .rail-hot{cursor:crosshair;}
    svg.schem-svg.armed{cursor:crosshair;}
  `;
  document.head.appendChild(st);
}

function buildCmos(p){
  const question=document.getElementById("solve-question");
  cmos.p=p;
  cmos.devices=[];
  cmos.wires=[];
  cmos.junctions=[];
  cmos.nextTrans=0;
  cmos.selected=null;
  cmos.tool={kind:p.build==="pulldown"?"nmos":"pmos",gate:p.inputs[0]};
  cmos.armed=null;
  cmos.armedHover=null;
  cmos.buildPassed=false;
  cmos.simUnlocked=false;
  cmos.questionWasVisible=!!(question && getComputedStyle(question).display!=="none");
  cmos.table=cmosInputRows(p).map(()=>({marks:new Set(),vy:null}));
  cmos.verdict=null;
  cmosCancelGesture();
  cmosInjectStyles();

  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

function selectedDevice(){
  if(!cmos.selected || cmos.selected.type!=="device") return null;
  return cmos.devices.find(d=>d.id===cmos.selected.id) || null;
}

function renderCmosToolbar(){
  const p=cmos.p, host=document.getElementById("cmos-toolbar");
  const d=selectedDevice();
  const activeKind = d ? d.kind : cmos.tool.kind;
  const activeGate = d ? d.gate : cmos.tool.gate;

  const seg=(opts,active)=>`<div class="seg">`+
    opts.map(o=>`<button class="${o.val===active?"on":""}" data-k="${o.key}" data-v="${o.val}" type="button">${o.label}</button>`).join("")+
    `</div>`;

  const part=(kind,label)=>{
    const on = activeKind===kind ? " on" : "";
    const armed = cmos.armed===kind ? " armed" : "";
    return `<div class="palette-part${on}${armed}" data-part="${kind}" style="touch-action:none;" title="Drag onto the sheet, or click then click a spot to place">
        ${paletteSymbolSvg(kind)}
        <span class="palette-label">${label}</span>
      </div>`;
  };

  let status;
  if(d) status=`Editing <b>${d.name}</b> — tap PMOS / NMOS to change its type, drag it to move, Delete to remove.`;
  else if(cmos.armed) status=`Placing a <b>${cmos.armed==="pmos"?"PMOS":"NMOS"}</b> — click a spot on the sheet to drop it.`;
  else status=`No transistor selected.`;

  host.innerHTML=`
    <div class="tool-group">
      <span class="tg-label">Transistor</span>
      <div class="schem-palette">
        ${part("pmos","PMOS")}
        ${part("nmos","NMOS")}
      </div>
    </div>

    <div class="tool-group">
      <span class="tg-label">Gate</span>
      ${seg(p.inputs.map(g=>({key:"gate",val:g,label:g})),activeGate)}
    </div>

    <div class="tool-group">
      <span class="tg-label">&nbsp;</span>
      <div class="schem-actions">
        <button class="btn ghost sm" id="schem-delete" type="button" ${cmos.selected?"":"disabled"}>Delete</button>
        <button class="btn ghost sm" id="schem-clear" type="button" ${cmos.devices.length||cmos.wires.length||cmos.junctions.length?"":"disabled"}>Clear</button>
      </div>
    </div>

    <div class="schem-status">${status}</div>

    <div class="schem-tip">
      Drag <b>PMOS</b> / <b>NMOS</b> onto the sheet — or click one, then click a spot to drop it. Drag from a terminal, or from the <b>VDD</b> / <b>V\u1d67</b> rail, and release on another terminal or anywhere along a rail to connect.
    </div>
  `;

  // Palette: press feedback + start a place gesture. It becomes drag-to-place
  // if the pointer moves onto the sheet, or a click (arm / change type) if it
  // is released without ever entering the sheet.
  host.querySelectorAll(".palette-part").forEach(el=>{
    el.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      el.classList.add("pressed");
      cmos.drag={mode:"place", kind:el.dataset.part, gate:cmos.tool.gate, x:null, y:null, inside:false, everInside:false};
      cmosBeginGesture();
      renderCmosCanvas();
    });
  });

  host.querySelectorAll(".seg button").forEach(b=>{
    b.onclick=()=>{
      const key=b.dataset.k, val=b.dataset.v;
      const sd=selectedDevice();

      if(sd){
        sd[key]=val;
        if(key==="gate") cmos.tool.gate=val;   // keep palette in sync with last choice
      } else {
        cmos.tool[key]=val;
      }

      cmos.verdict=null;
      renderCmosToolbar();
      renderCmosCanvas();
      renderCmosTable();
      cmosHideFeedback();
    };
  });

  const del=document.getElementById("schem-delete");
  if(del) del.onclick=deleteSelectedSchematicItem;

  const clear=document.getElementById("schem-clear");
  if(clear) clear.onclick=clearSchematic;
}

function clearSchematic(){
  cmos.devices=[];
  cmos.wires=[];
  cmos.junctions=[];
  cmos.nextTrans=0;
  cmos.selected=null;
  cmos.armed=null;
  cmos.armedHover=null;
  cmos.table=cmosInputRows(cmos.p).map(()=>({marks:new Set(),vy:null}));
  cmos.verdict=null;
  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

function deleteSelectedSchematicItem(){
  if(!cmos.selected) return;

  if(cmos.selected.type==="device"){
    const id=cmos.selected.id;
    cmos.devices=cmos.devices.filter(d=>d.id!==id);
    cmos.wires=cmos.wires.filter(w=>!w.a.startsWith(id+":") && !w.b.startsWith(id+":"));
  } else if(cmos.selected.type==="wire"){
    cmos.wires=cmos.wires.filter(w=>w.id!==cmos.selected.id);
  } else if(cmos.selected.type==="junction"){
    const id=cmos.selected.id;
    cmos.wires=cmos.wires.filter(w=>w.a!==id && w.b!==id);
    cmos.junctions=cmos.junctions.filter(j=>j.id!==id);
  }

  cmos.selected=null;
  cmos.verdict=null;
  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

function snapGrid(v,step=10){
  return Math.round(v/step)*step;
}

function addSchematicDevice(kind,gate,x,y){
  const g=cmosGeom();

  // LTspice-like placement: parts land on a subtle drafting grid.
  x=snapGrid(Math.max(55,Math.min(g.W-55,x)));
  y=snapGrid(Math.max(g.workTop+26,Math.min(g.workBottom-26,y)));

  // Remember the student's latest palette choices.
  cmos.tool.kind=kind;
  cmos.tool.gate=gate;

  const id="d"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const d={
    id,
    name:(cmos.p.build==="pulldown"?"N":"P")+(cmos.nextTrans++),
    kind,
    gate,
    x,
    y
  };

  cmos.devices.push(d);

  // Do not auto-select a newly placed transistor — keeps the controls aimed
  // at the NEXT transistor the student will place.
  cmos.selected=null;
  cmos.verdict=null;

  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

function wireExists(a,b){
  return cmos.wires.some(w=>(w.a===a&&w.b===b)||(w.a===b&&w.b===a));
}

function addWire(a,b){
  if(!a || !b || a===b || wireExists(a,b)) return;
  cmos.wires.push({
    id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    a,b
  });
  cmos.verdict=null;
  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

/* Reuse a nearby rail junction if one already sits at this spot, else make one. */
function createRailJunction(railId,point){
  const g=cmosGeom();
  const y = railId==="VDD"?g.vddY : railId==="VY"?g.vyY : g.gndY;
  const x = snapGrid(Math.max(45,Math.min(g.W-45, point?point.x:g.cx)));

  const existing=cmos.junctions.find(j=>j.rail===railId && Math.abs(j.x-x)<=6);
  if(existing) return existing.id;

  const id="j"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  cmos.junctions.push({id,x,y,rail:railId});
  return id;
}

function createJunctionOnWire(wireId,point){
  const w=cmos.wires.find(x=>x.id===wireId);
  if(!w) return null;

  const hit=nearestPointOnWire(w,point);
  if(!hit) return null;

  const aPos=endpointPosition(w.a), bPos=endpointPosition(w.b);
  if(!aPos || !bPos) return null;

  // Avoid creating a junction almost on top of an existing endpoint.
  if(Math.hypot(hit.x-aPos.x,hit.y-aPos.y)<12) return w.a;
  if(Math.hypot(hit.x-bPos.x,hit.y-bPos.y)<12) return w.b;

  const id="j"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  cmos.junctions.push({id,x:hit.x,y:hit.y});

  cmos.wires=cmos.wires.filter(x=>x.id!==wireId);
  cmos.wires.push(
    {id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a:w.a,b:id},
    {id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),a:id,b:w.b}
  );

  return id;
}

function connectEndpointToWire(endpoint,wireId,point){
  const junctionId=createJunctionOnWire(wireId,point);
  if(!junctionId || junctionId===endpoint) return;

  if(!wireExists(endpoint,junctionId)){
    cmos.wires.push({
      id:"w"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      a:endpoint,
      b:junctionId
    });
  }

  cmos.verdict=null;
  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  cmosHideFeedback();
}

function orthogonalPoints(a,b){
  if(!a || !b) return [];

  if(Math.abs(a.x-b.x)<2 || Math.abs(a.y-b.y)<2){
    return [a,b];
  }

  const midY=snapGrid((a.y+b.y)/2,10);
  return [
    a,
    {x:a.x,y:midY},
    {x:b.x,y:midY},
    b
  ];
}

function orthogonalPath(a,b){
  const pts=orthogonalPoints(a,b);
  if(!pts.length) return "";
  return pts.map((p,i)=>`${i?"L":"M"} ${p.x} ${p.y}`).join(" ");
}

function nearestPointOnSegment(p,a,b){
  const vx=b.x-a.x, vy=b.y-a.y;
  const len2=vx*vx+vy*vy;
  if(len2===0) return {x:a.x,y:a.y,d:Math.hypot(p.x-a.x,p.y-a.y)};

  let t=((p.x-a.x)*vx+(p.y-a.y)*vy)/len2;
  t=Math.max(0,Math.min(1,t));

  const x=a.x+t*vx, y=a.y+t*vy;
  return {x,y,d:Math.hypot(p.x-x,p.y-y)};
}

function nearestPointOnWire(w,p){
  const a=endpointPosition(w.a), b=endpointPosition(w.b);
  if(!a || !b) return null;

  const pts=orthogonalPoints(a,b);
  let best=null;

  for(let i=0;i<pts.length-1;i++){
    const q=nearestPointOnSegment(p,pts[i],pts[i+1]);
    if(!best || q.d<best.d) best={...q,seg:i};
  }

  if(!best) return null;

  const p0=pts[best.seg], p1=pts[best.seg+1];
  if(Math.abs(p0.x-p1.x)<2){
    best.x=p0.x;
    best.y=snapGrid(best.y,10);
  } else {
    best.y=p0.y;
    best.x=snapGrid(best.x,10);
  }

  return best;
}

function nearestWire(point,excludeWireId=null,radius=20){
  let best=null;

  cmos.wires.forEach(w=>{
    if(w.id===excludeWireId) return;
    const hit=nearestPointOnWire(w,point);
    if(!hit || hit.d>radius) return;
    if(!best || hit.d<best.d) best={wire:w,...hit};
  });

  return best;
}

/* Nearest point along a connectable rail (VDD / Vy). */
function nearestRail(point,radius=22){
  const g=cmosGeom();
  let best=null;
  railsForBuild().forEach(r=>{
    if(point.x < 45-radius || point.x > g.W-45+radius) return;
    const d=Math.abs(point.y-r.y);
    if(d<=radius && (!best || d<best.d)){
      best={id:r.id,d,point:{x:snapGrid(Math.max(45,Math.min(g.W-45,point.x))),y:r.y}};
    }
  });
  return best;
}

function allSchematicEndpoints(){
  // VDD / Vy are handled as rails (connect anywhere along the line), so they
  // are NOT point endpoints here. GND (pull-down) stays a single point.
  const ids = cmos.p.build==="pulldown" ? ["GND"] : [];
  cmos.devices.forEach(d=>ids.push(`${d.id}:top`,`${d.id}:bottom`));
  cmos.junctions.forEach(j=>ids.push(j.id));
  return ids
    .map(id=>({id,pos:endpointPosition(id)}))
    .filter(x=>x.pos);
}

function nearestEndpoint(point,excludeId=null,radius=28){
  let best=null;
  let bestD=radius;

  allSchematicEndpoints().forEach(ep=>{
    if(ep.id===excludeId) return;
    const dx=ep.pos.x-point.x;
    const dy=ep.pos.y-point.y;
    const d=Math.hypot(dx,dy);

    if(d<=bestD){
      bestD=d;
      best=ep;
    }
  });

  return best;
}

function groundSvg(x,y){
  return `
    <line class="rail" x1="${x-16}" y1="${y-14}" x2="${x+16}" y2="${y-14}"/>
    <line class="rail" x1="${x-10}" y1="${y-8}" x2="${x+10}" y2="${y-8}"/>
    <line class="rail" x1="${x-4}" y1="${y-2}" x2="${x+4}" y2="${y-2}"/>
  `;
}

function renderGivenPullDown(p,centerX,vyY){
  const net=p.given;
  const given=givenTransistors(net);
  const cellH=56;
  let svg="";

  if(net.structure==="parallelBranches"){
    const branches=net.branches;
    const maxLen=Math.max(...branches.map(b=>b.length));
    const spacing=76;
    const width=(branches.length-1)*spacing;
    const xs=branches.map((_,i)=>centerX-width/2+i*spacing);
    const topBusY=vyY+22;
    const firstY=vyY+52;
    const bottomBusY=firstY+(maxLen-1)*cellH+38;
    const gndY=bottomBusY+34;

    svg+=`<line class="wire" x1="${centerX}" y1="${vyY}" x2="${centerX}" y2="${topBusY}"/>`;
    svg+=`<line class="wire" x1="${xs[0]}" y1="${topBusY}" x2="${xs[xs.length-1]}" y2="${topBusY}"/>`;

    branches.forEach((branch,bi)=>{
      const x=xs[bi];
      const offset=((maxLen-branch.length)*cellH)/2;
      const ys=branch.map((_,i)=>firstY+offset+i*cellH);

      svg+=`<line class="wire" x1="${x}" y1="${topBusY}" x2="${x}" y2="${ys[0]-20}"/>`;

      branch.forEach((t,i)=>{
        svg+=glyph(x,ys[i],t,t.name);
        if(i<branch.length-1){
          svg+=`<line class="wire" x1="${x}" y1="${ys[i]+20}" x2="${x}" y2="${ys[i+1]-20}"/>`;
        }
      });

      svg+=`<line class="wire" x1="${x}" y1="${ys[ys.length-1]+20}" x2="${x}" y2="${bottomBusY}"/>`;
    });

    svg+=`<line class="wire" x1="${xs[0]}" y1="${bottomBusY}" x2="${xs[xs.length-1]}" y2="${bottomBusY}"/>`;
    svg+=`<line class="wire" x1="${centerX}" y1="${bottomBusY}" x2="${centerX}" y2="${gndY-14}"/>`;
    svg+=groundSvg(centerX,gndY);
    return {svg,h:gndY-vyY+10};
  }

  const ys=given.map((_,i)=>vyY+44+i*cellH);
  const gndY=ys[ys.length-1]+46;

  svg+=`<line class="wire" x1="${centerX}" y1="${vyY}" x2="${centerX}" y2="${ys[0]-20}"/>`;
  given.forEach((t,i)=>{
    svg+=glyph(centerX,ys[i],t,t.name);
    if(i<given.length-1){
      svg+=`<line class="wire" x1="${centerX}" y1="${ys[i]+20}" x2="${centerX}" y2="${ys[i+1]-20}"/>`;
    }
  });

  svg+=`<line class="wire" x1="${centerX}" y1="${ys[ys.length-1]+20}" x2="${centerX}" y2="${gndY-14}"/>`;
  svg+=groundSvg(centerX,gndY);
  return {svg,h:gndY-vyY+10};
}


function renderGivenPullUp(p,centerX,vyY){
  const net=p.given;
  const given=givenTransistors(net);
  const cellH=56;
  let svg="";
  const vddY=28;

  if(net.structure==="parallelBranches"){
    const branches=net.branches;
    const maxLen=Math.max(...branches.map(b=>b.length));
    const spacing=82;
    const width=(branches.length-1)*spacing;
    const xs=branches.map((_,i)=>centerX-width/2+i*spacing);
    const topBusY=54;
    const firstY=82;
    const bottomBusY=vyY-24;

    svg+=`<line class="rail" x1="45" y1="${vddY}" x2="${430-45}" y2="${vddY}"/>`;
    svg+=`<text class="pwr-tag" x="${430-45}" y="${vddY-8}" text-anchor="end">VDD = 3.3V</text>`;
    svg+=`<line class="wire" x1="${centerX}" y1="${vddY}" x2="${centerX}" y2="${topBusY}"/>`;
    svg+=`<line class="wire" x1="${xs[0]}" y1="${topBusY}" x2="${xs[xs.length-1]}" y2="${topBusY}"/>`;

    branches.forEach((branch,bi)=>{
      const x=xs[bi];
      const offset=((maxLen-branch.length)*cellH)/2;
      const ys=branch.map((_,i)=>firstY+offset+i*cellH);

      svg+=`<line class="wire" x1="${x}" y1="${topBusY}" x2="${x}" y2="${ys[0]-20}"/>`;

      branch.forEach((t,i)=>{
        svg+=glyph(x,ys[i],t,t.name);
        if(i<branch.length-1){
          svg+=`<line class="wire" x1="${x}" y1="${ys[i]+20}" x2="${x}" y2="${ys[i+1]-20}"/>`;
        }
      });

      svg+=`<line class="wire" x1="${x}" y1="${ys[ys.length-1]+20}" x2="${x}" y2="${bottomBusY}"/>`;
    });

    svg+=`<line class="wire" x1="${xs[0]}" y1="${bottomBusY}" x2="${xs[xs.length-1]}" y2="${bottomBusY}"/>`;
    svg+=`<line class="wire" x1="${centerX}" y1="${bottomBusY}" x2="${centerX}" y2="${vyY}"/>`;
    return {svg,h:vyY};
  }

  const ys=given.map((_,i)=>68+i*cellH);
  svg+=`<line class="rail" x1="45" y1="${vddY}" x2="${430-45}" y2="${vddY}"/>`;
  svg+=`<text class="pwr-tag" x="${430-45}" y="${vddY-8}" text-anchor="end">VDD = 3.3V</text>`;
  svg+=`<line class="wire" x1="${centerX}" y1="${vddY}" x2="${centerX}" y2="${ys[0]-20}"/>`;

  given.forEach((t,i)=>{
    svg+=glyph(centerX,ys[i],t,t.name);
    if(i<given.length-1){
      svg+=`<line class="wire" x1="${centerX}" y1="${ys[i]+20}" x2="${centerX}" y2="${ys[i+1]-20}"/>`;
    }
  });

  svg+=`<line class="wire" x1="${centerX}" y1="${ys[ys.length-1]+20}" x2="${centerX}" y2="${vyY}"/>`;
  return {svg,h:vyY};
}

/* ============================================================
   Pointer gesture plumbing
   One gesture (place / move / wire) is active at a time. Move + up listeners
   live on window so a mid-drag canvas re-render can't drop the gesture.
   ============================================================ */
let cmosGestureHandlers=null;

function cmosRemoveGestureListeners(){
  if(cmosGestureHandlers){
    window.removeEventListener("pointermove",cmosGestureHandlers.move);
    window.removeEventListener("pointerup",cmosGestureHandlers.up);
    window.removeEventListener("pointercancel",cmosGestureHandlers.up);
    cmosGestureHandlers=null;
  }
}

function cmosBeginGesture(){
  cmosRemoveGestureListeners();        // never stack listeners; keep the new state intact
  const move=e=>cmosGestureMove(e);
  const up=e=>cmosGestureUp(e);
  cmosGestureHandlers={move,up};
  window.addEventListener("pointermove",move);
  window.addEventListener("pointerup",up);
  window.addEventListener("pointercancel",up);
}

function cmosCancelGesture(){
  cmosRemoveGestureListeners();
  cmos.drag=null;
  cmos.wiring=null;
}

function cmosClientToSvg(clientX,clientY){
  const svgEl=document.querySelector("#cmos-canvas svg");
  if(!svgEl || !svgEl.getScreenCTM) return null;
  const m=svgEl.getScreenCTM();
  if(!m) return null;
  const pt=svgEl.createSVGPoint();
  pt.x=clientX; pt.y=clientY;
  const p=pt.matrixTransform(m.inverse());
  return {x:p.x,y:p.y};
}

function cmosInsideSheet(pnt){
  const g=cmosGeom();
  return !!pnt && pnt.x>40 && pnt.x<g.W-40 && pnt.y>g.workTop-8 && pnt.y<g.workBottom+8;
}

function cmosGestureMove(e){
  const pnt=cmosClientToSvg(e.clientX,e.clientY);
  if(!pnt) return;
  const g=cmosGeom();

  if(cmos.drag && cmos.drag.mode==="place"){
    const inside=cmosInsideSheet(pnt);
    cmos.drag.inside=inside;
    if(inside) cmos.drag.everInside=true;
    cmos.drag.x=snapGrid(Math.max(55,Math.min(g.W-55,pnt.x)));
    cmos.drag.y=snapGrid(Math.max(g.workTop+26,Math.min(g.workBottom-26,pnt.y)));
    renderCmosCanvas();

  } else if(cmos.drag && cmos.drag.mode==="move"){
    const d=cmos.devices.find(x=>x.id===cmos.drag.id);
    if(!d) return;
    const nx=snapGrid(Math.max(55,Math.min(g.W-55,pnt.x+cmos.drag.dx)));
    const ny=snapGrid(Math.max(g.workTop+26,Math.min(g.workBottom-26,pnt.y+cmos.drag.dy)));
    if(Math.abs(nx-d.x)>0.5 || Math.abs(ny-d.y)>0.5) cmos.drag.moved=true;
    d.x=nx; d.y=ny;
    renderCmosCanvas();

  } else if(cmos.wiring){
    const snap=nearestEndpoint(pnt,cmos.wiring.from,28);
    const railSnap=snap ? null : nearestRail(pnt,22);
    const wireSnap=(snap||railSnap) ? null : nearestWire(pnt,null,18);

    cmos.wiring.snap = snap ? {type:"endpoint",id:snap.id}
      : railSnap ? {type:"rail",id:railSnap.id,point:railSnap.point}
      : wireSnap ? {type:"wire",id:wireSnap.wire.id,point:{x:wireSnap.x,y:wireSnap.y}}
      : null;
    cmos.wiring.cursor = snap ? snap.pos
      : railSnap ? railSnap.point
      : wireSnap ? {x:wireSnap.x,y:wireSnap.y}
      : pnt;
    renderCmosCanvas();
  }
}

function cmosGestureUp(e){
  const drag=cmos.drag, wiring=cmos.wiring;

  cmosRemoveGestureListeners();
  cmos.drag=null;
  cmos.wiring=null;

  if(drag && drag.mode==="place"){
    const pnt=cmosClientToSvg(e.clientX,e.clientY);

    if(cmosInsideSheet(pnt)){
      // drag-to-place
      cmos.armed=null; cmos.armedHover=null;
      addSchematicDevice(drag.kind,drag.gate,pnt.x,pnt.y);

    } else if(!drag.everInside){
      // a tap on the palette (never dragged onto the sheet)
      const sd=selectedDevice();
      if(sd){
        // change the selected transistor's type
        sd.kind=drag.kind;
        cmos.tool.kind=drag.kind;
        cmos.verdict=null;
        renderCmosToolbar();
        renderCmosCanvas();
        renderCmosTable();
        cmosHideFeedback();
      } else {
        // arm (or toggle off) click-to-place
        cmos.armed = (cmos.armed===drag.kind) ? null : drag.kind;
        cmos.tool.kind=drag.kind;
        cmos.armedHover=null;
        renderCmosToolbar();
        renderCmosCanvas();
      }
    } else {
      // dragged onto the sheet then released off it -> cancel
      renderCmosToolbar();
      renderCmosCanvas();
    }

  } else if(drag && drag.mode==="move"){
    // Position is cosmetic — do not disturb the answer or feedback.
    renderCmosCanvas();

  } else if(wiring){
    const snap=wiring.snap;
    let target=null;
    if(snap && snap.type==="endpoint" && snap.id!==wiring.from) target={kind:"endpoint",id:snap.id};
    else if(snap && snap.type==="rail") target={kind:"rail",id:snap.id,point:snap.point};
    else if(snap && snap.type==="wire") target={kind:"wire",id:snap.id,point:snap.point};

    if(target){
      const from = wiring.fromRail ? createRailJunction(wiring.fromRail,wiring.fromPos) : wiring.from;

      if(target.kind==="endpoint"){
        if(target.id!==from) addWire(from,target.id); else renderCmosCanvas();
      } else if(target.kind==="rail"){
        const j=createRailJunction(target.id,target.point);
        if(j!==from) addWire(from,j); else renderCmosCanvas();
      } else {
        connectEndpointToWire(from,target.id,target.point);
      }
    } else {
      renderCmosCanvas();
    }
  }
}

function renderCmosCanvas(){
  const p=cmos.p;
  const g=cmosGeom();
  const isPullDown=p.build==="pulldown";

  let givenDraw=null;
  let H=null;

  if(isPullDown){
    givenDraw=renderGivenPullUp(p,g.cx,g.vyY);
    H=g.gndY+22;
  } else {
    givenDraw=renderGivenPullDown(p,g.cx,g.vyY);
    H=g.vyY+givenDraw.h+8;
  }

  const snapId=(cmos.wiring && cmos.wiring.snap && cmos.wiring.snap.type==="endpoint")
    ? cmos.wiring.snap.id : null;
  const tgt=id=>snapId===id ? " snap-target" : "";

  let svg=`<svg class="schem-svg${cmos.armed?" armed":""}" viewBox="0 0 ${g.W} ${H}" width="${g.W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // light drafting grid only in the editable region
  for(let x=20;x<g.W;x+=20){
    for(let y=g.workTop-10;y<g.workBottom+10;y+=20){
      svg+=`<circle class="schem-grid-dot" cx="${x}" cy="${y}" r=".7"/>`;
    }
  }

  if(isPullDown){
    // Given PUN above Vy.
    svg+=givenDraw.svg;

    // Editable Vy rail (connect anywhere along it).
    svg+=`<line class="rail" x1="45" y1="${g.vyY}" x2="${g.W-45}" y2="${g.vyY}"/>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="4"/>`;
    svg+=`<text class="vy-tag" x="${g.W-38}" y="${g.vyY+4}">V\u1d67</text>`;

    // Fixed GND connection point at the bottom (single point).
    svg+=`<circle class="terminal fixed${tgt("GND")}" data-endpoint="GND" cx="${g.cx}" cy="${g.gndY}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="GND" cx="${g.cx}" cy="${g.gndY}" r="16"/>`;
    svg+=groundSvg(g.cx,g.gndY+14);
  } else {
    // Fixed VDD and Vy rails for the editable pull-up (connect anywhere).
    svg+=`<line class="rail" x1="45" y1="${g.vddY}" x2="${g.W-45}" y2="${g.vddY}"/>`;
    svg+=`<text class="pwr-tag" x="${g.W-45}" y="${g.vddY-8}" text-anchor="end">VDD = 3.3V</text>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VDD" cx="${g.cx}" cy="${g.vddY}" r="4"/>`;

    svg+=`<line class="rail" x1="45" y1="${g.vyY}" x2="${g.W-45}" y2="${g.vyY}"/>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="4"/>`;
    svg+=`<text class="vy-tag" x="${g.W-38}" y="${g.vyY+4}">V\u1d67</text>`;
  }

  // Invisible hit-lines that let a wire start anywhere on a rail.
  railsForBuild().forEach(r=>{
    svg+=`<line class="rail-hot" data-rail="${r.id}" x1="45" y1="${r.y}" x2="${g.W-45}" y2="${r.y}" stroke="transparent" stroke-width="20" fill="none"/>`;
  });

  // existing wires
  cmos.wires.forEach(w=>{
    const a=endpointPosition(w.a), b=endpointPosition(w.b);
    if(!a||!b) return;
    const selected=cmos.selected?.type==="wire" && cmos.selected.id===w.id;
    const path=orthogonalPath(a,b);
    svg+=`<path class="schem-wire${selected?" selected":""}" d="${path}"/>`;
    svg+=`<path class="schem-wire-hit" data-wire="${w.id}" d="${path}"/>`;
  });

  // devices
  cmos.devices.forEach(d=>{
    const selected=cmos.selected?.type==="device" && cmos.selected.id===d.id;
    svg+=`<g class="schem-device${selected?" selected":""}" data-device="${d.id}">`;
    svg+=`<rect class="device-select-ring" x="${d.x-42}" y="${d.y-32}" width="84" height="64" rx="9"/>`;
    svg+=glyph(d.x,d.y,d,d.name);
    // Wide, tall transparent grab area so the transistor is easy to select.
    // Terminal hot-zones are drawn AFTER this and sit on top near x=cx, so the
    // node points keep priority; the body is grabbable everywhere else.
    svg+=`<rect class="device-hit" fill="transparent" x="${d.x-44}" y="${d.y-28}" width="88" height="56" rx="8"/>`;
    svg+=`</g>`;

    svg+=`<circle class="terminal${tgt(d.id+":top")}" data-endpoint="${d.id}:top" cx="${d.x}" cy="${d.y-22}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:top" cx="${d.x}" cy="${d.y-22}" r="16"/>`;
    svg+=`<circle class="terminal${tgt(d.id+":bottom")}" data-endpoint="${d.id}:bottom" cx="${d.x}" cy="${d.y+22}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:bottom" cx="${d.x}" cy="${d.y+22}" r="16"/>`;
  });

  const endpointUse={};
  cmos.wires.forEach(w=>{
    endpointUse[w.a]=(endpointUse[w.a]||0)+1;
    endpointUse[w.b]=(endpointUse[w.b]||0)+1;
  });
  Object.entries(endpointUse).forEach(([id,count])=>{
    if(count<2 || id.startsWith("j")) return;
    const pnt=endpointPosition(id);
    if(pnt) svg+=`<circle class="schem-junction" cx="${pnt.x}" cy="${pnt.y}" r="3.1"/>`;
  });

  cmos.junctions.forEach(j=>{
    const selected=(cmos.selected?.type==="junction" && cmos.selected.id===j.id) || snapId===j.id;
    svg+=`<circle class="terminal${selected?" snap-target":""}" data-endpoint="${j.id}" cx="${j.x}" cy="${j.y}" r="3.8"/>`;
    svg+=`<circle class="terminal-hot junction-hot" data-endpoint="${j.id}" data-junction="${j.id}" cx="${j.x}" cy="${j.y}" r="16"/>`;
  });

  if(!cmos.devices.length && !(cmos.drag && cmos.drag.mode==="place") && !cmos.armed){
    svg+=`<text class="schem-empty-note" x="${g.cx}" y="${(g.workTop+g.workBottom)/2}" text-anchor="middle">Drag or click a transistor here</text>`;
  }

  if(!isPullDown){
    svg+=givenDraw.svg;
  }

  // ---- live previews (drawn on top) ----
  const ghostAt=(x,y,kind,op)=>`<g class="schem-ghost" style="opacity:${op};pointer-events:none">`+
    glyph(x,y,{kind,gate:cmos.tool.gate},(p.build==="pulldown"?"N":"P")+cmos.nextTrans)+`</g>`;

  if(cmos.drag && cmos.drag.mode==="place" && cmos.drag.inside && cmos.drag.x!=null){
    svg+=ghostAt(cmos.drag.x,cmos.drag.y,cmos.drag.kind,".5");
  }
  if(cmos.armed && cmos.armedHover){
    svg+=ghostAt(cmos.armedHover.x,cmos.armedHover.y,cmos.armed,".45");
  }

  if(cmos.wiring){
    const from=cmos.wiring.fromPos || endpointPosition(cmos.wiring.from);
    const to=cmos.wiring.cursor||from;
    if(from && to) svg+=`<path class="schem-preview" style="pointer-events:none" d="${orthogonalPath(from,to)}"/>`;
    if(cmos.wiring.snap && (cmos.wiring.snap.type==="wire" || cmos.wiring.snap.type==="rail")){
      const pt=cmos.wiring.snap.point;
      svg+=`<circle class="schem-junction" style="pointer-events:none" cx="${pt.x}" cy="${pt.y}" r="3.6"/>`;
    }
  }

  svg+=`</svg>`;

  const host=document.getElementById("cmos-canvas");
  const prevTop=host.scrollTop, prevLeft=host.scrollLeft;
  host.classList.add("editor");
  host.innerHTML=svg;
  host.scrollTop=prevTop; host.scrollLeft=prevLeft;   // never jump on re-render

  const svgEl=host.querySelector("svg");
  if(!svgEl) return;

  // Device body: select + begin a move gesture.
  host.querySelectorAll(".schem-device").forEach(gEl=>{
    gEl.style.touchAction="none";
    gEl.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();
      cmos.armed=null; cmos.armedHover=null;
      const id=gEl.dataset.device;
      const d=cmos.devices.find(x=>x.id===id);
      if(!d) return;
      const pnt=cmosClientToSvg(e.clientX,e.clientY)||{x:d.x,y:d.y};
      cmos.selected={type:"device",id};
      cmos.drag={mode:"move",id,dx:d.x-pnt.x,dy:d.y-pnt.y,moved:false};
      cmosBeginGesture();
      renderCmosToolbar();
      renderCmosCanvas();
    });
  });

  // Terminals: begin a wiring gesture.
  host.querySelectorAll(".terminal-hot").forEach(term=>{
    term.style.touchAction="none";
    term.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();
      cmos.armed=null; cmos.armedHover=null;
      const endpoint=term.dataset.endpoint;
      const from=endpointPosition(endpoint);
      if(!from) return;
      cmos.wiring={from:endpoint,fromRail:null,fromPos:from,cursor:from,snap:null};
      cmosBeginGesture();
      renderCmosCanvas();
    });
  });

  // Rails: begin a wiring gesture from any point along the line.
  host.querySelectorAll(".rail-hot").forEach(line=>{
    line.style.touchAction="none";
    line.addEventListener("pointerdown",e=>{
      if(e.pointerType==="mouse" && e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();
      cmos.armed=null; cmos.armedHover=null;
      const railId=line.dataset.rail;
      const pnt=cmosClientToSvg(e.clientX,e.clientY);
      const gg=cmosGeom();
      const y = railId==="VDD"?gg.vddY : gg.vyY;
      const x = snapGrid(Math.max(45,Math.min(gg.W-45, pnt?pnt.x:gg.cx)));
      const from={x,y};
      cmos.wiring={from:railId,fromRail:railId,fromPos:from,cursor:from,snap:null};
      cmosBeginGesture();
      renderCmosCanvas();
    });
  });

  // Tap a junction to select it.
  host.querySelectorAll(".junction-hot").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      if(cmos.drag || cmos.wiring) return;
      cmos.selected={type:"junction",id:el.dataset.junction};
      renderCmosToolbar();
      renderCmosCanvas();
    });
  });

  // Tap a wire to select it.
  host.querySelectorAll(".schem-wire-hit").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      if(cmos.drag || cmos.wiring) return;
      cmos.selected={type:"wire",id:el.dataset.wire};
      renderCmosToolbar();
      renderCmosCanvas();
    });
  });

  // Hover ghost while armed for click-to-place (mouse only).
  svgEl.addEventListener("pointermove",e=>{
    if(!cmos.armed || cmos.drag || cmos.wiring) return;
    const pnt=cmosClientToSvg(e.clientX,e.clientY);
    if(!pnt) return;
    if(!cmosInsideSheet(pnt)){
      if(cmos.armedHover){ cmos.armedHover=null; renderCmosCanvas(); }
      return;
    }
    const gg=cmosGeom();
    const x=snapGrid(Math.max(55,Math.min(gg.W-55,pnt.x)));
    const y=snapGrid(Math.max(gg.workTop+26,Math.min(gg.workBottom-26,pnt.y)));
    if(!cmos.armedHover || cmos.armedHover.x!==x || cmos.armedHover.y!==y){
      cmos.armedHover={x,y};
      renderCmosCanvas();
    }
  });

  // Click on the sheet: place (if armed) or deselect.
  svgEl.addEventListener("click",e=>{
    if(cmos.drag || cmos.wiring) return;

    if(cmos.armed){
      if(e.target.closest("[data-device],[data-endpoint],[data-wire],[data-junction],[data-rail]")) return;
      const pnt=cmosClientToSvg(e.clientX,e.clientY);
      const kind=cmos.armed;
      cmos.armed=null; cmos.armedHover=null;
      if(cmosInsideSheet(pnt)){
        addSchematicDevice(kind,cmos.tool.gate,pnt.x,pnt.y);
      } else {
        renderCmosToolbar();
        renderCmosCanvas();
      }
      return;
    }

    if(e.target.closest("[data-device],[data-endpoint],[data-wire],[data-junction],.nodepill")) return;
    if(!cmos.selected) return;
    cmos.selected=null;
    renderCmosToolbar();
    renderCmosCanvas();
  });
}

function renderCmosTable(){
  const p=cmos.p, rows=cmosInputRows(p), P=placedPullup(), given=givenTransistors(p.given);
  const cols=[
    ...p.inputs.map(g=>({key:g, kind:"in", label:g})),
    ...P.map(o=>({key:o.name, kind:o.t.kind==="pmos"?"p":"n", label:o.name, source:"built"})),
    ...given.map(t=>({key:t.name, kind:t.kind==="pmos"?"p":"n", label:t.name, source:"given"})),
    {key:"vy", kind:"vy", label:"V\u1d67"}
  ];
  let html=`<table class="simtable"><thead><tr>`;
  cols.forEach(c=>{ const cls=c.kind==="in"?"grp-in":c.kind==="p"?"grp-p":c.kind==="n"?"grp-n":""; html+=`<th class="${cls}">${c.label}</th>`; });
  html+=`</tr></thead><tbody>`;
  rows.forEach((assign,ri)=>{
    html+=`<tr>`;
    const sim=simRow(p, assign);
    cols.forEach(col=>{
      if(col.kind==="in"){ html+=`<td class="given">${fmtV(assign[col.key])}</td>`; }
      else if(col.kind==="vy"){
        const val=cmos.table[ri].vy;
        let cls="vy"; 
        if(cmos.verdict){ const exp=sim.vy; const ok = (typeof exp==="number") ? val===exp : false; cls+= (val===null? "" : (ok?" mark-good":" mark-bad")); }
        html+=`<td class="${cls}" data-ri="${ri}" data-col="vy">${val===null?"":fmtV(val)}</td>`;
      } else {
        const marked=cmos.table[ri].marks.has(col.key);
        let cls="tcell"+(marked?" c":"");
        if(cmos.verdict){
          const built=P.find(o=>o.name===col.key);
          const t = built ? built.t : given.find(t=>t.name===col.key);
          const expClosed = transOn(t, assign);
          const ok = marked===expClosed;
          cls+= ok?" mark-good":" mark-bad";
        }
        html+=`<td class="${cls}" data-ri="${ri}" data-col="${col.key}">${marked?"C":""}</td>`;
      }
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table>`;
  const host=document.getElementById("cmos-table"); host.innerHTML=html;
  host.querySelectorAll("td.tcell").forEach(td=>td.addEventListener("click",()=>{
    if(!cmos.simUnlocked) return;
    const ri=+td.dataset.ri, key=td.dataset.col, marks=cmos.table[ri].marks;
    if(marks.has(key)) marks.delete(key); else marks.add(key);
    cmos.verdict=null; renderCmosTable(); cmosHideTableFeedback();
  }));
  host.querySelectorAll("td.vy").forEach(td=>td.addEventListener("click",()=>{
    if(!cmos.simUnlocked) return;
    const ri=+td.dataset.ri, cur=cmos.table[ri].vy;
    cmos.table[ri].vy = cur===null?0 : cur===0?3.3 : null;   // cycle blank -> 0V -> 3.3V -> blank
    cmos.verdict=null; renderCmosTable(); cmosHideTableFeedback();
  }));
}

/* -- check + feedback -- */
function cmosCheck(){
  const p=cmos.p, rows=cmosInputRows(p), P=placedPullup(), msgs=[];
  const buildingPullDown=p.build==="pulldown";
  const expectedKind=buildingPullDown?"nmos":"pmos";
  const expectedLabel=buildingPullDown?"pull-down":"pull-up";

  if(P.length===0){
    showCmosFeedback([{
      s:"info",
      area:"diagram",
      t:`Drag transistors onto the schematic and wire the ${expectedLabel} network, then check again.`
    }]);
    return;
  }

  // -- schematic / circuit design --
  const wrongType=P.filter(o=>o.t.kind!==expectedKind);
  if(wrongType.length){
    msgs.push({
      s:"error",
      area:"diagram",
      t:`The ${expectedLabel} network must use ${buildingPullDown?"NMOS":"PMOS"} transistors. ${wrongType.map(o=>o.name).join(", ")} ${wrongType.length===1?"has":"have"} the wrong type.`
    });
  }

  // Basic connectivity: every placed device should participate in at least one wire.
  const connectedIds=new Set();
  cmos.wires.forEach(w=>{
    [w.a,w.b].forEach(ep=>{
      if(ep.includes(":")) connectedIds.add(ep.split(":")[0]);
    });
  });
  const disconnected=P.filter(o=>!connectedIds.has(o.id));
  if(disconnected.length){
    msgs.push({
      s:"warn",
      area:"diagram",
      t:`${disconnected.map(o=>o.name).join(", ")} ${disconnected.length===1?"is":"are"} not wired into the schematic yet.`
    });
  }

  let short=null, float=null, complement=true;
  rows.forEach(a=>{
    const s=simRow(p,a);
    if(s.vy==="SHORT" && !short) short=a;
    if(s.vy==="FLOAT" && !float) float=a;
    if(s.up===s.dn) complement=false;
  });

  const inStr=a=>p.inputs.map(g=>`${g}=${fmtV(a[g])}`).join(", ");

  if(short){
    msgs.push({
      s:"error",
      area:"diagram",
      t:`Both networks conduct at (${inStr(short)}) — that shorts VDD to ground. Recheck your wiring.`
    });
  }

  if(float){
    msgs.push({
      s:"error",
      area:"diagram",
      t:`Neither network conducts at (${inStr(float)}) — V\u1d67 floats. Every input combination must connect V\u1d67 to either VDD or ground.`
    });
  }

  const usage={};
  P.forEach(o=>usage[o.t.gate]=(usage[o.t.gate]||0)+1);
  const missing=p.inputs.filter(g=>!usage[g]);

  const designOK=
    !wrongType.length &&
    !disconnected.length &&
    !short &&
    !float &&
    complement;

  if(!designOK && missing.length){
    msgs.push({
      s:"warn",
      area:"diagram",
      t:`Input${missing.length>1?"s":""} ${missing.join(", ")} ${missing.length>1?"are":"is"} not controlling any pull-up transistor yet.`
    });
  }

  if(designOK){
    msgs.push({
      s:"success",
      area:"diagram",
      t:`Your ${expectedLabel} wiring correctly complements the given ${buildingPullDown?"pull-up":"pull-down"} network.`
    });
  } else if(!short && !float && !wrongType.length && !disconnected.length && !complement){
    msgs.push({
      s:"warn",
      area:"diagram",
      t:`The ${expectedLabel} conducts for the wrong inputs. Recheck which transistors should be in series and which should share the same two nodes in parallel.`
    });
  }

  // -- simulation table --
  cmos.verdict=true;
  const given=givenTransistors(p.given);
  let wrong=0;

  rows.forEach((a,ri)=>{
    const sim=simRow(p,a);

    P.forEach(o=>{
      const exp=transOn(o.t,a);
      const mk=cmos.table[ri].marks.has(o.name);
      if(mk!==exp) wrong++;
    });

    given.forEach(t=>{
      const exp=transOn(t,a);
      const mk=cmos.table[ri].marks.has(t.name);
      if(mk!==exp) wrong++;
    });

    const vy=cmos.table[ri].vy;
    const expVy=sim.vy;
    if(typeof expVy==="number"){
      if(vy!==expVy) wrong++;
    } else if(vy!==null){
      wrong++;
    }
  });

  if(wrong===0){
    msgs.push({
      s:"success",
      area:"table",
      t:"Every closed-transistor mark and every V\u1d67 value matches the circuit."
    });
  } else {
    msgs.push({
      s:"warn",
      area:"table",
      t:`${wrong} cell${wrong===1?"":"s"} ${wrong===1?"doesn't":"don't"} match the circuit. Incorrect cells are highlighted red.`
    });
  }

  renderCmosTable();
  showCmosFeedback(msgs);
}

function showCmosFeedback(msgs){
  const host=document.getElementById("cmos-feedback");
  host.innerHTML="";

  const tags={error:"Fix",warn:"Nudge",success:"Solved",info:"Note"};
  const areas={diagram:"Build the circuit",table:"Simulate your circuit"};

  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    const area=areas[mo.area]||"";
    const tag=tags[mo.s]||"";
    const heading=[area,tag].filter(Boolean).join(" · ");
    d.innerHTML=`<span class="mtag">${heading}</span>${mo.t}`;
    host.appendChild(d);
  });

  document.getElementById("cmos-feedback-card").style.display="block";
}

function cmosReset(){ buildCmos(cmos.p); }

/* Delete / Backspace removes the selected item while the CMOS solver is open. */
if(!window.__cmosKeyBound){
  window.__cmosKeyBound=true;
  window.addEventListener("keydown",e=>{
    if(e.key!=="Delete" && e.key!=="Backspace") return;
    const view=document.getElementById("solver-cmos");
    if(!view || view.style.display==="none") return;
    const t=e.target;
    const tag=(t && t.tagName || "").toLowerCase();
    if(tag==="input" || tag==="textarea" || (t && t.isContentEditable)) return;
    if(!cmos.selected) return;
    e.preventDefault();
    deleteSelectedSchematicItem();
  });
}

/* ============================================================
   Feedback: separate BUILD and TABLE submits
   ============================================================ */

/* -- visibility helpers -- */
function cmosHideTableFeedback(){
  const c=document.getElementById("cmos-feedback-card");
  if(c) c.style.display="none";
  const sim=document.getElementById("cmos-sim-card");
  if(sim) sim.classList.remove("is-correct");
  const actions=document.getElementById("cmos-complete-actions");
  if(actions) actions.style.display="none";
}
function cmosHideFeedback(){
  // A structural change to the circuit invalidates the build verdict, hides the
  // "Continue" option, and collapses the Simulate stage back out of view — the
  // table only makes sense against a circuit that has been verified.
  cmosHideTableFeedback();
  const bc=document.getElementById("cmos-build-feedback-card");
  if(bc) bc.style.display="none";
  const card=document.getElementById("cmos-build-card");
  if(card) card.classList.remove("is-correct");
  cmos.buildPassed=false;
  cmos.simUnlocked=false;
  cmos.verdict=null;
  cmosUpdateSimGate();
}

/* Reflect the Build→Simulate progression in the DOM:
   - not passed         → Simulate hidden, no Continue button
   - passed, not moved  → Simulate hidden, Continue button shown
   - moved on           → Simulate revealed (table interactive) */
function cmosUpdateSimGate(){
  const passed=!!cmos.buildPassed;
  const revealed=!!cmos.simUnlocked;
  const build=document.getElementById("cmos-build-card");
  const sim=document.getElementById("cmos-sim-card");
  const cont=document.getElementById("cmos-continue");
  const btn=document.getElementById("cmos-check-table-btn");
  const question=document.getElementById("solve-question");
  if(build) build.style.display = revealed ? "none" : "";
  if(sim) sim.style.display = revealed ? "" : "none";
  if(cont) cont.style.display = (passed && !revealed) ? "" : "none";
  if(btn) btn.disabled = !revealed;
  if(question) question.style.display = (!revealed && cmos.questionWasVisible) ? "" : "none";
  if(!revealed) cmosHideTableFeedback();
}

/* Copy the verified schematic into the simulation stage as a clean,
   non-interactive reference image. */
function cmosRenderReferenceDiagram(){
  const source=document.querySelector("#cmos-canvas .schem-svg");
  const host=document.getElementById("cmos-reference-canvas");
  if(!source || !host) return;

  const snapshot=source.cloneNode(true);
  snapshot.classList.remove("armed");
  snapshot.classList.add("reference-svg");
  snapshot.removeAttribute("width");
  snapshot.removeAttribute("height");
  snapshot.setAttribute("aria-hidden","true");

  snapshot.querySelectorAll(
    ".schem-grid-dot, .terminal-hot, .rail-hot, .schem-wire-hit, " +
    ".device-select-ring, .schem-empty-note, .schem-preview, .schem-ghost"
  ).forEach(el=>el.remove());
  snapshot.querySelectorAll(".selected, .snap-target, .dragging")
    .forEach(el=>el.classList.remove("selected","snap-target","dragging"));

  host.replaceChildren(snapshot);
}

/* -- renderer shared by both panels -- */
function cmosRenderMsgs(hostId,cardId,areaLabel,msgs){
  const host=document.getElementById(hostId);
  if(!host) return;
  host.innerHTML="";
  const tags={error:"Fix",warn:"Nudge",success:"Solved",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    const tag=tags[mo.s]||"";
    const heading=[areaLabel,tag].filter(Boolean).join(" \u00b7 ");
    d.innerHTML=`<span class="mtag">${heading}</span>${mo.t}${mo.extra||""}`;
    host.appendChild(d);
  });
  const card=document.getElementById(cardId);
  if(card) card.style.display="block";
}
function showCmosBuildFeedback(msgs){ cmosRenderMsgs("cmos-build-feedback","cmos-build-feedback-card","Build the circuit",msgs); }
function showCmosTableFeedback(msgs){ cmosRenderMsgs("cmos-feedback","cmos-feedback-card","Simulate your circuit",msgs); }

/* -- BUILD: schematic / wiring only -- */
function cmosCheckBuild(){
  const p=cmos.p, rows=cmosInputRows(p), P=placedPullup(), msgs=[];
  const buildingPullDown=p.build==="pulldown";
  const expectedKind=buildingPullDown?"nmos":"pmos";
  const expectedLabel=buildingPullDown?"pull-down":"pull-up";
  const card=document.getElementById("cmos-build-card");

  if(P.length===0){
    if(card) card.classList.remove("is-correct");
    showCmosBuildFeedback([{s:"info",t:`Drag transistors onto the schematic and wire the ${expectedLabel} network, then check again.`}]);
    return;
  }

  const wrongType=P.filter(o=>o.t.kind!==expectedKind);
  if(wrongType.length) msgs.push({s:"error",t:`The ${expectedLabel} network must use ${buildingPullDown?"NMOS":"PMOS"} transistors. ${wrongType.map(o=>o.name).join(", ")} ${wrongType.length===1?"has":"have"} the wrong type.`});

  const connectedIds=new Set();
  cmos.wires.forEach(w=>{ [w.a,w.b].forEach(ep=>{ if(ep.includes(":")) connectedIds.add(ep.split(":")[0]); }); });
  const disconnected=P.filter(o=>!connectedIds.has(o.id));
  if(disconnected.length) msgs.push({s:"warn",t:`${disconnected.map(o=>o.name).join(", ")} ${disconnected.length===1?"is":"are"} not wired into the schematic yet.`});

  let short=null, flt=null, complement=true;
  rows.forEach(a=>{ const s=simRow(p,a); if(s.vy==="SHORT"&&!short)short=a; if(s.vy==="FLOAT"&&!flt)flt=a; if(s.up===s.dn)complement=false; });
  const inStr=a=>p.inputs.map(g=>`${g}=${fmtV(a[g])}`).join(", ");
  if(short) msgs.push({s:"error",t:`Both networks conduct at (${inStr(short)}) — that shorts VDD to ground. Recheck your wiring.`});
  if(flt) msgs.push({s:"error",t:`Neither network conducts at (${inStr(flt)}) — V\u1d67 floats. Every input combination must connect V\u1d67 to VDD or ground.`});

  const usage={}; P.forEach(o=>usage[o.t.gate]=(usage[o.t.gate]||0)+1);
  const missing=p.inputs.filter(g=>!usage[g]);

  const designOK = !wrongType.length && !disconnected.length && !short && !flt && complement;

  if(!designOK && missing.length) msgs.push({s:"warn",t:`Input${missing.length>1?"s":""} ${missing.join(", ")} ${missing.length>1?"are":"is"} not controlling any transistor yet.`});

  if(designOK){
    msgs.push({s:"success",t:`Your ${expectedLabel} network correctly complements the given ${buildingPullDown?"pull-up":"pull-down"} network. Press <b>Continue to simulation</b> below to move on.`});
  } else if(!short && !flt && !wrongType.length && !disconnected.length && !complement){
    msgs.push({s:"warn",t:`The ${expectedLabel} conducts for the wrong inputs. Recheck which transistors should be in series and which should share the same two nodes in parallel.`});
  }

  if(card) card.classList.toggle("is-correct", !!designOK);

  // Gate stage 2: a correct build reveals the "Continue" option. It does NOT
  // auto-open the table — the student chooses to move on.
  cmos.buildPassed=!!designOK;
  if(!designOK){ cmos.simUnlocked=false; cmos.verdict=null; }
  cmosUpdateSimGate();

  showCmosBuildFeedback(msgs);
}

/* Move on to the Simulate stage (reveals the table below the finished diagram). */
function cmosContinueToSim(){
  if(!cmos.buildPassed) return;
  cmosRenderReferenceDiagram();
  cmos.simUnlocked=true;
  cmosUpdateSimGate();
  const sim=document.getElementById("cmos-sim-card");
  if(sim && sim.scrollIntoView) sim.scrollIntoView({behavior:"smooth", block:"nearest"});
}

/* Step back to editing the circuit (collapses the Simulate stage again). */
function cmosBackToBuild(){
  cmos.simUnlocked=false;
  cmosUpdateSimGate();
  const b=document.getElementById("cmos-build-card");
  if(b && b.scrollIntoView) b.scrollIntoView({behavior:"smooth", block:"nearest"});
}

/* Reuse the chapter breadcrumb's existing navigation, so this remains in sync
   with whichever chapter owns the current CMOS problem. */
function cmosExploreMoreProblems(){
  const chapterButton=document.getElementById("crumb-back-chapter");
  if(chapterButton) chapterButton.click();
}

/* -- TABLE: simulation marks + Vy -- */
function cmosCheckTable(){
  if(!cmos.simUnlocked) return;   // gated on a correct build
  const p=cmos.p, rows=cmosInputRows(p), P=placedPullup(), given=givenTransistors(p.given);
  cmos.verdict=true;
  let wrong=0, total=0;

  rows.forEach((a,ri)=>{
    const sim=simRow(p,a);
    P.forEach(o=>{ total++; if(cmos.table[ri].marks.has(o.name)!==transOn(o.t,a)) wrong++; });
    given.forEach(t=>{ total++; if(cmos.table[ri].marks.has(t.name)!==transOn(t,a)) wrong++; });
    total++;
    const vy=cmos.table[ri].vy, expVy=sim.vy;
    if(typeof expVy==="number"){ if(vy!==expVy) wrong++; } else if(vy!==null){ wrong++; }
  });

  renderCmosTable();

  const msgs=[];
  const solved=wrong===0;
  const simCard=document.getElementById("cmos-sim-card");
  const completeActions=document.getElementById("cmos-complete-actions");
  if(simCard) simCard.classList.toggle("is-correct", solved);
  if(completeActions) completeActions.style.display=solved ? "flex" : "none";
  if(solved){
    msgs.push({
      s:"success",
      t:"Every closed-transistor mark and every V\u1d67 value matches your circuit.",
      extra:`<div><span class="fb-count good">${total}/${total} correct</span></div>`
    });
  } else {
    msgs.push({
      s:"warn",
      t:"Some cells don't match your circuit yet — the mismatches are outlined in red in the table above.",
      extra:`<div><span class="fb-count bad">${wrong} cell${wrong===1?"":"s"} to fix</span></div>`
    });
  }
  showCmosTableFeedback(msgs);
}

/* Convenience: check both panels at once. */
function cmosCheckAll(){ cmosCheckBuild(); cmosCheckTable(); }