/* ============================================================
   TIMING DIAGRAM PROBLEM TYPE
   ============================================================ */
const timing={p:null,bins:[],expected:[],dragging:false,drawValue:null,lastBin:null,hover:null,verdict:false};

function timingValueAt(events,t){
  let v=events[0][1];
  for(const [et,ev] of events){ if(et<=t)v=ev; else break; }
  return v;
}

function timingComputeSignal(p,name){
  const T=p.timing, n=T.duration/T.step;
  if(T.inputs[name]) return Array.from({length:n},(_,i)=>timingValueAt(T.inputs[name],i*T.step+T.step/2));
  const d=T.derived[name];
  if(!d) return Array(n).fill(0);

  let raw;
  if(d.op==="not"){
    const a=timingComputeSignal(p,d.in);
    raw=a.map(v=>v?0:1);
  } else if(d.op==="nor"){
    const ins=d.ins.map(s=>timingComputeSignal(p,s));
    raw=Array.from({length:n},(_,i)=>ins.every(a=>a[i]===0)?1:0);
  } else raw=Array(n).fill(0);

  const shift=Math.round((d.delay||0)/T.step);
  if(!shift) return raw;
  return Array.from({length:n},(_,i)=>i-shift>=0?raw[i-shift]:raw[0]);
}

