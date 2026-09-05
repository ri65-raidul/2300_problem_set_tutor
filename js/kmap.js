/* ============================================================
   ENGINE  —  K-map maths (Claude-maintained; no need to edit)
   ============================================================ */
const VARS = ["A","B","C","D"];       // bit3=A(MSB) ... bit0=D(LSB)
const GRAY = [0,1,3,2];               // grid position -> 2-bit value (00,01,11,10)
const PRIME = "\u2032";               // ' complement mark
const PALETTE = ["var(--g0)","var(--g1)","var(--g2)","var(--g3)","var(--g4)","var(--g5)"];

function popcount(x){ let c=0; while(x){ c+=x&1; x>>=1; } return c; }
function cellMinterm(row,col){ return GRAY[row]*4 + GRAY[col]; }
function gray2bin(v){ return ((v>>1)&1).toString() + (v&1).toString(); }

function groupMaskVal(cells){
  let andAll=15, orAll=0;
  for(const m of cells){ andAll&=m; orAll|=m; }
  const fixed = andAll | ((~orAll)&15);   // bit fixed if all-1 or all-0 across the group
  return { mask:fixed, val:andAll & fixed };
}
function isValidGroup(cells){
  const s=[...new Set(cells)]; const n=s.length;
  if(n===0) return false;
  if((n & (n-1))!==0) return false;                 // size must be a power of two
  const { mask } = groupMaskVal(s);
  const free = 4 - popcount(mask);
  return n === (1<<free);                            // cells form a full sub-cube
}
function termString(cells){
  const { mask,val } = groupMaskVal(cells);
  if(mask===0) return "1";
  let s="";
  for(let b=3;b>=0;b--){ const bit=1<<b; if(mask&bit){ const v=VARS[3-b]; s += (val&bit)? v : v+PRIME; } }
  return s || "1";
}
function canExpand(cells, coverable){
  if(cells.length===0 || !isValidGroup(cells)) return false;
  const { mask } = groupMaskVal(cells);
  for(let b=0;b<4;b++){ const bit=1<<b;
    if(mask&bit){                                    // try freeing a fixed variable
      let ok=true;
      for(const m of cells){ if(!coverable.has(m^bit)){ ok=false; break; } }
      if(ok) return true;                            // a larger legal group exists
    }
  }
  return false;
}
/* Quine–McCluskey: all prime implicants over the coverable cells (1s + don't-cares) */
function primeImplicants(coverable){
  let cur = coverable.map(m=>({mask:15,val:m}));
  const primes=[];
  while(cur.length){
    const used = new Array(cur.length).fill(false);
    const seen = new Set(); const next=[];
    for(let i=0;i<cur.length;i++){
      for(let j=i+1;j<cur.length;j++){
        if(cur[i].mask!==cur[j].mask) continue;
        const diff=(cur[i].val ^ cur[j].val) & cur[i].mask;
        if(diff && (diff&(diff-1))===0){
          used[i]=used[j]=true;
          const mask=cur[i].mask & ~diff, val=cur[i].val & ~diff;
          const key=mask+":"+val;
          if(!seen.has(key)){ seen.add(key); next.push({mask,val}); }
        }
      }
    }
    for(let i=0;i<cur.length;i++) if(!used[i]) primes.push(cur[i]);
    cur=next;
  }
  return primes;
}
/* smallest number of prime implicants needed to cover all the 1s */
function optimalGroupCount(problem){
  if(problem._opt!=null) return problem._opt;
  const mins=problem.minterms.slice();
  if(mins.length===0){ problem._opt=0; return 0; }
  const coverable=[...new Set([...problem.minterms, ...(problem.dontcares||[])])];
  const primes=primeImplicants(coverable);
  const cov=primes.map(pi=> new Set(mins.filter(m=> (m&pi.mask)===pi.val )));
  let best=Infinity;
  (function rec(rem,count){
    if(count>=best) return;
    if(rem.size===0){ best=count; return; }
    const m=rem.values().next().value;
    for(let i=0;i<primes.length;i++){
      if(cov[i].has(m)){
        const nr=new Set([...rem].filter(x=>!cov[i].has(x)));
        rec(nr,count+1);
      }
    }
  })(new Set(mins),0);
  problem._opt=best;
  return best;
}

