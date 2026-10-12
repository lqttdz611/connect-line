// Sinh trước 100 màn của chế độ Khó.
//   shared/hardLevels.js               cách xếp màn (frontend và backend cùng dùng)
//   backend/data/hardSolutions.json    lời giải, chỉ server giữ (trả về khi người chơi bỏ cuộc)
// Chạy từ thư mục gốc: node shared/gen-hard-levels.mjs [giây cho mỗi màn, mặc định 15]
//
// Mỗi màn: thử rất nhiều cách xếp ô chặn trong thời gian cho phép, giữ cách có
//  - không ô trống nào chỉ có một lối ra (ô như vậy lộ ngay điểm đầu/cuối),
//  - ít đường giải nhất khi người chơi tự chọn điểm bắt đầu.
// Màn được sinh sẵn vì việc đếm đường giải quá chậm để làm trên trình duyệt.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

// [cols, rows, số ô chặn, số màn]
const PLAN = [
  [7, 6, 8, 15],
  [7, 7, 10, 20],
  [8, 7, 12, 20],
  [8, 8, 14, 20],
  [9, 8, 16, 15],
  [9, 9, 18, 10],
];

function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// Đếm đường giải (mỗi đường tính một lần), dừng khi đạt cap hoặc hết ngân sách.
function countPaths(n,NB,blocked,cap,budget){
  const free=blocked.filter(b=>!b).length;let c=0,nodes=0,sol=null;
  for(let s=0;s<n;s++){ if(blocked[s])continue;
    const vis=blocked.slice();vis[s]=true;const path=[s];
    const ok=h=>{let dead=0;for(let i=0;i<n;i++){ if(vis[i])continue;
        let d=0;for(const j of NB[i])if(!vis[j]||j===h)d++;
        if(d===0||(d===1&&++dead>1))return false;}return true};
    const dfs=(h,len)=>{ if(c>=cap*2||++nodes>budget)return;
      if(len===free){c++;if(!sol)sol=path.slice();return}
      for(const j of NB[h]){ if(vis[j])continue;
        vis[j]=true;path.push(j);if(ok(j))dfs(j,len+1);path.pop();vis[j]=false;}};
    dfs(s,1);
    if(c>=cap*2||nodes>budget)return null;
  }
  return c?{paths:c/2,sol}:null;
}

function makeLevel(cols,rows,k,seed,ms){
  const n=cols*rows,rand=rng(seed);
  const NB=[...Array(n)].map((_,i)=>{const x=i%cols,y=(i/cols)|0,a=[];if(x>0)a.push(i-1);if(x<cols-1)a.push(i+1);if(y>0)a.push(i-cols);if(y<rows-1)a.push(i+cols);return a});
  const colour=i=>((i%cols)+((i/cols)|0))%2;
  let W=0;for(let i=0;i<n;i++)if(!colour(i))W++;
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=(rand()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}return a};
  const t0=Date.now();let best=null;
  while(Date.now()-t0<ms||!best){
    // chia ô chặn theo màu bàn cờ để hai màu ô trống chênh nhau tối đa 1
    const d=W-(n-W),diff=(k-d)%2===0?d:d+(rand()<.5?-1:1);
    const quota=[(k+diff)/2,k-(k+diff)/2];
    const blocked=new Array(n).fill(false);let placed=0;
    for(const i of shuffle([...Array(n).keys()])){ if(placed>=k)break;
      if(NB[i].some(j=>blocked[j])&&rand()<.8)continue; // ô chặn nằm rải rác
      if(!quota[colour(i)])continue;
      quota[colour(i)]--;blocked[i]=true;placed++; }
    if(placed<k)continue;
    if(blocked.some((b,i)=>!b&&NB[i].filter(j=>!blocked[j]).length<2))continue; // không ngõ cụt
    const r=countPaths(n,NB,blocked,best?best.paths:50,400000);
    if(r&&(!best||r.paths<best.paths))best={...r,blocked};
  }
  return {c:cols,r:rows,p:best.paths,b:best.blocked.flatMap((b,i)=>b?[i]:[]),s:best.sol};
}

if(isMainThread){
  const secs=Number(process.argv[2]||15);
  const jobs=[];let L=1;
  for(const [c,r,k,count] of PLAN)for(let i=0;i<count;i++,L++)jobs.push({L,c,r,k});
  const out=new Array(jobs.length);let next=0,done=0;
  const workers=Math.max(1,Math.min(availableParallelism(),jobs.length));
  await new Promise(resolve=>{
    for(let w=0;w<workers;w++){
      const worker=new Worker(new URL(import.meta.url),{workerData:{secs}});
      const feed=()=>{ if(next<jobs.length)worker.postMessage(jobs[next++]);else worker.terminate(); };
      worker.on('message',({L,level})=>{
        out[L-1]=level;done++;
        console.log(`Màn ${L}: ${level.c}×${level.r}, ${level.b.length} ô chặn, ${level.p} đường giải (${done}/${jobs.length})`);
        if(done===jobs.length)resolve();
        feed(); });
      feed();
    }
  });
  const body=out.map(({c,r,p,b})=>JSON.stringify({c,r,p,b})).join(',\n');
  writeFileSync(new URL('./hardLevels.js',import.meta.url),
    `// File sinh tự động bởi shared/gen-hard-levels.mjs — đừng sửa tay.\n`+
    `// c×r = cỡ bảng, b = ô chặn, p = số đường giải. Lời giải nằm ở backend/data/hardSolutions.json.\n`+
    `export default [\n${body}\n];\n`);
  writeFileSync(new URL('../backend/data/hardSolutions.json',import.meta.url),JSON.stringify(out.map(l=>l.s))+'\n');
  console.log('Đã ghi shared/hardLevels.js và backend/data/hardSolutions.json');
}else{
  parentPort.on('message',({L,c,r,k})=>{
    parentPort.postMessage({L,level:makeLevel(c,r,k,L*7919+4093,workerData.secs*1000)});
  });
}