function renderTimingCircuit(){
  const p=timing.p;
  const isDelay = p.timing.model==="delay";
  const invDelay = p.timing.delays?.inverter;
  const norDelay = p.timing.delays?.nor;

  const svg = `
    <svg class="timing-circuit-svg" viewBox="0 0 760 285" xmlns="http://www.w3.org/2000/svg">
      <!-- ======================================================
           LEFT STAGE: CMOS INVERTER, Va -> Vx
           ====================================================== -->

      <!-- VDD rail over inverter -->
      <line class="timing-circuit-wire" x1="95" y1="28" x2="245" y2="28"/>
      <text class="timing-circuit-label" x="102" y="20">VDD</text>

      <!-- P0 -->
      <line class="timing-circuit-wire" x1="170" y1="28" x2="170" y2="58"/>
      <path class="timing-circuit-trans" d="M 170 58 L 170 64 L 165 64 L 165 90 L 170 90 L 170 96"/>
      <line class="timing-circuit-trans" x1="154" y1="64" x2="154" y2="90"/>
      <line class="timing-circuit-wire" x1="106" y1="77" x2="145" y2="77"/>
      <circle class="timing-circuit-bubble" cx="150" cy="77" r="4"/>
      <text class="timing-circuit-label" x="178" y="72">P0</text>

      <!-- N0 -->
      <path class="timing-circuit-trans" d="M 170 126 L 170 132 L 165 132 L 165 158 L 170 158 L 170 164"/>
      <line class="timing-circuit-trans" x1="154" y1="132" x2="154" y2="158"/>
      <line class="timing-circuit-wire" x1="106" y1="145" x2="154" y2="145"/>
      <text class="timing-circuit-label" x="178" y="140">N0</text>

      <!-- Va shared gate connection -->
      <line class="timing-circuit-wire" x1="70" y1="111" x2="106" y2="111"/>
      <line class="timing-circuit-wire" x1="106" y1="77" x2="106" y2="145"/>
      <text class="timing-circuit-label" x="34" y="115">V<tspan baseline-shift="sub" font-size="9">a</tspan></text>

      <!-- Vx output -->
      <line class="timing-circuit-wire" x1="170" y1="96" x2="170" y2="126"/>
      <circle class="timing-circuit-node" cx="170" cy="111" r="3.7"/>
      <line class="timing-circuit-wire" x1="170" y1="111" x2="300" y2="111"/>
      <text class="timing-circuit-label" x="230" y="99">V<tspan baseline-shift="sub" font-size="9">x</tspan></text>

      <!-- Ground under inverter -->
      <line class="timing-circuit-wire" x1="170" y1="164" x2="170" y2="190"/>
      <line class="timing-circuit-wire" x1="148" y1="190" x2="192" y2="190"/>
      <line class="timing-circuit-wire" x1="154" y1="198" x2="186" y2="198"/>
      <line class="timing-circuit-wire" x1="161" y1="206" x2="179" y2="206"/>

      ${isDelay && invDelay!=null ? `
        <text class="timing-circuit-delay" x="118" y="232">t_inv = ${invDelay} ps</text>
      ` : ""}

      <!-- ======================================================
           RIGHT STAGE: CMOS NOR, inputs Vx and Vb -> Vy
           PUN = two PMOS in series
           PDN = two NMOS in parallel
           ====================================================== -->

      <!-- VDD rail -->
      <line class="timing-circuit-wire" x1="390" y1="28" x2="655" y2="28"/>
      <text class="timing-circuit-label" x="618" y="20">VDD</text>

      <!-- PMOS stack centered at x=505 -->

      <!-- P1, gate Vx -->
      <line class="timing-circuit-wire" x1="505" y1="28" x2="505" y2="54"/>
      <path class="timing-circuit-trans" d="M 505 54 L 505 60 L 500 60 L 500 82 L 505 82 L 505 88"/>
      <line class="timing-circuit-trans" x1="489" y1="60" x2="489" y2="82"/>
      <line class="timing-circuit-wire" x1="432" y1="71" x2="480" y2="71"/>
      <circle class="timing-circuit-bubble" cx="485" cy="71" r="4"/>
      <text class="timing-circuit-label" x="515" y="65">P1</text>
      <text class="timing-circuit-label" x="397" y="75">V<tspan baseline-shift="sub" font-size="9">x</tspan></text>

      <!-- Series connection -->
      <line class="timing-circuit-wire" x1="505" y1="88" x2="505" y2="104"/>

      <!-- P2, gate Vb -->
      <path class="timing-circuit-trans" d="M 505 104 L 505 110 L 500 110 L 500 132 L 505 132 L 505 138"/>
      <line class="timing-circuit-trans" x1="489" y1="110" x2="489" y2="132"/>
      <line class="timing-circuit-wire" x1="432" y1="121" x2="480" y2="121"/>
      <circle class="timing-circuit-bubble" cx="485" cy="121" r="4"/>
      <text class="timing-circuit-label" x="515" y="115">P2</text>
      <text class="timing-circuit-label" x="397" y="125">V<tspan baseline-shift="sub" font-size="9">b</tspan></text>

      <!-- Output Vy -->
      <line class="timing-circuit-wire" x1="505" y1="138" x2="505" y2="164"/>
      <circle class="timing-circuit-node" cx="505" cy="164" r="3.7"/>
      <line class="timing-circuit-wire" x1="505" y1="164" x2="662" y2="164"/>
      <text class="timing-circuit-label" x="672" y="168">V<tspan baseline-shift="sub" font-size="9">y</tspan></text>

      <!-- NMOS parallel branches -->
      <!-- branch rails -->
      <line class="timing-circuit-wire" x1="505" y1="164" x2="455" y2="164"/>
      <line class="timing-circuit-wire" x1="505" y1="164" x2="575" y2="164"/>

      <!-- N1 left, gate Vx -->
      <line class="timing-circuit-wire" x1="455" y1="164" x2="455" y2="182"/>
      <path class="timing-circuit-trans" d="M 455 182 L 455 188 L 450 188 L 450 212 L 455 212 L 455 218"/>
      <line class="timing-circuit-trans" x1="439" y1="188" x2="439" y2="212"/>
      <line class="timing-circuit-wire" x1="392" y1="200" x2="439" y2="200"/>
      <text class="timing-circuit-label" x="365" y="204">V<tspan baseline-shift="sub" font-size="9">x</tspan></text>
      <text class="timing-circuit-label" x="465" y="194">N1</text>

      <!-- N2 right, gate Vb -->
      <line class="timing-circuit-wire" x1="575" y1="164" x2="575" y2="182"/>
      <path class="timing-circuit-trans" d="M 575 182 L 575 188 L 570 188 L 570 212 L 575 212 L 575 218"/>
      <line class="timing-circuit-trans" x1="559" y1="188" x2="559" y2="212"/>
      <line class="timing-circuit-wire" x1="512" y1="200" x2="559" y2="200"/>
      <text class="timing-circuit-label" x="485" y="204">V<tspan baseline-shift="sub" font-size="9">b</tspan></text>
      <text class="timing-circuit-label" x="585" y="194">N2</text>

      <!-- common ground rail -->
      <line class="timing-circuit-wire" x1="455" y1="218" x2="455" y2="236"/>
      <line class="timing-circuit-wire" x1="575" y1="218" x2="575" y2="236"/>
      <line class="timing-circuit-wire" x1="455" y1="236" x2="575" y2="236"/>
      <line class="timing-circuit-wire" x1="515" y1="236" x2="515" y2="246"/>
      <line class="timing-circuit-wire" x1="493" y1="246" x2="537" y2="246"/>
      <line class="timing-circuit-wire" x1="499" y1="254" x2="531" y2="254"/>
      <line class="timing-circuit-wire" x1="506" y1="262" x2="524" y2="262"/>

      <!-- Vx fanout from inverter to NOR gates -->
      <line class="timing-circuit-wire" x1="300" y1="111" x2="342" y2="111"/>
      <circle class="timing-circuit-node" cx="342" cy="111" r="3"/>
      <line class="timing-circuit-wire" x1="342" y1="111" x2="342" y2="71"/>
      <line class="timing-circuit-wire" x1="342" y1="71" x2="392" y2="71"/>
      <line class="timing-circuit-wire" x1="342" y1="111" x2="342" y2="200"/>
      <line class="timing-circuit-wire" x1="342" y1="200" x2="392" y2="200"/>

      <!-- Vb fanout -->
      <text class="timing-circuit-label" x="300" y="151">V<tspan baseline-shift="sub" font-size="9">b</tspan></text>
      <line class="timing-circuit-wire" x1="322" y1="147" x2="372" y2="147"/>
      <circle class="timing-circuit-node" cx="372" cy="147" r="3"/>
      <line class="timing-circuit-wire" x1="372" y1="147" x2="372" y2="121"/>
      <line class="timing-circuit-wire" x1="372" y1="121" x2="397" y2="121"/>
      <line class="timing-circuit-wire" x1="372" y1="147" x2="372" y2="200"/>
      <line class="timing-circuit-wire" x1="372" y1="200" x2="485" y2="200"/>

      ${isDelay && norDelay!=null ? `
        <text class="timing-circuit-delay" x="470" y="282">t_nor = ${norDelay} ps</text>
      ` : ""}
    </svg>
  `;

  document.getElementById("timing-circuit").innerHTML = svg;
}

