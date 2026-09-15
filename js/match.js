/* ============================================================
   TRUTH TABLE <-> GATE MATCHING
   ============================================================ */
const matchState={p:null,gateTypes:[],tableOrder:[],assignments:[],armed:null,solved:false};

const MATCH_GATES={
  AND:{ name:"AND", fn:(a,b)=>a&b, svg:matchIconAND },
  OR:{ name:"OR", fn:(a,b)=>a|b, svg:matchIconOR },
  XOR:{ name:"XOR", fn:(a,b)=>a^b, svg:matchIconXOR },
  XNOR:{ name:"XNOR", fn:(a,b)=>(a^b)?0:1, svg:matchIconXNOR }
};

function matchIconAND(){
  return `<svg class="match-gate-svg" viewBox="0 0 130 84" role="img" aria-label="AND gate">
    <g class="gate-wire">
      <path d="M6 22 H40"/><path d="M6 62 H40"/><path d="M108 42 H124"/>
    </g>
    <path class="gate-symbol" d="M40 8 H64 C92 8 108 24 108 42 C108 60 92 76 64 76 H40 Z"/>
  </svg>`;
}
function matchIconOR(){
  return `<svg class="match-gate-svg" viewBox="0 0 130 84" role="img" aria-label="OR gate">
    <g class="gate-wire">
      <path d="M6 22 H34"/><path d="M6 62 H34"/><path d="M108 42 H124"/>
    </g>
    <path class="gate-symbol" d="M34 8 C52 8 70 8 86 20 C100 30 108 36 108 42 C108 48 100 54 86 64 C70 76 52 76 34 76 C46 58 46 26 34 8 Z"/>
  </svg>`;
}
function matchIconXOR(){
  return `<svg class="match-gate-svg" viewBox="0 0 130 84" role="img" aria-label="XOR gate">
    <g class="gate-wire">
      <path d="M10 22 H34"/><path d="M10 62 H34"/><path d="M108 42 H124"/>
    </g>
    <path class="gate-wire" d="M24 8 C36 26 36 58 24 76"/>
    <path class="gate-symbol" d="M34 8 C52 8 70 8 86 20 C100 30 108 36 108 42 C108 48 100 54 86 64 C70 76 52 76 34 76 C46 58 46 26 34 8 Z"/>
  </svg>`;
}
function matchIconXNOR(){
  return `<svg class="match-gate-svg" viewBox="0 0 130 84" role="img" aria-label="XNOR gate">
    <g class="gate-wire">
      <path d="M10 22 H34"/><path d="M10 62 H34"/><path d="M120 42 H130"/>
    </g>
    <path class="gate-wire" d="M24 8 C36 26 36 58 24 76"/>
    <path class="gate-symbol" d="M34 8 C52 8 70 8 86 20 C100 30 108 36 108 42 C108 48 100 54 86 64 C70 76 52 76 34 76 C46 58 46 26 34 8 Z"/>
    <circle class="gate-symbol match-bubble" cx="114" cy="42" r="6"/>
  </svg>`;
}

