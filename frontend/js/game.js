// Bảng chơi, thao tác vẽ, đồng hồ, thắng/bỏ cuộc.

const MAX_LEVEL=100, GAP=58, R=13;
const $=id=>document.getElementById(id);
const svg=$('grid'), NS='http://www.w3.org/2000/svg';

/* ---------- state ---------- */
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
let unlocked=store.get('olg-unlocked',1), level=store.get('olg-level',1), best=store.get('olg-best',{});
let lv, path=[], done=false, showing=false, t0=0, elapsed=0, tick=null, dragging=false;

function startLevel(L){
  level=Math.max(1,Math.min(L,unlocked,MAX_LEVEL)); store.set('olg-level',level); cloud.queueSave();
  lv=generate(level); path=[]; done=false; showing=false;
  stopTimer(); elapsed=0; t0=0; $('timer').textContent='0:00';
  $('overlay').hidden=true;
  svg.setAttribute('viewBox',`0 0 ${lv.cols*GAP} ${lv.rows*GAP}`);
  svg.style.maxWidth=(lv.cols*GAP*1.15)+'px';
  render();
}
const pos=i=>[(i%lv.cols)*GAP+GAP/2,((i/lv.cols)|0)*GAP+GAP/2];
const adj=(a,b)=>{const ax=a%lv.cols,ay=(a/lv.cols)|0,bx=b%lv.cols,by=(b/lv.cols)|0;return Math.abs(ax-bx)+Math.abs(ay-by)===1};
const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
function startTimer(){if(tick)return;t0=Date.now();tick=setInterval(()=>{elapsed=Math.floor((Date.now()-t0)/1000);$('timer').textContent=fmt(elapsed)},250)}
function stopTimer(){clearInterval(tick);tick=null}

function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);parent&&parent.appendChild(e);return e}

function render(){
  svg.innerHTML='';
  svg.classList.toggle('win',done&&!showing);
  svg.classList.toggle('sol',showing);
  const head=path[path.length-1];
  const inPath=new Set(path);
  const nexts=new Set(!done&&path.length?[...Array(lv.cols*lv.rows).keys()].filter(i=>!lv.blocked[i]&&!inPath.has(i)&&adj(i,head)):[]);
  for(let i=0;i<lv.cols*lv.rows;i++){
    const [x,y]=pos(i);
    if(lv.blocked[i]){const g=el('g',{class:'blk'},svg);el('rect',{x:x-19,y:y-19,width:38,height:38,rx:8},g);el('path',{d:`M${x-8} ${y-8}L${x+8} ${y+8}M${x+8} ${y-8}L${x-8} ${y+8}`},g);continue}
    if(!inPath.has(i))el('circle',{class:'dot'+(nexts.has(i)?' next':''),cx:x,cy:y,r:R-1},svg);
  }
  for(let k=1;k<path.length;k++){const [x1,y1]=pos(path[k-1]),[x2,y2]=pos(path[k]);el('line',{class:'seg',x1,y1,x2,y2},svg)}
  path.forEach((i,k)=>{
    const [x,y]=pos(i);const last=k===path.length-1;
    const g=el('g',{class:'node'+(last?' head':'')},svg);
    if(last&&!done)el('circle',{class:'halo',cx:x,cy:y,r:R+8},g);
    el('circle',{cx:x,cy:y,r:R},g);
    const t=el('text',{x,y},g);t.textContent=k+1;
  });
  $('score').textContent=`${path.length}/${lv.free}`;
  $('lvlLabel').textContent=`Màn ${level}/${MAX_LEVEL}`;
  $('prev').disabled=level<=1; $('next').disabled=level>=unlocked;
  $('hint').textContent=showing?'Đây là một lời giải':done?'Tuyệt vời!':path.length?(nexts.size?'Chạm điểm phát sáng để tiếp tục vẽ':'Hết đường! Chạm lại điểm cũ để quay lui'):'Chạm vào một điểm bất kỳ để bắt đầu vẽ';
}

