/* ============================================================
   DATA  —  edit these two lists to add chapters / problems
   ============================================================ */
const CHAPTERS = [
  { number:1, title:"Digital Circuits", description:"Warm up: single-term and two-term simplifications." },
  { number:2, title:"Combination Logic", description:"Group 1s into the largest legal blocks to minimise F.", hidden:true },
  { number:3, title:"Boolean Algebra", description:"Adders, MUX, decoders.", locked:true },
  { number:4, title:"Combinational Blocks", description:"Use don't-cares to grow groups and simplify further." },
  { number:5, title:"Number Systems", description:"Use don't-cares to grow groups and simplify further.", hidden:true },
  { number:6, title:"Sequential Logic", description:"Use don't-cares to grow groups and simplify further." },
  { number:7, title:"Finite State Machines", description:"Use don't-cares to grow groups and simplify further." },
  { number:8, title:"Sequential Blocks", description:"Use don't-cares to grow groups and simplify further." },
  { number:9, title:"Instruction Set Architecture", description:"Use don't-cares to grow groups and simplify further." },
  { number:10, title:"Single Cycle Processor", description:"Use don't-cares to grow groups and simplify further." },
  { number:11, title:"Multi Cycle Processor", description:"Use don't-cares to grow groups and simplify further." },
  { number:12, title:"Pipelined Processor", description:"Use don't-cares to grow groups and simplify further." },
  { number:13, title:"Caches", description:"Use don't-cares to grow groups and simplify further." },
  { number:14, title:"Proc + Caches", description:"Use don't-cares to grow groups and simplify further." },
];