function matchShuffle(arr){
  const a=arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function matchLetter(i){ return String.fromCharCode(65+i); }

function matchTruthRows(fn){
  return [[0,0],[0,1],[1,0],[1,1]].map(([a,b])=>({A:a,B:b,Y:fn(a,b)}));
}

function buildMatchProblem(p){
  matchState.p=p;
  matchState.gateTypes=p.gates.slice();
  let order;
  do{ order=matchShuffle(matchState.gateTypes); }
  while(matchState.gateTypes.length>1 && order.every((g,i)=>g===matchState.gateTypes[i]));
  matchState.tableOrder=order;
  matchState.assignments=order.map(()=>null);
  matchState.armed=null;
  matchState.solved=false;
  matchRender();
  matchSetSolved(false);
  document.getElementById("match-feedback-card").style.display="none";
}

function matchRender(){
  matchRenderPool();
  matchRenderTables();
  matchRenderHint();
}

function matchRenderHint(){
  const hint=document.getElementById("match-hint");
  if(!hint) return;
  hint.textContent = matchState.armed
    ? `${MATCH_GATES[matchState.armed].name} is selected. Tap a truth table below to place it.`
    : "Tap a gate below, then tap the truth table you think it belongs to.";
}

function matchRenderPool(){
  const host=document.getElementById("match-gate-row");
  host.innerHTML=matchState.gateTypes.map(type=>{
    const g=MATCH_GATES[type];
    const placedAt=matchState.assignments.indexOf(type);
    const isArmed=matchState.armed===type;
    const classes=["match-gate-card"];
    if(isArmed) classes.push("is-armed");
    if(placedAt!==-1) classes.push("is-placed");
    const status = placedAt!==-1 ? `Placed on Table ${matchLetter(placedAt)}` : "&nbsp;";
    return `<button type="button" class="${classes.join(" ")}" data-gate="${type}" aria-pressed="${isArmed}">
      <span class="match-gate-icon">${g.svg()}</span>
      <span class="match-gate-name">${g.name}</span>
      <span class="match-gate-status">${status}</span>
    </button>`;
  }).join("");
  host.querySelectorAll(".match-gate-card").forEach(btn=>{
    btn.onclick=()=>matchPickGate(btn.dataset.gate);
  });
}

function matchRenderTables(){
  const host=document.getElementById("match-table-grid");
  host.innerHTML=matchState.tableOrder.map((gateType,index)=>{
    const rows=matchTruthRows(MATCH_GATES[gateType].fn);
    const body=rows.map((row,ri)=>`<tr><td>${row.A}</td><td>${row.B}</td><td>${row.Y}</td></tr>`).join("");
    const assigned=matchState.assignments[index];
    const slotClasses=["match-slot"];
    if(assigned) slotClasses.push("is-filled");
    const slotContent = assigned
      ? `<span class="match-slot-icon">${MATCH_GATES[assigned].svg()}</span><span class="match-slot-name">${MATCH_GATES[assigned].name}</span>`
      : `<span class="match-slot-placeholder">Tap a gate above, then tap here</span>`;
    return `<div class="match-table-card" data-index="${index}">
      <div class="match-table-label">Table ${matchLetter(index)}</div>
      <table class="match-truth-table">
        <thead><tr><th>A</th><th>B</th><th>Y</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
      <button type="button" class="${slotClasses.join(" ")}" data-index="${index}">${slotContent}</button>
    </div>`;
  }).join("");
  host.querySelectorAll(".match-slot").forEach(btn=>{
    btn.onclick=()=>matchPickSlot(+btn.dataset.index);
  });
}

function matchPickGate(type){
  if(matchState.solved) return;
  const placedAt=matchState.assignments.indexOf(type);
  if(placedAt!==-1){
    matchState.assignments[placedAt]=null;
    matchState.armed=type;
  } else {
    matchState.armed = matchState.armed===type ? null : type;
  }
  matchRender();
  document.getElementById("match-feedback-card").style.display="none";
}

function matchPickSlot(index){
  if(matchState.solved) return;
  if(matchState.armed){
    matchState.assignments[index]=matchState.armed;
    matchState.armed=null;
    matchRender();
  } else if(matchState.assignments[index]){
    matchState.assignments[index]=null;
    matchRender();
  } else {
    matchNudgeSlot(index);
  }
  document.getElementById("match-feedback-card").style.display="none";
}

function matchNudgeSlot(index){
  const card=document.querySelector(`.match-table-card[data-index="${index}"] .match-slot`);
  if(!card) return;
  card.classList.remove("nudge");
  void card.offsetWidth;
  card.classList.add("nudge");
}

function matchCheck(){
  let incomplete=0, wrong=0;
  const wrongLetters=[];
  document.querySelectorAll(".match-table-card").forEach(card=>{
    const index=+card.dataset.index;
    const slot=card.querySelector(".match-slot");
    const answer=matchState.assignments[index];
    const expected=matchState.tableOrder[index];
    slot.classList.remove("mark-good","mark-bad");
    if(!answer){ incomplete++; }
    else if(answer!==expected){ wrong++; wrongLetters.push(matchLetter(index)); slot.classList.add("mark-bad"); }
    else slot.classList.add("mark-good");
  });

  const feedback=document.getElementById("match-feedback");
  feedback.innerHTML="";
  const add=(kind,tag,message)=>{
    const item=document.createElement("div");
    item.className=`msg ${kind}`;
    item.innerHTML=`<span class="mtag">${tag}</span>${message}`;
    feedback.appendChild(item);
  };

  if(incomplete){
    add("info","Note",`Place a gate on ${incomplete} more table${incomplete===1?"":"s"} before checking.`);
  } else if(wrong){
    add("warn","Nudge",`Table${wrongLetters.length===1?"":"s"} ${wrongLetters.join(", ")} ${wrongLetters.length===1?"doesn't":"don't"} match yet. Compare the A=1,B=1 row first. That's where AND, OR, XOR, and XNOR all disagree.`);
  } else {
    add("success","Correct","Every truth table is matched to its gate.");
    matchSetSolved(true);
  }
  document.getElementById("match-feedback-card").style.display="block";
}

function matchSetSolved(solved){
  matchState.solved=solved;
  document.getElementById("match-workspace").classList.toggle("is-correct",solved);
  document.getElementById("match-actions").style.display=solved?"none":"flex";
  document.getElementById("match-complete-actions").style.display=solved?"flex":"none";
  document.getElementById("match-gate-row").classList.toggle("is-solved",solved);
  document.getElementById("match-table-grid").classList.toggle("is-solved",solved);
}

function matchReset(){
  matchState.assignments=matchState.tableOrder.map(()=>null);
  matchState.armed=null;
  matchRender();
  matchSetSolved(false);
  document.getElementById("match-feedback-card").style.display="none";
}

function matchExploreMoreProblems(){
  const back=document.getElementById("crumb-back-chapter");
  if(back) back.click();
}
