// App.js

/* Developer mode: append ?dev=1 to the URL (e.g. index.html?dev=1#/problem/p2-5)
   to reveal "skip to last stage" shortcuts on staged problems, for testing a
   later stage without re-solving every stage before it. Never shown to students
   by default — it's purely a query-string opt-in. */
const DEV_MODE = new URLSearchParams(location.search).has("dev");

/* ============================================================
   STATE + NAVIGATION
   ============================================================ */
const state = { chapterNumber:null, problemId:null, pending:new Set(), groups:[] };

function chapterOf(n){ return CHAPTERS.find(c=>c.number===n); }
function chapterVisible(n){ const c=chapterOf(n); return !!c && !c.hidden; }
function problemsIn(n){ return PROBLEMS.filter(p=>p.chapter===n); }

/* Badge text intentionally names problem length, not difficulty, so a student
   who clears the "long" problems doesn't read that as "ready for the prelim". */
const DIFF_LABELS = { easy:"Short", med:"Medium", hard:"Long" };

/* ---- router: each screen gets its own URL hash so the browser's
        Back / Forward buttons (and mobile swipe-back) move between them ---- */
function showView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById("view-"+view).classList.add("active");
  window.scrollTo({top:0, behavior:"instant" in window ? "instant" : "auto"});
}
function routeToHash(route){
  if(route.view==="problems") return `#/chapter/${route.chapter}`;
  if(route.view==="solver")   return `#/problem/${route.problem}`;
  return "#/";
}
function parseHash(){
  const h=location.hash; let m;
  if((m=h.match(/^#\/chapter\/(\d+)/)))            return {view:"problems", chapter:+m[1]};
  if((m=h.match(/^#\/problem\/([A-Za-z0-9_-]+)/))) return {view:"solver",   problem:m[1]};
  return {view:"chapters"};
}
/* draw a screen for a route — does NOT touch history (called on load & on Back/Forward) */
function render(route){
  if(route.view==="problems" && chapterVisible(route.chapter) && problemsIn(route.chapter).length){
    buildProblems(route.chapter); showView("problems");
  } else if(route.view==="solver" && PROBLEMS.some(p=>p.id===route.problem && chapterVisible(p.chapter))){
    buildSolver(route.problem); showView("solver");
  } else {
    showView("chapters");
  }
}
/* go to a screen AND add a history entry (called when the user clicks) */
function navigate(route){
  const hash=routeToHash(route);
  if(location.hash===hash) render(route);   // same address: just draw it
  else location.hash=hash;                   // new address: fires 'hashchange' -> render()
}
window.addEventListener("hashchange", ()=>render(parseHash()));

function goChapters(){ navigate({view:"chapters"}); }
function openChapter(n){ navigate({view:"problems", chapter:n}); }
function openProblem(id){ navigate({view:"solver", problem:id}); }

/* ---- chapters view ---- */
function renderChapters(){
  const host=document.getElementById("chapters"); host.innerHTML="";
  for(const c of CHAPTERS){
    if(c.hidden) continue;
    const count=problemsIn(c.number).length;
    const locked = c.locked || count===0;
    const el=document.createElement(locked?"div":"button");
    el.className="chapter"+(locked?" locked":"");
    el.innerHTML=`
      <span class="num">TOPIC ${c.number}</span>
      <span class="ctitle">${c.title}</span>
      ${locked?'<span class="pill">Coming soon</span>':'<span class="arrow" aria-hidden="true">→</span>'}`;
    if(!locked) el.onclick=()=>openChapter(c.number);
    host.appendChild(el);
  }
}

/* Previous/next links between sibling topics, mirroring renderSolverPager
   below — only topics a student can actually open (visible, with problems)
   count as siblings, so a hidden or "coming soon" topic is never a target. */
function navigableChapters(){ return CHAPTERS.filter(c=>!c.hidden && problemsIn(c.number).length); }
function renderChapterPager(c){
  const host=document.getElementById("chapter-pager");
  if(!host) return;
  const siblings=navigableChapters();
  const i=siblings.findIndex(x=>x.number===c.number);
  const prevC = i>0 ? siblings[i-1] : null;
  const nextC = i<siblings.length-1 ? siblings[i+1] : null;

  const side=(target,dir)=>{
    if(!target) return `<span class="pager-link disabled">${dir==="prev"?"← Previous topic":"Next topic →"}</span>`;
    const label=dir==="prev" ? `← Topic ${target.number}: ${target.title}` : `Topic ${target.number}: ${target.title} →`;
    return `<button type="button" class="pager-link" data-n="${target.number}">${label}</button>`;
  };

  host.innerHTML=side(prevC,"prev")+side(nextC,"next");
  host.querySelectorAll(".pager-link[data-n]").forEach(btn=>{
    btn.onclick=()=>openChapter(+btn.dataset.n);
  });
}

/* ---- problem list view ---- */
function buildProblems(n){
  state.chapterNumber=n;
  const c=chapterOf(n);
  document.getElementById("crumb-chapter").textContent=`Topic ${c.number}`;
  renderChapterPager(c);
  document.getElementById("prob-eyebrow").textContent=`Topic ${c.number}`;
  document.getElementById("prob-title").textContent=c.title;
  document.getElementById("prob-desc").textContent=c.description;
  const host=document.getElementById("plist"); host.innerHTML="";
  problemsIn(n).forEach((p,idx)=>{
    const b=document.createElement("button"); b.className="prow";
    b.innerHTML=`
      <span class="pidx">${String(idx+1).padStart(2,"0")}</span>
      <span class="pmid">
        <span class="pname">${p.title}</span>
      </span>
      <span class="diff ${p.diff}">${DIFF_LABELS[p.diff]||p.diff}</span>
      <span class="parrow">→</span>`;
    b.onclick=()=>openProblem(p.id);
    host.appendChild(b);
  });
}

/* ---- solver view ---- */
function fnString(p){
  let s=`F(${p.variables.join(",")}) = \u03A3m(${p.minterms.join(",")})`;
  if(p.dontcares && p.dontcares.length) s+=` + d(${p.dontcares.join(",")})`;
  return s;
}
/* one-line subtitle for the problem list, per type */
function problemSubtitle(p){
  if(p.type==="cmos") return `CMOS · complete the ${p.build==="pullup"?"pull-up":"pull-down"} network`;
  if(p.type==="switch") return `Switch-level · trace closed/open switches`;
  if(p.type==="timing") return `Timing diagram`;
  if(p.type==="gate") return `Gate-level · complete the truth table`;
  if(p.type==="match") return `Gate-level · match truth tables to gates`;
  if(p.type==="norbuild") return `Gate-level · build gates from ${p.primitive==="NAND"?"NAND2":"NOR2"}`;
  if(p.type==="glnet") return `Gate-level · truth table, timing analysis & diagram`;
  if(p.type==="sop") return `Gate-level · wire the sum of canonical products`;
  return fnString(p);
}
function currentProblem(){ return PROBLEMS.find(p=>p.id===state.problemId); }

/* Previous/next links between sibling problems within the same chapter. */
function renderSolverPager(p){
  const host=document.getElementById("solver-pager");
  if(!host) return;
  const siblings=problemsIn(p.chapter);
  const i=siblings.findIndex(x=>x.id===p.id);
  const prevP = i>0 ? siblings[i-1] : null;
  const nextP = i<siblings.length-1 ? siblings[i+1] : null;

  const side=(target,dir)=>{
    if(!target) return `<span class="pager-link disabled">${dir==="prev"?"← Previous problem":"Next problem →"}</span>`;
    const label=dir==="prev" ? `← ${target.title}` : `${target.title} →`;
    return `<button type="button" class="pager-link" data-id="${target.id}">${label}</button>`;
  };

  host.innerHTML=side(prevP,"prev")+side(nextP,"next");
  host.querySelectorAll(".pager-link[data-id]").forEach(btn=>{
    btn.onclick=()=>openProblem(btn.dataset.id);
  });
}

function buildSolver(id){
  state.problemId=id; state.pending=new Set(); state.groups=[];
  const p=currentProblem(); const c=chapterOf(p.chapter);
  document.getElementById("crumb-back-chapter").textContent=`Topic ${c.number}`;
  document.getElementById("crumb-back-chapter").onclick=()=>openChapter(p.chapter);
  document.getElementById("crumb-problem").textContent=p.title;
  document.getElementById("solve-title").textContent=p.title;
  renderSolverPager(p);

  const question=document.getElementById("solve-question");
  const prompt=document.getElementById("solve-prompt");
  const fn=document.getElementById("solve-fn");

  const views={
    kmap:document.getElementById("solver-kmap"),
    cmos:document.getElementById("solver-cmos"),
    sw:document.getElementById("solver-switch"),
    timing:document.getElementById("solver-timing"),
    gate:document.getElementById("solver-gate"),
    match:document.getElementById("solver-match"),
    norbuild:document.getElementById("solver-nor"),
    glnet:document.getElementById("solver-glnet"),
    sop:document.getElementById("solver-sop")
  };
  Object.values(views).forEach(v=>v.style.display="none");

  if(p.type==="cmos"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.cmos.style.display="block";
    const buildDesc=document.querySelector("#solver-cmos .workspace-desc");
    if(buildDesc){
      buildDesc.textContent=p.build==="pulldown"
        ? "Drag and wire NMOS transistors below Vᵧ."
        : "Drag and wire PMOS transistors above Vᵧ.";
    }
    buildCmos(p);
  } else if(p.type==="switch"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.sw.style.display="block";
    buildSwitch(p);
  } else if(p.type==="timing"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.timing.style.display="block";
    buildTiming(p);
  } else if(p.type==="gate"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.gate.style.display="block";
    buildGateProblem(p);
  } else if(p.type==="match"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.match.style.display="block";
    buildMatchProblem(p);
  } else if(p.type==="norbuild"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.norbuild.style.display="block";
    buildNorProblem(p);
  } else if(p.type==="glnet"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.glnet.style.display="block";
    buildGlnet(p);
  } else if(p.type==="sop"){
    document.getElementById("solve-eyebrow").textContent="";
    question.style.display="block";
    prompt.textContent=p.prompt;
    fn.style.display="none";
    views.sop.style.display="block";
    buildSop(p);
  } else {
    document.getElementById("solve-eyebrow").textContent=`Karnaugh map · ${p.variables.length} variables`;
    question.style.display="none";
    prompt.textContent="";
    fn.style.display="inline-block";
    fn.textContent=fnString(p);
    views.kmap.style.display="block";
    buildGrid(p);
    renderSolver();
    hideFeedback();
  }
}

function buildGrid(p){
  const grid=document.getElementById("kgrid");
  grid.innerHTML="";
  // corner
  const corner=document.createElement("div"); corner.className="kcorner";
  corner.innerHTML=`<span>AB\\CD</span>`; grid.appendChild(corner);
  // column headers (CD)
  for(let col=0; col<4; col++){
    const h=document.createElement("div"); h.className="khead"; h.textContent=gray2bin(GRAY[col]); grid.appendChild(h);
  }
  // rows
  for(let row=0; row<4; row++){
    const side=document.createElement("div"); side.className="kside"; side.textContent=gray2bin(GRAY[row]); grid.appendChild(side);
    for(let col=0; col<4; col++){
      const m=cellMinterm(row,col);
      const btn=document.createElement("button");
      btn.className="cell"; btn.dataset.min=m;
      const isMin=p.minterms.includes(m), isDC=(p.dontcares||[]).includes(m);
      if(isDC){ btn.classList.add("dc"); } else if(!isMin){ btn.classList.add("zero"); }
      const v = isDC ? "X" : (isMin ? "1" : "0");
      btn.innerHTML=`<span class="val">${v}</span>`;
      btn.setAttribute("aria-label",`Cell minterm ${m}, value ${v}`);
      btn.onclick=()=>toggleCell(m);
      grid.appendChild(btn);
    }
  }
}

function toggleCell(m){
  if(state.pending.has(m)) state.pending.delete(m); else state.pending.add(m);
  paintGrid(); updatePendingUI(); hideFeedback();
}
function clearPending(){ state.pending.clear(); paintGrid(); updatePendingUI(); }
function addGroup(){
  if(state.pending.size===0) return;
  state.groups.push({ cells:new Set(state.pending) });
  state.pending.clear();
  paintGrid(); updatePendingUI(); renderGroups(); renderExpr(); hideFeedback();
}
function removeGroup(i){
  state.groups.splice(i,1);
  paintGrid(); renderGroups(); renderExpr(); hideFeedback();
}
function resetProblem(){
  state.pending.clear(); state.groups=[];
  paintGrid(); updatePendingUI(); renderGroups(); renderExpr(); hideFeedback();
}

/* paint group rings + pending onto the grid */
function paintGrid(){
  const cells=document.querySelectorAll("#kgrid .cell");
  cells.forEach(cell=>{
    const m=+cell.dataset.min;
    cell.classList.toggle("pending", state.pending.has(m));
    cell.querySelectorAll(".ring").forEach(r=>r.remove());
    let depth=0;
    state.groups.forEach((g,gi)=>{
      if(g.cells.has(m)){
        const ring=document.createElement("span");
        ring.className="ring";
        const inset=4 + depth*5;
        ring.style.cssText=`inset:${inset}px; --rc:${PALETTE[gi%PALETTE.length]};`;
        cell.appendChild(ring);
        depth++;
      }
    });
  });
}
function updatePendingUI(){
  const n=state.pending.size;
  document.getElementById("pending-count").textContent = n+" cell"+(n===1?"":"s")+" selected";
  document.getElementById("btn-add").disabled = n===0;
  document.getElementById("btn-clear").disabled = n===0;
}
function renderGroups(){
  const host=document.getElementById("glist"); host.innerHTML="";
  if(state.groups.length===0){ host.innerHTML=`<div class="empty">No groups yet.</div>`; return; }
  state.groups.forEach((g,i)=>{
    const cells=[...g.cells]; const valid=isValidGroup(cells);
    const row=document.createElement("div"); row.className="gitem";
    row.style.setProperty("--rc", PALETTE[i%PALETTE.length]);
    row.innerHTML=`
      <span class="chip"></span>
      <span class="gterm">${valid?termString(cells):"invalid"}</span>
      <span class="gsize">${cells.length} cell${cells.length===1?"":"s"}</span>
      <button class="grm" title="Remove group" aria-label="Remove group ${i+1}">×</button>`;
    row.querySelector(".grm").onclick=()=>removeGroup(i);
    row.onmouseenter=()=>emphasize(g,true);
    row.onmouseleave=()=>emphasize(g,false);
    host.appendChild(row);
  });
}
function emphasize(g,on){
  document.querySelectorAll("#kgrid .cell").forEach(cell=>{
    if(g.cells.has(+cell.dataset.min)) cell.classList.toggle("emph",on);
  });
}
function renderExpr(){
  document.getElementById("expr").innerHTML=`<span class="lbl">F =</span> ${expression(state.groups)}`;
}
function renderSolver(){ paintGrid(); updatePendingUI(); renderGroups(); renderExpr(); }

/* ---- feedback ---- */
function checkAnswer(){
  const msgs=evaluate(currentProblem(), state.groups);
  const host=document.getElementById("feedback"); host.innerHTML="";
  const tags={error:"Fix",warn:"Nudge",success:"Solved",info:"Note"};
  msgs.forEach(mo=>{
    const d=document.createElement("div"); d.className="msg "+mo.s;
    d.innerHTML=`<span class="mtag">${tags[mo.s]||""}</span>${mo.t}`;
    host.appendChild(d);
  });
  document.getElementById("feedback-card").style.display="block";
}
function hideFeedback(){ const c=document.getElementById("feedback-card"); if(c) c.style.display="none"; }
