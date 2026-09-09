/* ============================================================
   SWITCH-LEVEL ANALYSIS TYPE  —  netlist solver + toggleable
   switch diagram + path reveal + feedback

   Staged flow: the input combinations are worked one at a time, in order
   (input1 = 0, input2 = 0 → input1 = 1, input2 = 0 → …). A stage must be
   submitted correctly before moving on; a correct stage turns the card
   green and swaps "Submit" for "Next / Previous". After the last stage the
   only actions are "Explore more problems / Previous".
   ============================================================ */
const sw = { p:null, net:null, rows:[], inV:{}, ans:[], showPath:false, verdict:null, stage:0, completed:null };

/* -- general switch-level solver: iterate node voltages to a fixed point -- */
function swStates(net, V){
  const st={};
  for(const t of net.transistors){ const g=V[t.gate]; st[t.name]=(g==null)?null:(t.kind==="pmos"?g===0:g===3.3); }
  return st;
}
function solveNet(net, fixedV){
  let V={}; net.nodes.forEach(n=> V[n]=(n in fixedV)?fixedV[n]:null);
  for(let it=0; it<16; it++){
    const st=swStates(net,V);
    const parent={}; net.nodes.forEach(n=>parent[n]=n);
    const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
    net.transistors.forEach(t=>{ if(st[t.name]===true) parent[find(t.a)]=find(t.b); });
    const nV={};
    net.nodes.forEach(n=>{
      if(n in fixedV){ nV[n]=fixedV[n]; return; }
      const r=find(n), toV=find("VDD")===r, toG=find("GND")===r;
      nV[n]=(toV&&toG)?"SHORT":toV?3.3:toG?0:null;
    });
    let changed=false; net.nodes.forEach(n=>{ if(nV[n]!==V[n]) changed=true; });
    V=nV; if(!changed) break;
  }
  return { V, st:swStates(net,V) };
}
/* connectivity implied by the student's asserted closed switches (for path reveal) */
function swRevealInfo(closed){
  const net=sw.net, parent={}; net.nodes.forEach(n=>parent[n]=n);
  const find=x=>{ while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; };
  net.transistors.forEach(t=>{ if(closed.has(t.name)) parent[find(t.a)]=find(t.b); });
  const rV=find("VDD"), rG=find("GND"), live=new Set();
  net.transistors.forEach(t=>{ if(closed.has(t.name)){ const r=find(t.a); if(r===rV||r===rG) live.add(t.name); } });
  return { live, node:n=>({toVDD:find(n)===rV, toGND:find(n)===rG}) };
}

/* Staged order: the FIRST input changes fastest, so a 2-input problem runs
   (0,0) → (1,0) → (0,1) → (1,1). */
function swInputRows(p){
  const ins=p.inputs, out=[];
  for(let m=0;m<(1<<ins.length);m++){ const a={}; ins.forEach((g,k)=>a[g]=((m>>k)&1)?3.3:0); out.push(a); }
  return out;
}
function swCurIndex(){ return sw.rows.findIndex(r=> sw.p.inputs.every(g=> r[g]===sw.inV[g])); }
function vColor(v){ return v===3.3?"var(--g0)":v===0?"var(--g2)":null; }
function netColor(reveal, netName){
  if(!reveal) return null;
  const c=reveal.node(netName);
  return (c.toVDD&&c.toGND)?"var(--warn)":c.toVDD?"var(--g0)":c.toGND?"var(--g2)":null;
}

