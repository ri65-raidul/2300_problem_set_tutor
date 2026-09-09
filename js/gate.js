/* ============================================================
   GATE-LEVEL TRUTH TABLE
   ============================================================ */
const gateState={p:null,rows:[],answers:[],solved:false};

function gateRows(inputs){
  const rows=[];
  for(let value=0;value<(1<<inputs.length);value++){
    const row={};
    inputs.forEach((name,index)=>{
      row[name]=(value>>(inputs.length-index-1))&1;
    });
    rows.push(row);
  }
  return rows;
}

function gateTruth(row){
  const X=row.A & row.B;
  return {X,Y:X | row.C};
}

function gateDiagram(){
  return `
    <svg class="gate-svg" viewBox="0 0 520 230" role="img"
      aria-label="Inputs A and B enter an AND gate to create X. X and C enter an OR gate to create Y.">
      <g class="gate-wire">
        <path d="M48 66 H142"/>
        <path d="M48 126 H142"/>
        <path d="M48 184 H322"/>
        <path d="M260 96 H322 V89"/>
        <path d="M440 126 H486"/>
      </g>
      <path class="gate-symbol" d="M142 42 H188 C236 42 260 62 260 96 C260 130 236 150 188 150 H142 Z"/>
      <path class="gate-symbol" d="M322 66 C350 66 387 68 414 88 C431 101 440 113 440 126 C440 139 431 151 414 164 C387 184 350 186 322 186 C340 153 340 99 322 66 Z"/>
      <g class="gate-label">
        <text x="30" y="71">A</text>
        <text x="30" y="131">B</text>
        <text x="30" y="189">C</text>
        <text x="280" y="88">X</text>
        <text x="494" y="131">Y</text>
      </g>
      <circle class="gate-node" cx="292" cy="96" r="3.5"/>
    </svg>`;
}

function buildGateProblem(p){
  gateState.p=p;
  gateState.rows=gateRows(p.inputs);
  gateState.answers=gateState.rows.map(()=>({X:null,Y:null}));
  gateState.solved=false;
  document.getElementById("gate-diagram").innerHTML=gateDiagram();
  gateRenderTable();
  gateSetSolved(false);
  document.getElementById("gate-feedback-card").style.display="none";
}

function gateRenderTable(){
  const head=[...gateState.p.inputs,...gateState.p.nodes]
    .map(name=>`<th class="${gateState.p.nodes.includes(name)?"derived":"given"}">${name}</th>`)
    .join("");
  const body=gateState.rows.map((row,index)=>{
    const inputs=gateState.p.inputs.map(name=>`<td class="given">${row[name]}</td>`).join("");
    const answers=gateState.p.nodes.map(name=>{
      const value=gateState.answers[index][name];
      return `<td class="gate-answer" data-row="${index}" data-node="${name}">
        <button type="button" aria-label="Set ${name} for row ${index+1}">${value===null?"?":value}</button>
      </td>`;
    }).join("");
    return `<tr>${inputs}${answers}</tr>`;
  }).join("");
  const host=document.getElementById("gate-table");
  host.innerHTML=`<table class="gate-truth-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  host.querySelectorAll(".gate-answer button").forEach(button=>{
    button.onclick=()=>gateToggle(button.closest("td"));
  });
}

function gateToggle(cell){
  if(gateState.solved) return;
  const row=+cell.dataset.row;
  const node=cell.dataset.node;
  const current=gateState.answers[row][node];
  gateState.answers[row][node]=current===0?1:0;
  gateRenderTable();
  document.getElementById("gate-feedback-card").style.display="none";
}

function gateCheck(){
  let incomplete=0;
  let wrong=0;
  document.querySelectorAll("#gate-table .gate-answer").forEach(cell=>{
    const row=+cell.dataset.row;
    const node=cell.dataset.node;
    const answer=gateState.answers[row][node];
    const expected=gateTruth(gateState.rows[row])[node];
    cell.classList.remove("mark-good","mark-bad");
    if(answer===null) incomplete++;
    else if(answer!==expected){ wrong++; cell.classList.add("mark-bad"); }
    else cell.classList.add("mark-good");
  });

  const feedback=document.getElementById("gate-feedback");
  feedback.innerHTML="";
  const add=(kind,tag,message)=>{
    const item=document.createElement("div");
    item.className=`msg ${kind}`;
    item.innerHTML=`<span class="mtag">${tag}</span>${message}`;
    feedback.appendChild(item);
  };

  if(incomplete){
    add("info","Note",`Complete ${incomplete} remaining cell${incomplete===1?"":"s"} before submitting.`);
  } else if(wrong){
    add("warn","Nudge",`${wrong} cell${wrong===1?" needs":"s need"} another look. Find X from the AND gate before using X and C to find Y.`);
  } else {
    add("success","Correct","The truth table matches the gate-level network.");
    gateSetSolved(true);
  }
  document.getElementById("gate-feedback-card").style.display="block";
}

function gateSetSolved(solved){
  gateState.solved=solved;
  document.getElementById("gate-workspace").classList.toggle("is-correct",solved);
  document.getElementById("gate-actions").style.display=solved?"none":"flex";
  document.getElementById("gate-complete-actions").style.display=solved?"flex":"none";
  document.getElementById("gate-table").classList.toggle("is-solved",solved);
}

function gateReset(){
  gateState.answers=gateState.rows.map(()=>({X:null,Y:null}));
  gateRenderTable();
  gateSetSolved(false);
  document.getElementById("gate-feedback-card").style.display="none";
}

function gateExploreMoreProblems(){
  const back=document.getElementById("crumb-back-chapter");
  if(back) back.click();
}
