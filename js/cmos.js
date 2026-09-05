/* ============================================================
   CMOS PROBLEM TYPE  —  builder + simulation + table + feedback
   (Claude-maintained; add problems via the data list at the top)
   ============================================================ */
const cmos = {
  p:null,
  devices:[],
  wires:[],
  junctions:[],
  nextTrans:0,
  selected:null,        // {type:"device"|"wire", id}
  tool:{kind:"pmos", gate:"Va"},
  table:[],
  verdict:null,
  drag:null,
  wiring:null
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

  s+=`<text class="tname" x="${cx+8}" y="${cy-12}">${name}</text>`;
  s+=`<text x="${leadX-4}" y="${cy+3}" text-anchor="end">${t.gate}</text>`;
  s+=`</g>`;
  return s;
}

function buildCmos(p){
  cmos.p=p;
  cmos.devices=[];
  cmos.wires=[];
  cmos.junctions=[];
  cmos.nextTrans=0;
  cmos.selected=null;
  cmos.tool={kind:p.build==="pulldown"?"nmos":"pmos",gate:p.inputs[0]};
  cmos.table=cmosInputRows(p).map(()=>({marks:new Set(),vy:null}));
  cmos.verdict=null;
  cmos.drag=null;
  cmos.wiring=null;

  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  document.getElementById("cmos-feedback-card").style.display="none";
}

function selectedDevice(){
  if(!cmos.selected || cmos.selected.type!=="device") return null;
  return cmos.devices.find(d=>d.id===cmos.selected.id) || null;
}