/* -- glyphs -- */
function swGlyph(x,y,name,gate,kind,closed,liveCol,gateCol){
  const isPmos=kind==="pmos";
  const channelX=x-4;

  let s=`<g class="sw ${closed?"closed":"open"}">`;

  // Slight inward source/drain step to match the transistor schematic style.
  s+=`<path class="sterm" d="M ${x} ${y-22} L ${x} ${y-10} L ${channelX} ${y-10}"/>`;
  s+=`<path class="sterm" d="M ${channelX} ${y+10} L ${x} ${y+10} L ${x} ${y+22}"/>`;
  s+=`<circle class="scontact" cx="${channelX}" cy="${y-10}" r="2.4"/>`;
  s+=`<circle class="scontact" cx="${channelX}" cy="${y+10}" r="2.4"/>`;

  if(closed){
    s+=`<line class="slever" x1="${channelX}" y1="${y+10}" x2="${channelX}" y2="${y-10}"${liveCol?` style="stroke:${liveCol}"`:""}/>`;
  }else{
    s+=`<line class="slever" x1="${channelX}" y1="${y+10}" x2="${channelX-11}" y2="${y-7}"/>`;
  }

  if(isPmos){
    s+=`<line class="sgate" x1="${x-32}" y1="${y}" x2="${channelX-12}" y2="${y}"/>`;
    s+=`<circle class="sgatebubble" cx="${channelX-8}" cy="${y}" r="3.2"/>`;
  }else{
    s+=`<line class="sgate" x1="${x-32}" y1="${y}" x2="${channelX-4}" y2="${y}"/>`;
  }

  s+=`<text class="sname" x="${x+7}" y="${y-10}">${name}</text>`;
  s+=`<text x="${x-34}" y="${y+3}" text-anchor="end"${gateCol?` style="fill:${gateCol};font-weight:600"`:""}>${gate}</text>`;
  s+=`</g>`;
  return s;
}
function gndSym(x,y,col){ const st=col?` style="stroke:${col};stroke-width:2.4"`:""; return `<g class="wire"><line x1="${x-14}" y1="${y}" x2="${x+14}" y2="${y}"${st}/><line x1="${x-9}" y1="${y+5}" x2="${x+9}" y2="${y+5}"${st}/><line x1="${x-4}" y1="${y+10}" x2="${x+4}" y2="${y+10}"${st}/></g>`; }
function nodePill(x,y,node,val,ring){
  const vt=val===null?"?":(val===3.3?"3.3V":"0V"), w=60,h=26;
  return `<g class="nodepill" data-node="${node}"><rect x="${x-w/2}" y="${y-h/2}" width="${w}" height="${h}" rx="7"${ring?` style="stroke:${ring};stroke-width:2.5"`:""}/><text x="${x}" y="${y+4}" text-anchor="middle">${node} = ${vt}</text></g>`;
}

/* -- build / render -- */
function buildSwitch(p){
  sw.p=p;
  sw.net={nodes:p.nodes, transistors:p.transistors};
  sw.rows=swInputRows(p);
  sw.showPath=false;
  sw.verdict=null;
  sw.completed=new Set();
  sw.stage=0;
  sw.inV=Object.fromEntries(p.inputs.map(g=>[g, sw.rows[0][g]]));
  sw.ans=sw.rows.map(()=>({
    closed:new Set(),
    V:Object.fromEntries(
      p.columns.filter(c=>c.type==="node").map(c=>[c.key,null])
    )
  }));

  swRefresh();
  document.getElementById("sw-feedback-card").style.display="none";
}

/* Re-render every part of the switch stage that can change together. */
function swRefresh(){
  renderSwToolbar();
  renderSwCanvas();
  swRenderActions();
  swUpdateCardState();
}

/* Green "correct" treatment on the whole card for the current stage. */
function swUpdateCardState(){
  const card=document.getElementById("sw-main-card");
  if(card) card.classList.toggle("is-correct", sw.completed.has(sw.stage));
}

/* Contextual action buttons — the heart of the staged navigation.
   • unsolved stage       → Submit (+ Previous)
   • solved, not last     → Next   (+ Previous)
   • solved, last stage   → Explore more problems (+ Previous)
   Submit never shows once a stage is correct. */
function swRenderActions(){
  const host=document.getElementById("sw-actions");
  if(!host) return;
  const N=sw.rows.length, s=sw.stage;
  const solved=sw.completed.has(s);
  const isLast=s===N-1;
  const back = s>0 ? `<button class="btn ghost" type="button" onclick="swPrev()">&larr; Previous</button>` : "";

  let html="";
  if(!solved){
    html=`<button class="btn" id="sw-submit" type="button" onclick="swCheck()">Submit combination</button>${back}`;
  } else if(isLast){
    html=`<button class="btn" type="button" onclick="swExploreMoreProblems()">Explore more problems &rarr;</button>${back}`;
  } else {
    html=`<button class="btn" type="button" onclick="swNext()">Next combination &rarr;</button>${back}`;
  }
  host.innerHTML=html;
}