function buildTiming(p){
  timing.p=p;
  timing.expected=timingComputeSignal(p,"Vy");
  timing.bins=Array(timing.expected.length).fill(null);
  timing.dragging=false;
  timing.drawValue=null;
  timing.lastBin=null;
  timing.hover=null;
  timing.verdict=false;

  const T=p.timing;
  document.getElementById("timing-model-text").innerHTML=T.model==="zero"
    ? "Zero-delay model. Output changes occur immediately when the logical inputs change."
    : `Constant-delay model.<br><br>Inverter delay: <b>${T.delays.inverter} ps</b><br>NOR delay: <b>${T.delays.nor} ps</b>`;

  document.getElementById("timing-clear").onclick=()=>{
    timing.bins.fill(null);
    timing.verdict=false;
    timing.hover=null;
    document.getElementById("timing-feedback-card").style.display="none";
    renderTiming();
  };

  renderTimingCircuit();
  renderTiming();
  document.getElementById("timing-feedback-card").style.display="none";
}

function timingPath(bins,left,y0,rowH,binW,partial=false){
  const hi=y0+10, lo=y0+rowH-10;
  let d="",started=false;
  for(let i=0;i<bins.length;i++){
    const v=bins[i];
    if(v===null){started=false;continue;}
    const y=v?hi:lo,x0=left+i*binW,x1=left+(i+1)*binW;
    if(!started){d+=`M ${x0} ${y}`;started=true;}
    else if(bins[i-1]!==v){
      d+=` L ${x0} ${bins[i-1]?hi:lo} L ${x0} ${y}`;
    }
    d+=` L ${x1} ${y}`;
  }
  return d;
}