function renderCmosToolbar(){
  const p=cmos.p, host=document.getElementById("cmos-toolbar");
  const d=selectedDevice();

  const seg=(opts,active)=>`<div class="seg">`+
    opts.map(o=>`<button class="${o.val===active?"on":""}" data-k="${o.key}" data-v="${o.val}" type="button">${o.label}</button>`).join("")+
    `</div>`;

  host.innerHTML=`
    <div class="tool-group">
      <span class="tg-label">${d?"Selected transistor":"Transistor"}</span>
      <div class="schem-palette">
        <div class="palette-part" draggable="true" data-part="pmos" title="Drag a PMOS onto the schematic">
          <span class="palette-symbol pmos"><span></span></span>
          PMOS
        </div>
        <div class="palette-part" draggable="true" data-part="nmos" title="Drag an NMOS onto the schematic">
          <span class="palette-symbol nmos"></span>
          NMOS
        </div>
      </div>
    </div>

    <div class="tool-group">
      <span class="tg-label">Gate</span>
      ${seg(p.inputs.map(g=>({key:"gate",val:g,label:g})),d?d.gate:cmos.tool.gate)}
    </div>

    ${d ? `
      <div class="tool-group">
        <span class="tg-label">Type</span>
        ${seg([
          {key:"kind",val:"pmos",label:"PMOS"},
          {key:"kind",val:"nmos",label:"NMOS"}
        ],d.kind)}
      </div>
    ` : ""}

    <div class="tool-group">
      <span class="tg-label">&nbsp;</span>
      <div class="schem-actions">
        <button class="btn ghost sm" id="schem-delete" type="button" ${cmos.selected?"":"disabled"}>Delete</button>
        <button class="btn ghost sm" id="schem-clear" type="button" ${cmos.devices.length||cmos.wires.length||cmos.junctions.length?"":"disabled"}>Clear</button>
      </div>
    </div>

    ${d ? `
      <div class="schem-status">
        Selected transistor <b>${d.name}</b>.
      </div>
    ` : cmos.selected?.type==="wire" ? `
      <div class="schem-status">
        Selected <b>wire</b>.
      </div>
    ` : cmos.selected?.type==="junction" ? `
      <div class="schem-status">
        Selected <b>junction</b>.
      </div>
    ` : ""}

    <div class="schem-tip">
      Drag between terminals to wire. Drop near an existing wire to create a junction.
    </div>
  `;

  host.querySelectorAll(".palette-part").forEach(el=>{
    el.addEventListener("dragstart",e=>{
      const payload={
        kind:el.dataset.part,
        gate:cmos.tool.gate
      };
      e.dataTransfer.setData("application/json",JSON.stringify(payload));
      e.dataTransfer.effectAllowed="copy";
    });
  });

  host.querySelectorAll(".seg button").forEach(b=>{
    b.onclick=()=>{
      const key=b.dataset.k, val=b.dataset.v;
      const sd=selectedDevice();

      if(sd){
        sd[key]=val;

        // Keep the palette choice in sync with the last thing the student chose.
        // This prevents a newly placed transistor from jumping back to Va.
        if(key==="gate") cmos.tool.gate=val;
        if(key==="kind") cmos.tool.kind=val;
      } else {
        cmos.tool[key]=val;
      }

      cmos.verdict=null;
      renderCmosToolbar();
      renderCmosCanvas();
      renderCmosTable();
      document.getElementById("cmos-feedback-card").style.display="none";
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
  cmos.table=cmosInputRows(cmos.p).map(()=>({marks:new Set(),vy:null}));
  cmos.verdict=null;
  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
  document.getElementById("cmos-feedback-card").style.display="none";
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
  document.getElementById("cmos-feedback-card").style.display="none";
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

  // Do not auto-select a newly placed transistor.
  // This keeps the gate/type controls aimed at the NEXT transistor the student will place.
  cmos.selected=null;
  cmos.verdict=null;

  renderCmosToolbar();
  renderCmosCanvas();
  renderCmosTable();
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
  document.getElementById("cmos-feedback-card").style.display="none";
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
  document.getElementById("cmos-feedback-card").style.display="none";
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

  // Keep the junction precisely on the orthogonal wire while snapping along
  // the direction of the segment to the drafting grid.
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

function allSchematicEndpoints(){
  const ids=cmos.p.build==="pulldown" ? ["VY","GND"] : ["VDD","VY"];
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

  let svg=`<svg class="schem-svg" viewBox="0 0 ${g.W} ${H}" width="${g.W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // light drafting grid only in the editable region
  for(let x=20;x<g.W;x+=20){
    for(let y=g.workTop-10;y<g.workBottom+10;y+=20){
      svg+=`<circle class="schem-grid-dot" cx="${x}" cy="${y}" r=".7"/>`;
    }
  }

  if(isPullDown){
    // Given PUN above Vy.
    svg+=givenDraw.svg;

    // Fixed Vy node at the top of the editable pull-down area.
    svg+=`<line class="rail" x1="45" y1="${g.vyY}" x2="${g.W-45}" y2="${g.vyY}"/>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="16"/>`;
    svg+=`<text class="vy-tag" x="${g.W-38}" y="${g.vyY+4}">V\u1d67</text>`;

    // Fixed GND connection point at the bottom.
    svg+=`<circle class="terminal fixed" data-endpoint="GND" cx="${g.cx}" cy="${g.gndY}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="GND" cx="${g.cx}" cy="${g.gndY}" r="16"/>`;
    svg+=groundSvg(g.cx,g.gndY+14);
  } else {
    // Fixed VDD and Vy for the editable pull-up.
    svg+=`<line class="rail" x1="45" y1="${g.vddY}" x2="${g.W-45}" y2="${g.vddY}"/>`;
    svg+=`<text class="pwr-tag" x="${g.W-45}" y="${g.vddY-8}" text-anchor="end">VDD = 3.3V</text>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VDD" cx="${g.cx}" cy="${g.vddY}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="VDD" cx="${g.cx}" cy="${g.vddY}" r="16"/>`;

    svg+=`<line class="rail" x1="45" y1="${g.vyY}" x2="${g.W-45}" y2="${g.vyY}"/>`;
    svg+=`<circle class="terminal fixed" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="VY" cx="${g.cx}" cy="${g.vyY}" r="16"/>`;
    svg+=`<text class="vy-tag" x="${g.W-38}" y="${g.vyY+4}">V\u1d67</text>`;
  }

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
    svg+=`<rect class="device-select-ring" x="${d.x-39}" y="${d.y-31}" width="78" height="62" rx="8"/>`;
    svg+=glyph(d.x,d.y,d,d.name);
    svg+=`<rect fill="transparent" x="${d.x-36}" y="${d.y-27}" width="72" height="54" rx="7"/>`;
    svg+=`</g>`;

    svg+=`<circle class="terminal" data-endpoint="${d.id}:top" cx="${d.x}" cy="${d.y-22}" r="3.4"/>`;
    svg+=`<circle class="terminal-hot" data-endpoint="${d.id}:top" cx="${d.x}" cy="${d.y-22}" r="16"/>`;
    svg+=`<circle class="terminal" data-endpoint="${d.id}:bottom" cx="${d.x}" cy="${d.y+22}" r="3.4"/>`;
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
    const selected=cmos.selected?.type==="junction" && cmos.selected.id===j.id;
    svg+=`<circle class="terminal${selected?" snap-target":""}" data-endpoint="${j.id}" cx="${j.x}" cy="${j.y}" r="3.8"/>`;
    svg+=`<circle class="terminal-hot junction-hot" data-endpoint="${j.id}" data-junction="${j.id}" cx="${j.x}" cy="${j.y}" r="16"/>`;
  });

  if(!cmos.devices.length){
    svg+=`<text class="schem-empty-note" x="${g.cx}" y="${(g.workTop+g.workBottom)/2}" text-anchor="middle">Drag a transistor here</text>`;
  }

  if(!isPullDown){
    svg+=givenDraw.svg;
  }

  svg+=`</svg>`;

  const host=document.getElementById("cmos-canvas");
  host.classList.add("editor");
  host.innerHTML=svg;

  const svgEl=host.querySelector("svg");

  function clientToSvg(clientX,clientY){
    const pt=svgEl.createSVGPoint();
    pt.x=clientX; pt.y=clientY;
    const p=pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return {x:p.x,y:p.y};
  }

  // Palette drop -> new transistor.
  host.ondragover=e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect="copy";
  };

  host.ondrop=e=>{
    e.preventDefault();
    let payload=null;
    try{ payload=JSON.parse(e.dataTransfer.getData("application/json")); }catch{}
    if(!payload) return;
    const pnt=clientToSvg(e.clientX,e.clientY);
    addSchematicDevice(payload.kind,payload.gate,pnt.x,pnt.y);
  };

  // Select / drag devices.
  host.querySelectorAll(".schem-device").forEach(el=>{
    el.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.preventDefault();
      const id=el.dataset.device;
      const d=cmos.devices.find(x=>x.id===id);
      if(!d) return;

      cmos.selected={type:"device",id};
      const pnt=clientToSvg(e.clientX,e.clientY);
      cmos.drag={id,dx:d.x-pnt.x,dy:d.y-pnt.y,moved:false};

      el.setPointerCapture(e.pointerId);
      renderCmosToolbar();
    });

    el.addEventListener("pointermove",e=>{
      if(!cmos.drag || cmos.drag.id!==el.dataset.device) return;
      const d=cmos.devices.find(x=>x.id===cmos.drag.id);
      if(!d) return;

      const pnt=clientToSvg(e.clientX,e.clientY);
      const nx=snapGrid(Math.max(55,Math.min(g.W-55,pnt.x+cmos.drag.dx)));
      const ny=snapGrid(Math.max(g.workTop+26,Math.min(g.workBottom-26,pnt.y+cmos.drag.dy)));

      if(Math.abs(nx-d.x)>1 || Math.abs(ny-d.y)>1) cmos.drag.moved=true;
      d.x=nx; d.y=ny;

      // Update just the geometry by re-rendering.
      renderCmosCanvas();
    });

    el.addEventListener("pointerup",e=>{
      if(cmos.drag && cmos.drag.id===el.dataset.device){
        cmos.drag=null;
        cmos.verdict=null;
        renderCmosToolbar();
        renderCmosCanvas();
        renderCmosTable();
        document.getElementById("cmos-feedback-card").style.display="none";
      }
    });

    el.addEventListener("click",e=>{
      e.stopPropagation();
      cmos.selected={type:"device",id:el.dataset.device};
      renderCmosToolbar();
      renderCmosCanvas();
    });
  });

  // Select wires.
  host.querySelectorAll(".schem-wire-hit").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      cmos.selected={type:"wire",id:el.dataset.wire};
      renderCmosToolbar();
      renderCmosCanvas();
    });

    el.addEventListener("dblclick",e=>{
      e.preventDefault();
      e.stopPropagation();
      const pnt=clientToSvg(e.clientX,e.clientY);
      const id=createJunctionOnWire(el.dataset.wire,pnt);
      if(id && id.startsWith("j")){
        cmos.selected={type:"junction",id};
        cmos.verdict=null;
      }
      renderCmosToolbar();
      renderCmosCanvas();
      renderCmosTable();
      document.getElementById("cmos-feedback-card").style.display="none";
    });
  });

  host.querySelectorAll(".junction-hot").forEach(el=>{
    el.addEventListener("click",e=>{
      e.stopPropagation();
      cmos.selected={type:"junction",id:el.dataset.junction};
      renderCmosToolbar();
      renderCmosCanvas();
    });
  });

  // Wire creation by dragging terminal -> terminal.
  // The visible circles stay small, but snapping works within a generous radius.
  host.querySelectorAll(".terminal-hot").forEach(term=>{
    term.addEventListener("pointerdown",e=>{
      if(e.button!==0) return;
      e.preventDefault();
      e.stopPropagation();

      const endpoint=term.dataset.endpoint;
      const from=endpointPosition(endpoint);
      if(!from) return;

      cmos.wiring={from:endpoint,snap:null};
      term.setPointerCapture(e.pointerId);

      let preview=svgEl.querySelector(".schem-preview");
      if(!preview){
        preview=document.createElementNS("http://www.w3.org/2000/svg","path");
        preview.setAttribute("class","schem-preview");
        svgEl.appendChild(preview);
      }

      function clearSnapVisual(){
        svgEl.querySelectorAll(".terminal.snap-target").forEach(n=>n.classList.remove("snap-target"));
      }

      function setSnapVisual(id){
        clearSnapVisual();
        if(!id) return;
        svgEl.querySelectorAll(`.terminal[data-endpoint="${id}"]`).forEach(n=>n.classList.add("snap-target"));
      }

      const move=ev=>{
        if(!cmos.wiring) return;

        const pnt=clientToSvg(ev.clientX,ev.clientY);
        const snap=nearestEndpoint(pnt,endpoint,28);
        const wireSnap=snap ? null : nearestWire(pnt,null,18);

        cmos.wiring.snap=snap ? {type:"endpoint",id:snap.id} :
          wireSnap ? {type:"wire",id:wireSnap.wire.id,point:{x:wireSnap.x,y:wireSnap.y}} : null;

        setSnapVisual(snap ? snap.id : null);

        const end=snap ? snap.pos :
          wireSnap ? {x:wireSnap.x,y:wireSnap.y} :
          pnt;

        preview.setAttribute("d",orthogonalPath(from,end));
      };

      const finish=ev=>{
        term.removeEventListener("pointermove",move);
        term.removeEventListener("pointerup",finish);
        term.removeEventListener("pointercancel",cancel);

        const pnt=clientToSvg(ev.clientX,ev.clientY);
        const snap=nearestEndpoint(pnt,endpoint,28);
        const wireSnap=snap ? null : nearestWire(pnt,null,18);
        const saved=cmos.wiring?.snap;

        clearSnapVisual();
        cmos.wiring=null;

        if(snap && snap.id!==endpoint){
          addWire(endpoint,snap.id);
        } else if(wireSnap){
          connectEndpointToWire(endpoint,wireSnap.wire.id,{x:wireSnap.x,y:wireSnap.y});
        } else if(saved?.type==="endpoint" && saved.id!==endpoint){
          addWire(endpoint,saved.id);
        } else if(saved?.type==="wire"){
          connectEndpointToWire(endpoint,saved.id,saved.point);
        } else {
          renderCmosCanvas();
        }
      };

      const cancel=()=>{
        term.removeEventListener("pointermove",move);
        term.removeEventListener("pointerup",finish);
        term.removeEventListener("pointercancel",cancel);
        clearSnapVisual();
        cmos.wiring=null;
        renderCmosCanvas();
      };

      term.addEventListener("pointermove",move);
      term.addEventListener("pointerup",finish);
      term.addEventListener("pointercancel",cancel);
    });
  });

  svgEl.addEventListener("click",()=>{
    if(!cmos.wiring){
      cmos.selected=null;
      renderCmosToolbar();
      renderCmosCanvas();
    }
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
    const ri=+td.dataset.ri, key=td.dataset.col, marks=cmos.table[ri].marks;
    if(marks.has(key)) marks.delete(key); else marks.add(key);
    cmos.verdict=null; renderCmosTable(); document.getElementById("cmos-feedback-card").style.display="none";
  }));
  host.querySelectorAll("td.vy").forEach(td=>td.addEventListener("click",()=>{
    const ri=+td.dataset.ri, cur=cmos.table[ri].vy;
    cmos.table[ri].vy = cur===null?0 : cur===0?3.3 : null;   // cycle blank -> 0V -> 3.3V -> blank
    cmos.verdict=null; renderCmosTable(); document.getElementById("cmos-feedback-card").style.display="none";
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