function renderSwToolbar(){
  const p=sw.p, host=document.getElementById("sw-toolbar");
  const N=sw.rows.length, s=sw.stage, row=sw.rows[s];

  const dots=sw.rows.map((r,i)=>{
    const done=sw.completed.has(i), cur=i===s;
    return `<span class="sw-step${done?" done":""}${cur?" current":""}">${done && !cur ? "\u2713" : (i+1)}</span>`;
  }).join("");

  const inputsText=p.inputs.map(g=>`${g} = ${fmtV(row[g])}`).join("\u00a0\u00a0·\u00a0\u00a0");

  const legend = sw.showPath ? `<div class="sw-legend">
      <span style="color:var(--g0)"><i></i>high · to VDD (3.3 V)</span>
      <span style="color:var(--g2)"><i></i>low · to GND (0 V)</span>
      <span style="color:var(--ok)"><i></i>closed switch (conducting)</span>
    </div>` : "";

  host.innerHTML=`
    <div class="sw-toolrow">
      <div class="combo-select">
        <span class="tg-label">Combination ${s+1} of ${N}</span>
        <div class="sw-stagebar">${dots}</div>
        <div class="sw-stage-inputs">${inputsText}</div>
      </div>

      <button
        class="reveal-btn ${sw.showPath?"on":""}"
        id="sw-reveal"
        type="button">
        <span class="reveal-dot"></span>
        Show conducting path
      </button>
    </div>

    <div class="sw-progress-inline">
      <b>${sw.completed.size}</b> of <b>${N}</b> combinations solved.
      <button class="sw-reset-link" id="sw-reset" type="button">Reset problem</button>
    </div>

    ${legend}
  `;

  document.getElementById("sw-reveal").onclick=()=>{
    sw.showPath=!sw.showPath;
    renderSwToolbar();
    renderSwCanvas();
  };
  const rb=document.getElementById("sw-reset");
  if(rb) rb.onclick=swReset;
}

function renderSwCanvas(){
  const p=sw.p, L=p.layout, cur=swCurIndex(), a=sw.ans[cur];
  const reveal = sw.showPath ? swRevealInfo(a.closed) : null;
  const gateV = g => (g in sw.inV) ? sw.inV[g] : (g in a.V ? a.V[g] : null);
  let s=`<svg class="cell-svg" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}" xmlns="http://www.w3.org/2000/svg">`;
  const vddCol = reveal ? "var(--g0)" : null;
  s+=`<line class="rail" x1="${L.vddX[0]}" y1="${L.vddY}" x2="${L.vddX[1]}" y2="${L.vddY}"${vddCol?` style="stroke:${vddCol}"`:""}/>`;
  s+=`<text class="pwr-tag" x="${L.vddX[1]}" y="${L.vddY-8}" text-anchor="end">VDD = 3.3V</text>`;
  L.wires.forEach(w=>{ const col=netColor(reveal,w.n); s+=`<polyline class="wire" fill="none" points="${w.p.map(pt=>pt.join(",")).join(" ")}"${col?` style="stroke:${col};stroke-width:3"`:""}/>`; });
  L.grounds.forEach(g=>{ s+=gndSym(g.x,g.y, reveal?"var(--g2)":null); });
  for(const name in L.trans){
    const tl=L.trans[name], t=sw.net.transistors.find(t=>t.name===name), closed=a.closed.has(name);
    const liveCol=(reveal && closed && reveal.live.has(name)) ? "var(--ok)" : null;
    s+=swGlyph(tl.x,tl.y,name,t.gate,t.kind,closed,liveCol,vColor(gateV(t.gate)));
    s+=`<rect class="sw-hit" data-name="${name}" x="${tl.x-24}" y="${tl.y-26}" width="48" height="52"/>`;
  }
  L.nodes.forEach(nd=>{
    let ring=null;
    if(reveal){ const c=reveal.node(nd.node); ring=(c.toVDD&&c.toGND)?"var(--warn)":c.toVDD?"var(--g0)":c.toGND?"var(--g2)":"var(--muted)"; }
    s+=nodePill(nd.x,nd.y,nd.node,a.V[nd.node],ring);
  });
  s+=`</svg>`;
  const host=document.getElementById("sw-canvas"); host.innerHTML=s;
  host.querySelectorAll(".sw-hit").forEach(h=>h.addEventListener("click",()=>{
    const ri=swCurIndex();
    const n=h.dataset.name, cl=sw.ans[ri].closed;
    cl.has(n)?cl.delete(n):cl.add(n);
    sw.completed.delete(ri);
    sw.verdict=null;
    document.getElementById("sw-feedback-card").style.display="none";
    swRefresh();
  }));
  host.querySelectorAll(".nodepill").forEach(pl=>pl.addEventListener("click",()=>{
    const ri=swCurIndex();
    const n=pl.dataset.node, V=sw.ans[ri].V;
    V[n]=V[n]===null?0:V[n]===0?3.3:null;
    sw.completed.delete(ri);
    sw.verdict=null;
    document.getElementById("sw-feedback-card").style.display="none";
    swRefresh();
  }));
}

