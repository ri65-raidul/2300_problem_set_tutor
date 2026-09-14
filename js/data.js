const CHAPTERS = [
  { number:1, title:"Digital Circuits", description:"Warm up: single-term and two-term simplifications." },
  { number:2, title:"Combinational Logic", description:"Practice gate-level networks and truth tables." },
  { number:3, title:"Boolean Algebra", description:"Adders, MUX, decoders.", hidden:true },
  { number:4, title:"Combinational Blocks", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:5, title:"Number Systems", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:6, title:"Sequential Logic", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:7, title:"Finite State Machines", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:8, title:"Sequential Blocks", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:9, title:"Instruction Set Architecture", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:10, title:"Single Cycle Processor", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:11, title:"Multi Cycle Processor", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:12, title:"Pipelined Processor", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:13, title:"Caches", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:14, title:"Proc + Caches", description:"Use don't-cares to grow groups and simplify further.", hidden:true }
];

const PROBLEMS = [
  { id:"p1-1", chapter:1, type:"cmos", title:"Three way NAND", diff:"easy",
    prompt:"Complete the pull-up network.", inputs:["Va","Vb","Vc"],
    given:{ side:"pulldown", structure:"series", transistors:[
      {name:"N0",kind:"nmos",gate:"Va"}, {name:"N1",kind:"nmos",gate:"Vb"}, {name:"N2",kind:"nmos",gate:"Vc"}
    ]}, build:"pullup", cols:3, rows:3 },

  { id:"p1-1b", chapter:1, type:"cmos", title:"Branching out", diff:"med",
    prompt:"Complete the pull-up network.", inputs:["Va","Vb","Vc"],
    given:{ side:"pulldown", structure:"parallelBranches", branches:[
      [{name:"N0",kind:"nmos",gate:"Va"},{name:"N1",kind:"nmos",gate:"Vb"}],
      [{name:"N2",kind:"nmos",gate:"Vc"}]
    ], transistors:[
      {name:"N0",kind:"nmos",gate:"Va"},{name:"N1",kind:"nmos",gate:"Vb"},{name:"N2",kind:"nmos",gate:"Vc"}
    ]}, build:"pullup", cols:3, rows:2 },

  { id:"p1-1c", chapter:1, type:"cmos", title:"Pulling it down", diff:"hard",
    prompt:"Complete the pull-down network.", inputs:["Va","Vb","Vc","Vd"],
    given:{ side:"pullup", structure:"parallelBranches", branches:[
      [{name:"P0",kind:"pmos",gate:"Va"},{name:"P1",kind:"pmos",gate:"Vb"}],
      [{name:"P2",kind:"pmos",gate:"Vc"},{name:"P3",kind:"pmos",gate:"Vd"}]
    ], transistors:[
      {name:"P0",kind:"pmos",gate:"Va"},{name:"P1",kind:"pmos",gate:"Vb"},
      {name:"P2",kind:"pmos",gate:"Vc"},{name:"P3",kind:"pmos",gate:"Vd"}
    ]}, build:"pulldown" },

  { id:"p1-2", chapter:1, type:"switch", title:"AND it begins", diff:"med",
    prompt:"Analyze the circuit for each input combination.", inputs:["Va","Vb"],
    nodes:["VDD","GND","Va","Vb","Vx","Vy","nmid"],
    transistors:[
      {name:"P0",kind:"pmos",gate:"Va",a:"VDD",b:"Vx"},
      {name:"P1",kind:"pmos",gate:"Vb",a:"VDD",b:"Vx"},
      {name:"N0",kind:"nmos",gate:"Va",a:"Vx",b:"nmid"},
      {name:"N1",kind:"nmos",gate:"Vb",a:"nmid",b:"GND"},
      {name:"P2",kind:"pmos",gate:"Vx",a:"VDD",b:"Vy"},
      {name:"N2",kind:"nmos",gate:"Vx",a:"Vy",b:"GND"}
    ],
    columns:[
      {key:"Va",type:"input"},{key:"Vb",type:"input"},
      {key:"P0",type:"trans"},{key:"P1",type:"trans"},{key:"N0",type:"trans"},{key:"N1",type:"trans"},
      {key:"Vx",type:"node"},{key:"P2",type:"trans"},{key:"N2",type:"trans"},{key:"Vy",type:"node"}
    ],
    layout:{ w:560, h:352, vddY:28, vddX:[70,500],
      grounds:[{x:170,y:312},{x:440,y:312}],
      wires:[
        {n:"VDD",p:[[130,58],[130,28]]},{n:"VDD",p:[[210,58],[210,28]]},{n:"VDD",p:[[440,58],[440,28]]},
        {n:"Vx",p:[[130,102],[130,134]]},{n:"Vx",p:[[210,102],[210,134]]},{n:"Vx",p:[[130,134],[210,134]]},
        {n:"Vx",p:[[170,134],[170,173]]},{n:"nmid",p:[[170,217],[170,240]]},{n:"GND",p:[[170,284],[170,312]]},
        {n:"Vx",p:[[210,134],[350,134]]},{n:"Vx",p:[[350,80],[350,200]]},{n:"Vx",p:[[350,80],[410,80]]},
        {n:"Vx",p:[[350,200],[410,200]]},{n:"Vy",p:[[440,102],[440,134]]},{n:"Vy",p:[[440,178],[440,134]]},
        {n:"GND",p:[[440,222],[440,312]]},{n:"Vy",p:[[440,134],[461,134]]}
      ],
      trans:{P0:{x:130,y:80},P1:{x:210,y:80},N0:{x:170,y:195},N1:{x:170,y:262},P2:{x:440,y:80},N2:{x:440,y:200}},
      nodes:[{node:"Vx",x:280,y:134},{node:"Vy",x:490,y:134}]
    }
  },

  { id:"p1-3", chapter:1, type:"switch", title:"Two-stage trouble", diff:"hard",
    prompt:"Analyze the circuit for each input combination.", inputs:["Va","Vb"],
    nodes:["VDD","GND","Va","Vb","Vx","Vy","nmid"],
    transistors:[
      {name:"P0",kind:"pmos",gate:"Va",a:"VDD",b:"Vx"},
      {name:"N0",kind:"nmos",gate:"Va",a:"Vx",b:"GND"},
      {name:"P2",kind:"pmos",gate:"Vb",a:"VDD",b:"nmid"},
      {name:"P1",kind:"pmos",gate:"Vx",a:"nmid",b:"Vy"},
      {name:"N1",kind:"nmos",gate:"Vx",a:"Vy",b:"GND"},
      {name:"N2",kind:"nmos",gate:"Vb",a:"Vy",b:"GND"}
    ],
    columns:[
      {key:"Va",type:"input"},{key:"Vb",type:"input"},{key:"P0",type:"trans"},{key:"N0",type:"trans"},
      {key:"Vx",type:"node"},{key:"P2",type:"trans"},{key:"P1",type:"trans"},
      {key:"N1",type:"trans"},{key:"N2",type:"trans"},{key:"Vy",type:"node"}
    ],
    layout:{ w:600, h:360, vddY:28, vddX:[55,545],
      grounds:[{x:135,y:314},{x:390,y:314},{x:500,y:314}],
      wires:[
        {n:"VDD",p:[[135,58],[135,28]]},{n:"Vx",p:[[135,102],[135,160]]},{n:"GND",p:[[135,204],[135,314]]},
        {n:"VDD",p:[[445,58],[445,28]]},{n:"nmid",p:[[445,102],[445,128]]},{n:"Vy",p:[[445,172],[445,205]]},
        {n:"Vy",p:[[390,205],[500,205]]},{n:"GND",p:[[390,249],[390,314]]},{n:"GND",p:[[500,249],[500,314]]},
        {n:"Vx",p:[[135,160],[300,160]]},{n:"Vx",p:[[300,160],[300,150],[415,150]]},
        {n:"Vx",p:[[300,160],[300,227],[360,227]]},{n:"Vy",p:[[445,205],[555,205]]}
      ],
      trans:{P0:{x:135,y:80},N0:{x:135,y:182},P2:{x:445,y:80},P1:{x:445,y:150},N1:{x:390,y:227},N2:{x:500,y:227}},
      nodes:[{node:"Vx",x:235,y:160},{node:"Vy",x:560,y:205}]
    }
  },

  /* ---- Timing diagram (self-contained inverter -> NOR, 5 staged parts) ---- */
  { id:"p1-4", chapter:1, type:"timing", title:"Timing: inverter \u2192 NOR", diff:"hard",
    prompt:"Work through the five stages: first the logic truth table, then the timing diagram under the zero-, constant-, input-dependent, and transition-dependent delay models." },

  { id:"p2-2", chapter:2, type:"match", title:"Match the gate", diff:"easy",
    prompt:"Each truth table below was produced by one of the four gates above. Match every table to its gate.",
    gates:["AND","OR","XOR","XNOR"] },

  { id:"p2-7", chapter:2, type:"sop", title:"Sum of canonical products", diff:"med",
    prompt:"Go from a truth table to a gate-level network, just doing the wiring: drag each AND gate's inputs to the correct literals so the circuit implements the given truth table as a sum of canonical products.",
    variables:["A","B","C"], minterms:[0,1,6,7] },

  { id:"p2-8", chapter:2, type:"sop", title:"Sum of canonical products II", diff:"med",
    prompt:"A second truth table to go from, just doing the wiring: drag each AND gate's inputs to the correct literals so the circuit implements the given truth table as a sum of canonical products.",
    variables:["A","B","C"], minterms:[1,2,4,7] },

  { id:"p2-5", chapter:2, type:"glnet", title:"Gate-level network timing", diff:"hard",
    prompt:"Work through the fixed gate-level network in three stages: complete its truth table, analyze the timing of every path, then complete its timing diagram.",
    network:{
      inputs:["A","B","C"],
      gates:[
        { out:"W", kind:"AND2", in:["A","B"] },
        { out:"X", kind:"NOT", in:["C"] },
        { out:"Z", kind:"NOR2", in:["W","X"] },
        { out:"Y", kind:"NOT", in:["Z"] }
      ],
      output:"Y",
      delays:{ NOT:{tpd:1,tcd:1}, AND2:{tpd:2,tcd:1}, NOR2:{tpd:3,tcd:1} },
      waveform:{
        A:{ init:1, transitions:[] },
        B:{ init:1, transitions:[{time:4,value:0}] },
        C:{ init:1, transitions:[{time:10,value:0}] }
      },
      duration:20,
      diagramSvg:`
    <svg class="gate-svg" viewBox="0 0 620 260" role="img"
      aria-label="A and B enter an AND2 gate to produce W. C enters a NOT gate to produce X. W and X enter a NOR2 gate to produce Z. Z enters a NOT gate to produce Y."
      xmlns="http://www.w3.org/2000/svg">
      <g class="gate-wire">
        <path d="M20 55 H140"/>
        <path d="M20 105 H140"/>
        <path d="M20 210 H90"/>
        <path d="M210 80 H245 V105 H280"/>
        <path d="M153 210 H245 V175 H280"/>
        <path d="M382 140 H420"/>
        <path d="M483 140 H560"/>
      </g>
      <path class="gate-symbol" d="M140 40 H165 C195 40 210 58 210 80 C210 102 195 120 165 120 H140 Z"/>
      <path class="gate-symbol" d="M90 190 L140 210 L90 230 Z"/>
      <circle class="gate-symbol" cx="147" cy="210" r="6"/>
      <path class="gate-symbol" d="M280 90 C310 90 335 100 352 118 C362 128 368 134 368 140 C368 146 362 152 352 162 C335 180 310 190 280 190 C295 165 295 115 280 90 Z"/>
      <circle class="gate-symbol" cx="376" cy="140" r="6"/>
      <path class="gate-symbol" d="M420 120 L470 140 L420 160 Z"/>
      <circle class="gate-symbol" cx="477" cy="140" r="6"/>
      <g class="gate-label">
        <text x="10" y="59" text-anchor="end">A</text>
        <text x="10" y="109" text-anchor="end">B</text>
        <text x="10" y="214" text-anchor="end">C</text>
        <text x="216" y="72">W</text>
        <text x="156" y="196">X</text>
        <text x="372" y="120">Z</text>
        <text x="566" y="144">Y</text>
      </g>
    </svg>`
    } },

  { id:"p2-6", chapter:2, type:"glnet", title:"Gate-level network timing II", diff:"hard",
    prompt:"A second fixed gate-level network, this time mixing NOT, AND2, and XOR2 gates. Work through the same three stages: truth table, timing analysis, then timing diagram.",
    network:{
      inputs:["A","B","C","D"],
      gates:[
        { out:"W", kind:"NOT", in:["B"] },
        { out:"X", kind:"AND2", in:["A","W"] },
        { out:"Z", kind:"XOR2", in:["C","D"] },
        { out:"Y", kind:"XOR2", in:["X","Z"] }
      ],
      output:"Y",
      delays:{ NOT:{tpd:1,tcd:1}, AND2:{tpd:3,tcd:1}, XOR2:{tpd:7,tcd:4} },
      waveform:{
        A:{ init:1, transitions:[] },
        B:{ init:1, transitions:[{time:4,value:0}] },
        C:{ init:1, transitions:[{time:16,value:0}] },
        D:{ init:1, transitions:[{time:32,value:0}] }
      },
      duration:48,
      diagramSvg:`
    <svg class="gate-svg" viewBox="0 0 620 285" role="img"
      aria-label="B enters a NOT gate to produce W. A and W enter an AND2 gate to produce X. C and D enter an XOR2 gate to produce Z. X and Z enter a second XOR2 gate to produce Y."
      xmlns="http://www.w3.org/2000/svg">
      <g class="gate-wire">
        <path d="M20 35 H70"/>
        <path d="M123 35 H132 V55 H140"/>
        <path d="M20 105 H140"/>
        <path d="M210 80 H340 V170 H400"/>
        <path d="M20 175 H210 V195 H240"/>
        <path d="M20 225 H210 V235 H240"/>
        <path d="M328 215 H360 V230 H400"/>
        <path d="M488 200 H560"/>
      </g>
      <path class="gate-symbol" d="M70 20 L110 35 L70 50 Z"/>
      <circle class="gate-symbol" cx="117" cy="35" r="6"/>
      <path class="gate-symbol" d="M140 40 H165 C195 40 210 58 210 80 C210 102 195 120 165 120 H140 Z"/>
      <path class="gate-wire" d="M226 165 C241 190 241 240 226 265"/>
      <path class="gate-symbol" d="M240 165 C270 165 295 175 312 193 C322 203 328 209 328 215 C328 221 322 227 312 237 C295 255 270 265 240 265 C255 240 255 190 240 165 Z"/>
      <path class="gate-wire" d="M386 150 C401 175 401 225 386 250"/>
      <path class="gate-symbol" d="M400 150 C430 150 455 160 472 178 C482 188 488 194 488 200 C488 206 482 212 472 222 C455 240 430 250 400 250 C415 225 415 175 400 150 Z"/>
      <g class="gate-label">
        <text x="10" y="39" text-anchor="end">B</text>
        <text x="10" y="109" text-anchor="end">A</text>
        <text x="10" y="179" text-anchor="end">C</text>
        <text x="10" y="229" text-anchor="end">D</text>
        <text x="128" y="26">W</text>
        <text x="216" y="72">X</text>
        <text x="332" y="201">Z</text>
        <text x="566" y="204">Y</text>
      </g>
    </svg>`
    } },

  { id:"p2-3", chapter:2, type:"norbuild", title:"Universal primitive gate set: NOR", diff:"hard",
    prompt:"NOR2 alone can build every other basic gate. Drag NOR2 gates onto the canvas and wire them so your circuit matches each target gate's truth table.",
    primitive:"NOR", stages:["NOT","AND"] },

  { id:"p2-4", chapter:2, type:"norbuild", title:"Universal primitive gate set: NAND", diff:"hard",
    prompt:"NAND2 alone can build every other basic gate. Drag NAND2 gates onto the canvas and wire them so your circuit matches each target gate's truth table.",
    primitive:"NAND", stages:["OR","AND"] },

  { id:"p3-1", chapter:3, type:"kmap", title:"Cover every 1", diff:"easy",
    variables:["A","B","C","D"], minterms:[0,1,4,5,12,13], dontcares:[] },
  { id:"p3-2", chapter:3, type:"kmap", title:"Watch the wrap-around", diff:"med",
    variables:["A","B","C","D"], minterms:[0,2,8,10,5,13], dontcares:[] },
  { id:"p3-3", chapter:3, type:"kmap", title:"Overlap pays off", diff:"hard",
    variables:["A","B","C","D"], minterms:[0,1,2,5,8,9,10], dontcares:[3,7] },
  { id:"p5-1", chapter:5, type:"kmap", title:"Let don't-cares grow the group", diff:"med",
    variables:["A","B","C","D"], minterms:[1,3,7,9], dontcares:[5,11,15] },
  { id:"p5-2", chapter:5, type:"kmap", title:"Minimise with three don't-cares", diff:"hard",
    variables:["A","B","C","D"], minterms:[0,4,5,7,8,12], dontcares:[2,10,13] }
];
