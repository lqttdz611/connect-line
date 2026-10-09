// Tạo màn chơi: mỗi màn luôn có lời giải, độ khó tăng theo số màn.

/* ---------- seeded random ---------- */
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

/* ---------- difficulty curve ---------- */
function config(L){
  const sizes=[[3,3],[3,4],[4,4],[4,5],[5,5],[5,6],[6,6],[6,7],[7,7],[7,8]];
  const bands=[3,5,7,8,10,10,12,13,15,17];    // levels per board size, sums to 100
  let step=0,start=1;
  while(step<bands.length-1&&L>=start+bands[step]){start+=bands[step];step++}
  const [cols,rows]=sizes[step];
  const within=Math.min(1,(L-start)/Math.max(1,bands[step]-1));  // 0..1 inside a size band
  const n=cols*rows;
  const maxBlocks=Math.max(1,Math.round(n*0.16));
  const blocks=Math.round(within*maxBlocks*0.9+(step>0?1:0)+(L>2?1:0));
  return {cols,rows,blocks:Math.min(blocks,maxBlocks)};
}

/* ---------- level generation: blocks first, then find a one-line path ---------- */
function generate(L){
  const {cols,rows,blocks}=config(L);
  const rand=rng(L*7919+13);
  const n=cols*rows;
  const nb=i=>{const x=i%cols,y=(i/cols)|0,a=[];if(x>0)a.push(i-1);if(x<cols-1)a.push(i+1);if(y>0)a.push(i-cols);if(y<rows-1)a.push(i+cols);return a};
  const NB=[...Array(n)].map((_,i)=>nb(i));
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(rand()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}return a};

  for(let attempt=0;attempt<400;attempt++){
    const k=Math.max(0,blocks-Math.floor(attempt/80));
    const blocked=new Array(n).fill(false);
    const order=shuffle([...Array(n).keys()]);
    let placed=0;
    for(const i of order){ if(placed>=k)break;
      if(NB[i].some(j=>blocked[j])&&rand()<.8)continue;   // keep X cells spread out
      blocked[i]=true;placed++; }
    // checkerboard parity: a path alternates colours, so counts may differ by at most 1
    let w=0,b=0,free=0;
    for(let i=0;i<n;i++)if(!blocked[i]){free++;((i%cols)+((i/cols)|0))%2?b++:w++}
    if(Math.abs(w-b)>1)continue;
    const path=findPath(n,NB,blocked,free,rand,shuffle);
    if(path)return {cols,rows,blocked,solution:path,free};
  }
  // fallback: snake with no blocks (always solvable)
  const sol=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)sol.push(y*cols+(y%2?cols-1-x:x));
  return {cols,rows,blocked:new Array(n).fill(false),solution:sol,free:n};
}

function findPath(n,NB,blocked,free,rand,shuffle){
  const starts=shuffle([...Array(n).keys()].filter(i=>!blocked[i]));
  for(const s of starts.slice(0,8)){
    const vis=blocked.slice();const path=[s];vis[s]=true;let budget=60000;
    const deg=i=>NB[i].reduce((c,j)=>c+(vis[j]?0:1),0);
    const ok=head=>{ // prune: no unreachable cell, at most one dead end besides the head's neighbours
      let dead=0;
      for(let i=0;i<n;i++){ if(vis[i])continue;
        const d=deg(i), touch=NB[i].includes(head);
        if(d===0&&!touch)return false;
        if(d===1&&!touch&&++dead>1)return false; }
      return true;};
    const dfs=head=>{
      if(path.length===free)return true;
      if(--budget<0)return false;
      const cand=shuffle(NB[head].filter(j=>!vis[j])).sort((a,b)=>deg(a)-deg(b));
      for(const j of cand){
        vis[j]=true;path.push(j);
        if(ok(j)&&dfs(j))return true;
        vis[j]=false;path.pop();
        if(budget<0)return false;
      }
      return false;};
    if(dfs(s))return path;
  }
  return null;
}