const PROBLEMS = [
  { id:"p1-1", chapter:1, type:"cmos", title:"Three way NAND", diff:"easy",
    prompt:"Complete the pull-up network.",
    inputs:["Va","Vb","Vc"],
    given:{ side:"pulldown", structure:"series",
      transistors:[ {name:"N0",kind:"nmos",gate:"Va"}, {name:"N1",kind:"nmos",gate:"Vb"}, {name:"N2",kind:"nmos",gate:"Vc"} ] },
    build:"pullup", cols:3, rows:3 },

  { id:"p1-1b", chapter:1, type:"cmos", title:"Branching out", diff:"med",
    prompt:"Complete the pull-up network.",
    inputs:["Va","Vb","Vc"],
    given:{ side:"pulldown", structure:"parallelBranches",
      branches:[
        [ {name:"N0",kind:"nmos",gate:"Va"}, {name:"N1",kind:"nmos",gate:"Vb"} ],
        [ {name:"N2",kind:"nmos",gate:"Vc"} ]
      ],
      transistors:[
        {name:"N0",kind:"nmos",gate:"Va"},
        {name:"N1",kind:"nmos",gate:"Vb"},
        {name:"N2",kind:"nmos",gate:"Vc"}
      ] },
    build:"pullup", cols:3, rows:2 },

  { id:"p1-1c", chapter:1, type:"cmos", title:"Pulling it down", diff:"hard",
    prompt:"Complete the pull-down network.",
    inputs:["Va","Vb","Vc","Vd"],
    given:{ side:"pullup", structure:"parallelBranches",
      branches:[
        [ {name:"P0",kind:"pmos",gate:"Va"}, {name:"P1",kind:"pmos",gate:"Vb"} ],
        [ {name:"P2",kind:"pmos",gate:"Vc"}, {name:"P3",kind:"pmos",gate:"Vd"} ]
      ],
      transistors:[
        {name:"P0",kind:"pmos",gate:"Va"},
        {name:"P1",kind:"pmos",gate:"Vb"},
        {name:"P2",kind:"pmos",gate:"Vc"},
        {name:"P3",kind:"pmos",gate:"Vd"}
      ] },
    build:"pulldown" },

  { id:"p1-2", chapter:1, type:"switch", title:"AND it begins", diff:"med",
    prompt:"Analyze the circuit for each input combination.",
    inputs:["Va","Vb"],
    nodes:["VDD","GND","Va","Vb","Vx","Vy","nmid"],
    transistors:[
      {name:"P0",kind:"pmos",gate:"Va",a:"VDD",b:"Vx"},
      {name:"P1",kind:"pmos",gate:"Vb",a:"VDD",b:"Vx"},
      {name:"N0",kind:"nmos",gate:"Va",a:"Vx",b:"nmid"},
      {name:"N1",kind:"nmos",gate:"Vb",a:"nmid",b:"GND"},
      {name:"P2",kind:"pmos",gate:"Vx",a:"VDD",b:"Vy"},
      {name:"N2",kind:"nmos",gate:"Vx",a:"Vy",b:"GND"} ],
    columns:[
      {key:"Va",type:"input"},{key:"Vb",type:"input"},
      {key:"P0",type:"trans"},{key:"P1",type:"trans"},{key:"N0",type:"trans"},{key:"N1",type:"trans"},
      {key:"Vx",type:"node"},
      {key:"P2",type:"trans"},{key:"N2",type:"trans"},
      {key:"Vy",type:"node"} ],
    layout:{ w:560, h:352, vddY:28, vddX:[70,500],
      grounds:[{x:170,y:312},{x:440,y:312}],
      wires:[
        {n:"VDD",p:[[130,58],[130,28]]}, {n:"VDD",p:[[210,58],[210,28]]}, {n:"VDD",p:[[440,58],[440,28]]},
        {n:"Vx",p:[[130,102],[130,134]]}, {n:"Vx",p:[[210,102],[210,134]]}, {n:"Vx",p:[[130,134],[210,134]]},
        {n:"Vx",p:[[170,134],[170,173]]}, {n:"nmid",p:[[170,217],[170,240]]}, {n:"GND",p:[[170,284],[170,312]]},
        {n:"Vx",p:[[210,134],[350,134]]}, {n:"Vx",p:[[350,80],[350,200]]}, {n:"Vx",p:[[350,80],[410,80]]}, {n:"Vx",p:[[350,200],[410,200]]},
        {n:"Vy",p:[[440,102],[440,134]]}, {n:"Vy",p:[[440,178],[440,134]]}, {n:"GND",p:[[440,222],[440,312]]},
        {n:"Vy",p:[[440,134],[461,134]]} ],
      trans:{ P0:{x:130,y:80}, P1:{x:210,y:80}, N0:{x:170,y:195}, N1:{x:170,y:262}, P2:{x:440,y:80}, N2:{x:440,y:200} },
      nodes:[ {node:"Vx",x:280,y:134}, {node:"Vy",x:490,y:134} ] } },

  { id:"p1-3", chapter:1, type:"switch", title:"Two-stage trouble", diff:"hard",
    prompt:"Analyze the circuit for each input combination.",
    inputs:["Va","Vb"],
    nodes:["VDD","GND","Va","Vb","Vx","Vy","nmid"],
    transistors:[
      {name:"P0",kind:"pmos",gate:"Va",a:"VDD",b:"Vx"},
      {name:"N0",kind:"nmos",gate:"Va",a:"Vx",b:"GND"},
      {name:"P2",kind:"pmos",gate:"Vb",a:"VDD",b:"nmid"},
      {name:"P1",kind:"pmos",gate:"Vx",a:"nmid",b:"Vy"},
      {name:"N1",kind:"nmos",gate:"Vx",a:"Vy",b:"GND"},
      {name:"N2",kind:"nmos",gate:"Vb",a:"Vy",b:"GND"} ],
    columns:[
      {key:"Va",type:"input"},{key:"Vb",type:"input"},
      {key:"P0",type:"trans"},{key:"N0",type:"trans"},
      {key:"Vx",type:"node"},
      {key:"P2",type:"trans"},{key:"P1",type:"trans"},
      {key:"N1",type:"trans"},{key:"N2",type:"trans"},
      {key:"Vy",type:"node"} ],
    layout:{ w:600, h:360, vddY:28, vddX:[55,545],
      grounds:[{x:135,y:314},{x:390,y:314},{x:500,y:314}],
      wires:[
        {n:"VDD",p:[[135,58],[135,28]]},
        {n:"Vx",p:[[135,102],[135,160]]},
        {n:"GND",p:[[135,204],[135,314]]},

        {n:"VDD",p:[[445,58],[445,28]]},
        {n:"nmid",p:[[445,102],[445,128]]},
        {n:"Vy",p:[[445,172],[445,205]]},

        {n:"Vy",p:[[390,205],[500,205]]},
        {n:"GND",p:[[390,249],[390,314]]},
        {n:"GND",p:[[500,249],[500,314]]},

        {n:"Vx",p:[[135,160],[300,160]]},
        {n:"Vx",p:[[300,160],[300,150],[415,150]]},
        {n:"Vx",p:[[300,160],[300,227],[360,227]]},

        {n:"Vy",p:[[445,205],[555,205]]} ],
      trans:{
        P0:{x:135,y:80},
        N0:{x:135,y:182},
        P2:{x:445,y:80},
        P1:{x:445,y:150},
        N1:{x:390,y:227},
        N2:{x:500,y:227}
      },
      nodes:[
        {node:"Vx",x:235,y:160},
        {node:"Vy",x:560,y:205}
      ] } },

  { id:"p2-1", chapter:2, type:"kmap", title:"A single prime implicant", diff:"easy",
    variables:["A","B","C","D"], minterms:[0,1,2,3,8,9,10,11], dontcares:[] },
  { id:"p2-2", chapter:2, type:"kmap", title:"Two clean groups", diff:"easy",
    variables:["A","B","C","D"], minterms:[0,2,5,7,8,10,13,15], dontcares:[] },

  { id:"p3-1", chapter:3, type:"kmap", title:"Cover every 1", diff:"easy",
    variables:["A","B","C","D"], minterms:[0,1,4,5,12,13], dontcares:[] },
  { id:"p3-2", chapter:3, type:"kmap", title:"Watch the wrap-around", diff:"med",
    variables:["A","B","C","D"], minterms:[0,2,8,10,5,13], dontcares:[] },
  { id:"p3-3", chapter:3, type:"kmap", title:"Overlap pays off", diff:"hard",
    variables:["A","B","C","D"], minterms:[0,1,2,5,8,9,10], dontcares:[3,7] },

  { id:"p5-1", chapter:5, type:"kmap", title:"Let don't-cares grow the group", diff:"med",
    variables:["A","B","C","D"], minterms:[1,3,7,9], dontcares:[5,11,15] },
  { id:"p5-2", chapter:5, type:"kmap", title:"Minimise with three don't-cares", diff:"hard",
    variables:["A","B","C","D"], minterms:[0,4,5,7,8,12], dontcares:[2,10,13] },
];
