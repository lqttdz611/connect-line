// Đồng bộ tiến trình, đăng nhập / đăng ký, bảng xếp hạng.

/* ---------- lưu tiến trình lên backend ----------
   Đã đăng nhập: lưu lên server mỗi khi qua màn / đổi màn.
   Chưa đăng nhập hoặc không kết nối được backend: chỉ lưu trên trình duyệt. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n|0));
function snapshot(){return {unlocked,level,best}}
function mergeIn(r){
  if(!r)return false;
  let changed=false;
  const u=clamp(r.unlocked||1,1,MAX_LEVEL);if(u>unlocked){unlocked=u;changed=true}
  const b={...best};
  for(const [k,v] of Object.entries(r.best||{})){const L=clamp(k,1,MAX_LEVEL);if(typeof v==='number'&&v>=0&&(b[L]==null||v<b[L])){b[L]=v;changed=true}}
  best=b;
  if(r.level&&clamp(r.level,1,unlocked)!==level&&!path.length){level=clamp(r.level,1,unlocked);changed=true}
  store.set('olg-unlocked',unlocked);store.set('olg-best',best);store.set('olg-level',level);
  return changed;
}
const summary=()=>{const vals=Object.values(best);return {solved:vals.length,totalTime:vals.reduce((a,b)=>a+b,0)}};
const setAvatar=n=>{$('avatar').textContent=(n.trim()[0]||'B').toUpperCase()};
function setSync(state,text){const e=$('sync');e.dataset.state=state;e.textContent=text}

const cloud=(()=>{
  let backend=null, timer=null, chain=Promise.resolve(), lastSent='';
  const api={
    queueSave(now){if(!backend||!backend.canSave())return;clearTimeout(timer);timer=setTimeout(flush,now?0:800)},
  };
  function flush(){
    if(!backend||!backend.canSave())return;
    const p=snapshot(), key=JSON.stringify(p);
    if(key===lastSent)return;
    chain=chain.then(async()=>{
      setSync('saving','Đang lưu…');
      try{await backend.save(p);lastSent=key;setSync('cloud','Đã lưu lên server')}
      catch(e){
        if(e&&e.code==='invalid_argument'){backend=null;setSync('local','Lưu trên máy này');return}
        if(e&&e.status===401){backend.signedOut&&backend.signedOut(true);return}
        setSync('error','Chưa lưu được, sẽ thử lại');setTimeout(()=>api.queueSave(),5000)}
    });
  }
  // replace this browser's progress with the account's (the server already merged guest progress in)
  function adopt(p){
    unlocked=clamp(p.unlocked||1,1,MAX_LEVEL);best={...(p.best||{})};level=clamp(p.level||1,1,unlocked);
    store.set('olg-unlocked',unlocked);store.set('olg-best',best);store.set('olg-level',level);
    lastSent=JSON.stringify(snapshot());
    if(!path.length||done)startLevel(level);else render();
  }

  /* --- tài khoản tên + mật khẩu trên backend --- */
  async function viaApi(){
    const res=await fetch(`${API_BASE}/api/health`,{cache:'no-store',credentials:'include'}).catch(()=>null);
    if(!res||!res.ok)return null;
    let account=null, refreshBoard=()=>{}, mode='login';
    const call=async(method,url,body)=>{
      const r=await fetch(API_BASE+'/'+url,{method,cache:'no-store',credentials:'include',headers:body?{'Content-Type':'application/json'}:{},body:body&&JSON.stringify(body)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){const e=new Error(d.error||'Lỗi kết nối, thử lại sau.');e.status=r.status;throw e}
      return d;
    };
    function showAccount(){
      $('account').hidden=false;
      if(account){
        $('accText').textContent=`Đã đăng nhập: ${account.username}`;$('authBtn').textContent='Đăng xuất';
        $('pname').textContent=account.username;setAvatar(account.username);
      }else{
        $('accText').textContent='Bạn đang chơi thử. Đăng nhập để lưu tiến trình.';$('authBtn').textContent='Đăng nhập / Đăng ký';
        $('pname').textContent='Khách';setAvatar('K');setSync('local','Chưa đăng nhập · lưu trên máy này');
      }
    }
    function signedIn(user){account=user;adopt(user.progress);showAccount();setSync('cloud','Đã lưu lên server');refreshBoard()}
    function signedOut(expired){
      account=null;
      // a shared computer must not carry the last player's progress to the next one
      unlocked=1;best={};level=1;store.set('olg-unlocked',1);store.set('olg-best',{});store.set('olg-level',1);
      startLevel(1);showAccount();refreshBoard();
      if(expired)openAuth('login','Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.');
    }

    /* login / register dialog */
    function setMode(m){
      mode=m;const reg=m==='register';
      $('authTitle').textContent=reg?'Tạo tài khoản':'Đăng nhập';
      $('authSubmit').textContent=reg?'Đăng ký':'Đăng nhập';
      $('authPass2Row').hidden=!reg;$('authPass2').required=reg;
      $('authPass').autocomplete=reg?'new-password':'current-password';
      $('authSwitch').textContent=reg?'Đã có tài khoản? Đăng nhập':'Chưa có tài khoản? Đăng ký';
      $('authHint').hidden=!reg;$('authErr').textContent='';
    }
    function openAuth(m,msg){setMode(m);$('auth').hidden=false;if(msg)$('authErr').textContent=msg;$('authUser').focus()}
    const closeAuth=()=>{$('auth').hidden=true;$('authForm').reset();$('authErr').textContent=''};
    $('authSwitch').onclick=()=>setMode(mode==='login'?'register':'login');
    $('authCancel').onclick=closeAuth;
    $('auth').addEventListener('keydown',e=>{if(e.key==='Escape')closeAuth()});
    $('authForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const username=$('authUser').value.trim(), password=$('authPass').value;
      if(mode==='register'&&password!==$('authPass2').value){$('authErr').textContent='Hai mật khẩu không khớp.';return}
      $('authSubmit').disabled=true;$('authErr').textContent='';
      try{
        const d=await call('POST',`api/auth/${mode}`,{username,password,progress:snapshot()});
        closeAuth();signedIn(d.user);
      }catch(err){$('authErr').textContent=err.message}
      finally{$('authSubmit').disabled=false}
    });
    $('authBtn').onclick=async()=>{
      if(!account)return openAuth('login');
      try{await call('POST','api/auth/logout')}catch{}
      signedOut(false);
    };

    return {
      canSave:()=>!!account,
      signedOut,
      async start(){
        try{const d=await call('GET','api/me');signedIn(d.user)}
        catch(e){if(e.status===401)signedOut(false);else{showAccount();setSync('error','Không kết nối được server')}}
      },
      async save(p){const d=await call('PUT','api/progress',{progress:p});refreshBoard();return d},
      watchBoard(cb){
        refreshBoard=async()=>{try{cb((await call('GET','api/leaderboard')).rows)}catch{}};
        refreshBoard();setInterval(refreshBoard,30000);
      },
    };
  }

  function renderBoard(rows){
    rows=[...rows].sort((a,b)=>b.solved-a.solved||a.totalTime-b.totalTime).slice(0,20);
    $('lb').hidden=false;$('lbEmpty').hidden=rows.length>0;
    const ol=$('lbList');ol.textContent='';
    for(const r of rows){
      const li=document.createElement('li');if(r.me)li.className='me';
      const n=document.createElement('span');n.className='n';n.textContent=(r.name||'Người chơi')+(r.me?' (bạn)':'');
      const s=document.createElement('span');s.textContent=`${r.solved} màn`;
      const t=document.createElement('span');t.className='t';t.textContent=fmt(r.totalTime|0);
      li.append(n,s,t);ol.append(li);
    }
  }

  (async()=>{
    try{
      backend=await viaApi();
    }catch{backend=null}
    if(!backend){setSync('local','Lưu trên máy này');return}
    backend.watchBoard(renderBoard);
    await backend.start();
  })();
  return api;
})();