function cellAt(evt){
  const pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;
  const p=pt.matrixTransform(svg.getScreenCTM().inverse());
  const cx=Math.floor(p.x/GAP),cy=Math.floor(p.y/GAP);
  if(cx<0||cy<0||cx>=lv.cols||cy>=lv.rows)return -1;
  const i=cy*lv.cols+cx,[x,y]=pos(i);
  return Math.hypot(p.x-x,p.y-y)<=GAP*0.46?i:-1;   // only count when near the dot centre
}

function tryStep(i,isTap){
  if(i<0||lv.blocked[i]||done)return false;
  const head=path[path.length-1];
  if(!path.length){path=[i];startTimer();return true}
  if(i===head)return false;
  const idx=path.indexOf(i);
  if(idx>=0){
    if(isTap||idx===path.length-2){path=path.slice(0,idx+1);return true}  // backtrack
    return false;
  }
  if(adj(i,head)){path.push(i);if(path.length===lv.free)win();return true}
  return false;
}

function win(){
  done=true;stopTimer();elapsed=Math.floor((Date.now()-t0)/1000);$('timer').textContent=fmt(elapsed);
  if(level>=unlocked&&level<MAX_LEVEL){unlocked=level+1;store.set('olg-unlocked',unlocked)}
  const prev=best[level];const record=prev==null||elapsed<prev;
  if(record){best={...best,[level]:elapsed};store.set('olg-best',best)}
  cloud.queueSave(true);
  setTimeout(()=>{
    $('mTitle').textContent=level>=MAX_LEVEL?'Bạn đã phá đảo!':'Hoàn thành!';
    $('mText').textContent=`Màn ${level} · ${lv.free} điểm · ${fmt(elapsed)}`+(record&&prev!=null?' · Kỷ lục mới!':prev!=null?` · Kỷ lục: ${fmt(prev)}`:'');
    $('mMain').textContent=level>=MAX_LEVEL?'Chơi lại từ màn 1':'Màn tiếp theo';
    $('mMain').onclick=()=>startLevel(level>=MAX_LEVEL?1:level+1);
    $('mAlt').textContent='Chơi lại màn này';$('mAlt').onclick=()=>startLevel(level);
    $('overlay').hidden=false;$('mMain').focus();
  },450);
}

svg.addEventListener('pointerdown',e=>{
  if(done)return;
  const i=cellAt(e);if(i<0)return;
  e.preventDefault();svg.setPointerCapture(e.pointerId);dragging=true;
  if(tryStep(i,true))render();
});
svg.addEventListener('pointermove',e=>{
  if(!dragging||done)return;
  const i=cellAt(e);if(tryStep(i,false))render();
});
const endDrag=()=>{dragging=false};
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);

$('reset').onclick=()=>{if(showing){startLevel(level);return}path=[];done=false;render()};
$('giveup').onclick=()=>{
  if(done&&!showing)return;
  stopTimer();done=true;showing=true;path=[];
  const sol=lv.solution;let k=0;
  const step=()=>{if(!showing||lv.solution!==sol)return;path=sol.slice(0,++k);render();if(k<sol.length)setTimeout(step,Math.max(40,600/sol.length*4));else showGiveUp()};
  step();
};
function showGiveUp(){
  setTimeout(()=>{
    $('mTitle').textContent='Lời giải';
    $('mText').textContent='Thử lại màn này hoặc xem lời giải thêm lần nữa.';
    $('mMain').textContent='Chơi lại màn này';$('mMain').onclick=()=>startLevel(level);
    $('mAlt').textContent='Xem bảng lời giải';$('mAlt').onclick=()=>{$('overlay').hidden=true};
    $('overlay').hidden=false;
  },700);
}
$('prev').onclick=()=>startLevel(level-1);
$('next').onclick=()=>startLevel(level+1);
$('helpBtn').onclick=()=>{$('help').hidden=!$('help').hidden};