/* ============================================================
   FEEDBACK RULES  —  each returns messages; edit wording freely
   ============================================================ */
function evaluate(problem, groups){
  const mins=new Set(problem.minterms);
  const coverable=new Set([...problem.minterms, ...(problem.dontcares||[])]);
  const msgs=[];
  const cellsOf = g => [...g.cells];

  if(groups.length===0){
    return [{s:"info", t:"Nothing grouped yet. Select cells and press Add group — every 1 must end up inside a valid group."}];
  }

  // structural, per group
  groups.forEach((g,i)=>{
    const cells=cellsOf(g), n=cells.length;
    if((n & (n-1))!==0){
      msgs.push({s:"error", t:`Group ${i+1} has ${n} cells. A group must be a power of two — 1, 2, 4, 8 or 16.`});
    } else if(!isValidGroup(cells)){
      msgs.push({s:"error", t:`Group ${i+1} isn't a valid rectangle. The cells must line up in a block — and remember the map wraps around its edges.`});
    }
    const zeros=cells.filter(m=>!coverable.has(m));
    if(zeros.length){
      msgs.push({s:"error", t:`Group ${i+1} covers a 0. Groups may only contain 1s and don't-cares.`});
    }
  });

  const structurallyOK = groups.every(g=>{ const c=cellsOf(g); return isValidGroup(c) && c.every(m=>coverable.has(m)); });

  // coverage
  const covered=new Set(); groups.forEach(g=>g.cells.forEach(m=>covered.add(m)));
  const uncovered=[...mins].filter(m=>!covered.has(m));
  if(uncovered.length){
    msgs.push({s:"warn", t:`${uncovered.length} of the 1s ${uncovered.length===1?"is":"are"} still uncovered. Every 1 must sit inside at least one group.`});
  }

  // optimisation nudges (only meaningful once groups are legal)
  if(structurallyOK){
    groups.forEach((g,i)=>{
      const gOnes=cellsOf(g).filter(m=>mins.has(m));
      const otherOnes=new Set();
      groups.forEach((h,j)=>{ if(j!==i) h.cells.forEach(m=>{ if(mins.has(m)) otherOnes.add(m); }); });
      if(gOnes.length===0){
        msgs.push({s:"warn", t:`Group ${i+1} covers only don't-cares and no required 1 — it isn't doing any work. Remove it.`});
      } else if(gOnes.every(m=>otherOnes.has(m))){
        msgs.push({s:"warn", t:`Group ${i+1} is redundant — every 1 in it is already covered by another group. You can remove it.`});
      }
    });
    groups.forEach((g,i)=>{
      if(canExpand(cellsOf(g), coverable)){
        msgs.push({s:"warn", t:`Group ${i+1} can be made bigger. Extending it (overlapping a neighbour is fine) gives a simpler term.`});
      }
    });
  }

  // verdict
  const correct = uncovered.length===0
    && groups.every(g=> cellsOf(g).every(m=>coverable.has(m)) && isValidGroup(cellsOf(g)));
  if(correct){
    const opt=optimalGroupCount(problem);
    const clean = !msgs.some(m=>m.s==="warn");
    if(clean && groups.length===opt){
      return [{s:"success", t:`Correct and fully simplified — ${opt} group${opt===1?"":"s"}.  F = ${expression(groups)}`}];
    }
    if(groups.length>opt){
      msgs.push({s:"info", t:`All 1s are covered legally, but it isn't minimal. The simplest cover uses ${opt} group${opt===1?"":"s"} — grow your groups or drop any that aren't needed.`});
    } else {
      const nudges=msgs.filter(m=>m.s==="warn").length;
      msgs.push({s:"info", t:`Every 1 is covered with the right number of groups (${opt}). Apply the note${nudges>1?"s":""} above and you'll have the simplest form.`});
    }
  }
  return msgs;
}
function expression(groups){
  const terms=[];
  for(const g of groups){ const c=[...g.cells]; if(isValidGroup(c)){ const t=termString(c); if(!terms.includes(t)) terms.push(t); } }
  return terms.length? terms.join(" + ") : "—";
}