function renderTiming(){
  const p=timing.p,T=p.timing,n=T.duration/T.step;
  const W=760,left=82,right=24,top=18,rowH=68,plotW=W-left-right,binW=plotW/n;
  const H=top+rowH*T.signals.length+42;
  const vyIndex=T.signals.indexOf("Vy");
  const vyTop=top+vyIndex*rowH;
  const vyHi=vyTop+10;
  const vyLo=vyTop+rowH-10;

  let svg=`<svg class="timing-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;

  for(let i=0;i<=n;i++){
    const x=left+i*binW;
    svg+=`<line class="timing-grid" x1="${x}" y1="${top}" x2="${x}" y2="${top+rowH*T.signals.length}"/>`;
  }

  T.signals.forEach((name,ri)=>{
    const y0=top+ri*rowH,hi=y0+10,lo=y0+rowH-10;
    svg+=`<line class="timing-grid" x1="${left}" y1="${hi}" x2="${W-right}" y2="${hi}"/>`;
    svg+=`<line class="timing-grid" x1="${left}" y1="${lo}" x2="${W-right}" y2="${lo}"/>`;
    svg+=`<text class="timing-label" x="${left-50}" y="${y0+rowH/2+4}">${name}</text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${hi+3}" text-anchor="end">3.3V</text>`;
    svg+=`<text class="timing-small" x="${left-7}" y="${lo+3}" text-anchor="end">0V</text>`;

    if(name!=="Vy"){
      const bins=timingComputeSignal(p,name);
      svg+=`<path class="timing-wave-given" d="${timingPath(bins,left,y0,rowH,binW)}"/>`;
    }else{
      svg+=`<path id="timing-answer-path" class="timing-wave-answer" d="${timingPath(timing.bins,left,y0,rowH,binW,true)}"/>`;

      if(timing.verdict){
        svg+=`<path class="timing-wave-expected" d="${timingPath(timing.expected,left,y0,rowH,binW)}"/>`;
      }

      svg+=`<path id="timing-hover-preview" class="timing-hover-preview" d=""/>`;
      svg+=`<circle id="timing-hover-dot" class="timing-hover-dot" cx="0" cy="0" r="4" style="display:none"/>`;
      svg+=`<rect id="timing-draw-area" class="timing-hit" x="${left}" y="${y0}" width="${plotW}" height="${rowH}"/>`;
    }
  });

  for(let t=20;t<T.duration;t+=20){
    const x=left+(t/T.duration)*plotW;
    svg+=`<text class="timing-small" x="${x}" y="${top+rowH*T.signals.length+20}" text-anchor="middle">${t}ps</text>`;
  }

  svg+=`<line class="timing-axis" x1="${left}" y1="${top+rowH*T.signals.length+4}" x2="${W-right}" y2="${top+rowH*T.signals.length+4}"/>`;
  svg+=`<text class="timing-small" x="${W-right}" y="${top+rowH*T.signals.length+20}" text-anchor="end">time</text>`;
  svg+=`</svg>`;

  const host=document.getElementById("timing-canvas");
  host.innerHTML=svg;

  const svgEl=host.querySelector("svg");
  const drawArea=document.getElementById("timing-draw-area");
  const answerPath=document.getElementById("timing-answer-path");
  const preview=document.getElementById("timing-hover-preview");
  const hoverDot=document.getElementById("timing-hover-dot");

  function clientToSvg(clientX,clientY){
    const pt=svgEl.createSVGPoint();
    pt.x=clientX;
    pt.y=clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  function locationFromPointer(e){
    const pt=clientToSvg(e.clientX,e.clientY);
    const bin=Math.max(0,Math.min(n-1,Math.floor((pt.x-left)/binW)));
    const mid=(vyHi+vyLo)/2;
    const value=pt.y<mid ? 1 : 0;
    const y=value?vyHi:vyLo;
    return {pt,bin,value,y};
  }

  function refreshAnswerPath(){
    answerPath.setAttribute("d",timingPath(timing.bins,left,vyTop,rowH,binW,true));
  }

  function showPreview(bin,value){
    if(timing.dragging) return;
    const y=value?vyHi:vyLo;
    const x0=left+bin*binW+3;
    const x1=left+(bin+1)*binW-3;
    preview.setAttribute("d",`M ${x0} ${y} L ${x1} ${y}`);
    hoverDot.setAttribute("cx",(x0+x1)/2);
    hoverDot.setAttribute("cy",y);
    hoverDot.style.display="";
  }

  function hidePreview(){
    preview.setAttribute("d","");
    hoverDot.style.display="none";
  }

  function paintRange(a,b,value){
    const lo=Math.min(a,b), hi=Math.max(a,b);
    for(let i=lo;i<=hi;i++) timing.bins[i]=value;
    timing.verdict=false;
    document.getElementById("timing-feedback-card").style.display="none";
    refreshAnswerPath();
  }

  drawArea.addEventListener("pointermove",e=>{
    const loc=locationFromPointer(e);

    if(timing.dragging){
      if(loc.bin!==timing.lastBin){
        paintRange(timing.lastBin,loc.bin,timing.drawValue);
        timing.lastBin=loc.bin;
      }
    }else{
      showPreview(loc.bin,loc.value);
    }
  });

  drawArea.addEventListener("pointerenter",e=>{
    if(!timing.dragging){
      const loc=locationFromPointer(e);
      showPreview(loc.bin,loc.value);
    }
  });

  drawArea.addEventListener("pointerleave",()=>{
    if(!timing.dragging) hidePreview();
  });

  drawArea.addEventListener("pointerdown",e=>{
    if(e.button!==0) return;
    e.preventDefault();

    const loc=locationFromPointer(e);
    timing.dragging=true;
    timing.drawValue=loc.value;
    timing.lastBin=loc.bin;

    hidePreview();
    paintRange(loc.bin,loc.bin,loc.value);

    drawArea.setPointerCapture(e.pointerId);
  });

  drawArea.addEventListener("pointerup",e=>{
    if(!timing.dragging) return;
    timing.dragging=false;
    timing.drawValue=null;
    timing.lastBin=null;

    try{ drawArea.releasePointerCapture(e.pointerId); }catch{}

    const loc=locationFromPointer(e);
    showPreview(loc.bin,loc.value);
  });

  drawArea.addEventListener("pointercancel",()=>{
    timing.dragging=false;
    timing.drawValue=null;
    timing.lastBin=null;
    hidePreview();
  });
}

function timingCheck(){
  const host=document.getElementById("timing-feedback");host.innerHTML="";
  const missing=timing.bins.filter(v=>v===null).length;
  const wrong=timing.bins.reduce((n,v,i)=>n+(v!==null&&v!==timing.expected[i]?1:0),0);
  let msg;
  if(missing)msg={s:"info",tag:"Note",t:`Complete the remaining ${missing} time interval${missing===1?"":"s"} first.`};
  else if(wrong){msg={s:"warn",tag:"Nudge",t:`${wrong} time interval${wrong===1?" does":"s do"} not match the circuit. The dashed green waveform shows the expected result.`};timing.verdict=true;}
  else msg={s:"success",tag:"Correct",t:"Your output waveform is correct."};
  const d=document.createElement("div");d.className="msg "+msg.s;d.innerHTML=`<span class="mtag">${msg.tag}</span>${msg.t}`;host.appendChild(d);
  document.getElementById("timing-feedback-card").style.display="block";renderTiming();
}

function timingReset(){buildTiming(timing.p);}