/* -- staged navigation -- */
function swGoStage(i){
  i=Math.max(0,Math.min(sw.rows.length-1,i));
  sw.stage=i;
  const row=sw.rows[i];
  sw.p.inputs.forEach(g=>sw.inV[g]=row[g]);
  sw.verdict=null;
  document.getElementById("sw-feedback-card").style.display="none";
  swRefresh();
}
function swPrev(){ if(sw.stage>0) swGoStage(sw.stage-1); }
function swNext(){ if(sw.completed.has(sw.stage) && sw.stage<sw.rows.length-1) swGoStage(sw.stage+1); }

/* Hand back to the chapter's problem list (same target as the breadcrumb). */
function swExploreMoreProblems(){
  const b=document.getElementById("crumb-back-chapter");
  if(b) b.click();
}

function swCheck(){
  const p=sw.p;
  const ri=swCurIndex();
  const assign=sw.rows[ri];
  const answer=sw.ans[ri];

  const solved=solveNet(sw.net,{VDD:3.3,GND:0,...assign});
  const truth={
    V:solved.V,
    closed:new Set(Object.keys(solved.st).filter(k=>solved.st[k]===true))
  };

  let swWrong=0;
  let nodeWrong=0;
  let incomplete=0;

  p.columns.forEach(col=>{
    if(col.type==="trans"){
      if(answer.closed.has(col.key)!==truth.closed.has(col.key)) swWrong++;
    } else if(col.type==="node"){
      const v=answer.V[col.key];
      if(v===null) incomplete++;
      else if(v!==truth.V[col.key]) nodeWrong++;
    }
  });

  const host=document.getElementById("sw-feedback");
  host.innerHTML="";
  const msgs=[];

  if(incomplete){
    msgs.push({
      s:"info",
      t:`Set ${incomplete} remaining node voltage${incomplete===1?"":"s"} before submitting this combination.`
    });
  }

  if(swWrong){
    msgs.push({
      s:"warn",
      t:`${swWrong} switch state${swWrong===1?" needs":"s need"} another look. Remember: PMOS closes for a LOW gate; NMOS closes for a HIGH gate.`
    });
  }

  if(nodeWrong){
    msgs.push({
      s:"warn",
      t:`${nodeWrong} node voltage${nodeWrong===1?" is":"s are"} incorrect. Trace the closed switches from VDD and GND.`
    });
  }

  const correct=!swWrong && !nodeWrong && !incomplete;

  if(correct){
    sw.completed.add(ri);

    if(sw.completed.size===sw.rows.length){
      msgs.push({
        s:"success",
        t:"Correct — and that was the last combination. You've solved the whole circuit."
      });
    } else {
      msgs.push({
        s:"success",
        t:"Correct for this input combination. Use <b>Next combination</b> to continue."
      });
    }
  } else {
    sw.completed.delete(ri);
  }

  const tags={error:"Fix",warn:"Nudge",success:"Correct",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div");
    d.className="msg "+mo.s;
    d.innerHTML=`<span class="mtag">${tags[mo.s]||""}</span>${mo.t}`;
    host.appendChild(d);
  });

  renderSwToolbar();
  swRenderActions();
  swUpdateCardState();
  document.getElementById("sw-feedback-card").style.display="block";
}

function swReset(){ buildSwitch(sw.p); }