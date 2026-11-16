// ═══════════ FIREBASE CONFIG ═══════════
const firebaseConfig = {
  apiKey: "AIzaSyAyWPs80w3tpvfjFO0-OyxJBJyZyLnlkiE",
  authDomain: "order-management-cef5a.firebaseapp.com",
  projectId: "order-management-cef5a",
  storageBucket: "order-management-cef5a.firebasestorage.app",
  messagingSenderId: "969684877727",
  appId: "1:969684877727:web:ee4be1f8bfdef3b3d93daa"
};
// التطبيق يعمل محلياً فوراً بدون انتظار Firebase (يُحمَّل async في الخلفية).
// متى ما وصل Firebase (بعد ثانية أو حتى بعد دقيقة حسب سرعة الشبكة)، نفعّله تلقائياً.
let db=null;
let fbReady=false;
function tryInitFirebase(){
  if(fbReady) return true;
  if(typeof firebase==='undefined'||typeof firebase.firestore!=='function') return false;
  try{
    // لا نعيد التهيئة لو سبق إنشاء التطبيق (يمنع خطأ app/duplicate-app)
    if(!(firebase.apps&&firebase.apps.length))firebase.initializeApp(firebaseConfig);
    db=firebase.firestore();
    fbReady=true;
    // لو المستخدم داخل بالفعل، فعّل المزامنة الآن
    if(currentUser) subscribeOrders();
    return true;
  }catch(e){console.warn('Firebase init failed:',e);return false;}
}
tryInitFirebase(); // محاولة فورية (قد تنجح إذا كان محفوظاً بذاكرة المتصفح مسبقاً)
let _fbAttempts=0;
const _fbPoll=setInterval(()=>{
  _fbAttempts++;
  if(tryInitFirebase()||_fbAttempts>100) clearInterval(_fbPoll); // يحاول كل 300ms لمدة 30 ثانية كحد أقصى
},300);

// ═══════════ STATE ═══════════
let currentUser = null;
let orders = [];
let cloudOrders = [];
let pendingOrders = [];
let deletedIds=[];
try{deletedIds=JSON.parse(localStorage.getItem('lazem_deleted')||'[]');if(!Array.isArray(deletedIds))deletedIds=[];}catch(e){deletedIds=[];}
try{pendingOrders=JSON.parse(localStorage.getItem('lazem_pending')||'[]');}catch(e){pendingOrders=[];}
function persistPending(){try{localStorage.setItem('lazem_pending',JSON.stringify(pendingOrders));}catch(e){console.warn('persist failed',e);}}
function mergeOrders(){
  // امنع التكرار: لو الطلب المحلي وصل فعلاً للسحابة (نفس localRef)، لا تعرضه مرتين — واحذفه من المعلّقة نهائياً
  const syncedRefs=new Set(cloudOrders.map(o=>o.localRef).filter(Boolean));
  if(pendingOrders.some(p=>syncedRefs.has(p.id))){
    pendingOrders=pendingOrders.filter(p=>!syncedRefs.has(p.id));
    persistPending();
  }
  orders=[...pendingOrders.filter(p=>!deletedIds.includes(p.id)).map(p=>({...p,_pending:true})),...cloudOrders.filter(o=>!isDeleted(o))];
  purgeDeleted();
}
// ═══ الطلبات المحذوفة: تُخفى فوراً وتُحذف من السحابة بالخلفية (حتى لو كانت المزامنة جارية) ═══
function persistDeleted(){deletedIds=deletedIds.slice(-300);try{localStorage.setItem('lazem_deleted',JSON.stringify(deletedIds));}catch(e){}}
function isDeleted(o){return deletedIds.includes(o.id)||(!!o.localRef&&deletedIds.includes(o.localRef));}
const _purging=new Set();
function purgeDeleted(){
  if(!fbReady||!db)return;
  cloudOrders.filter(isDeleted).forEach(o=>{
    if(_purging.has(o.id))return;
    _purging.add(o.id);
    try{db.collection('orders').doc(o.id).delete().catch(()=>{_purging.delete(o.id);});}catch(e){_purging.delete(o.id);}
  });
}
// يجد الطلب حتى لو تغيّر رقمه من محلي (LOCAL-…) إلى سحابي بعد المزامنة
function findOrder(id){
  if(!id)return null;
  return orders.find(x=>x.id===id)||orders.find(x=>x.localRef===id)||null;
}
// ينظّف البيانات قبل إرسالها للسحابة (Firestore يرفض القيم undefined)
function cleanData(o){return JSON.parse(JSON.stringify(o));}
function orderDate(o){return o.createdAt||o.createdAtLocal||null;}
mergeOrders();
let openOrderId = null;
let currentSvc = null;
let authMode = 'login'; // or 'signup'
let unsubscribeOrders = null;

// ═══════════ BACKGROUND IMAGES ═══════════
function injectBgImages(){
  if(typeof IMG1==='undefined') return;
  document.querySelectorAll('.scene-img').forEach(el=>{el.style.backgroundImage='url('+IMG1+')';});
  const hbg=document.querySelector('.dash-hero-bg');
  if(hbg) hbg.style.backgroundImage='url('+IMG1+')';
}
document.addEventListener('DOMContentLoaded',function(){
  injectBgImages();
  if(typeof LOGO_SRC!=='undefined'){
    ['hdrLogo','loginLogo','heroLogo'].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.src=LOGO_SRC;
    });
  }
});

// ═══════════ GUEST LOGIN (no account needed) ═══════════

// ═══════════ الوضع النهاري / الليلي ═══════════
function applyTheme(mode){
  const light=mode==='light';
  document.body.classList.toggle('light',light);
  try{localStorage.setItem('lazem_theme',light?'light':'dark');}catch(e){}
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',light?'#EEF3F6':'#000000');
}
function toggleTheme(){
  applyTheme(document.body.classList.contains('light')?'dark':'light');
}
(function initTheme(){
  let saved=null;
  try{saved=localStorage.getItem('lazem_theme');}catch(e){}
  if(!saved&&window.matchMedia){
    saved=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
  }
  applyTheme(saved||'dark');
})();

function doLogin(){
  const name=document.getElementById('loginNameInput').value.trim();
  if(!name){
    const inp=document.getElementById('loginNameInput');
    inp.classList.add('shake');
    setTimeout(()=>inp.classList.remove('shake'),500);
    return;
  }
  currentUser={uid:'guest_'+name.toLowerCase().replace(/\s+/g,'_'),name:name};
  localStorage.setItem('lazem_guest_name',name);
  document.getElementById('hdrUser').textContent=currentUser.name+' — خروج';
  mergeOrders();
  subscribeOrders();
  showPage('dashboard');
}
function logout(){
  currentUser=null;
  document.getElementById('hdrUser').textContent='تسجيل خروج';
  localStorage.removeItem('lazem_guest_name');
  if(unsubscribeOrders){unsubscribeOrders();unsubscribeOrders=null;}
  orders=[];
  document.getElementById('loginNameInput').value='';
  showPage('login');
}
// Auto-login if name saved
document.addEventListener('DOMContentLoaded',function(){
  const saved=localStorage.getItem('lazem_guest_name');
  if(saved){
    currentUser={uid:'guest_'+saved.toLowerCase().replace(/\s+/g,'_'),name:saved};
    document.getElementById('hdrUser').textContent=currentUser.name+' — خروج';
    subscribeOrders();
    showPage('dashboard');
  }
});

// ═══════════ FIRESTORE ORDERS (realtime) ═══════════
function subscribeOrders(){
  if(!db){mergeOrders();if(document.getElementById('page-dashboard').classList.contains('active'))renderDashboard();return;}
  if(!fbReady||!db){mergeOrders();return;}
  if(unsubscribeOrders) unsubscribeOrders();
  unsubscribeOrders=db.collection('orders').orderBy('createdAt','desc')
    .onSnapshot(snap=>{
      cloudOrders=snap.docs.map(d=>({id:d.id,...d.data()}));
      mergeOrders();
      if(document.getElementById('page-dashboard').classList.contains('active')){
        renderDashboard();
      }
      trySyncPending();
    },err=>{
      console.error('Firestore error:',err);
      showToast('خطأ في الاتصال بقاعدة البيانات');
    });
}

// ═══════════ NAVIGATION ═══════════


// ═══ فيديوهات الخلفية: تشغيل فيديو الصفحة النشطة فقط (توفير موارد) ═══
const _vidTimers={};
let _vidGen=0;
// ═══ فيديوهات الخلفية ═══
// في نسخة الملف الواحد تكون الفيديوهات مضمّنة نصاً (base64) — نحوّلها إلى Blob لأن بعض المتصفحات
// (خصوصاً سفاري/آيفون) لا تشغّل فيديو من data: مباشرة.
const BG_VIDS={login:'vidLogin',dashboard:'vidDashboard',form:'vidForm'};
let _bgPage=null;
function ensureVideoSrc(key){
  const v=document.getElementById(BG_VIDS[key]);
  const store=window.__VIDB64;
  if(!v||!store||!store[key]||v.dataset.ready)return;
  try{
    const bin=atob(store[key]);
    const bytes=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
    v.src=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
    v.dataset.ready='1';
    delete store[key];
    v.load();
  }catch(e){console.warn('video decode failed',key,e);}
}
function _playVid(v){
  try{v.muted=true;v.playsInline=true;const pr=v.play();if(pr&&pr.catch)pr.catch(()=>{});}catch(e){}
}
function setBgVideo(page){
  const gen=++_vidGen; // يلغي أي إظهار مؤجل من انتقال سابق
  _bgPage=page;
  Object.entries(BG_VIDS).forEach(([pg,id])=>{
    const v=document.getElementById(id);
    if(!v)return;
    if(_vidTimers[id]){clearTimeout(_vidTimers[id]);_vidTimers[id]=null;}
    if(pg===page){
      ensureVideoSrc(pg);
      // نُظهر الفيديو فقط عندما يشتغل فعلاً — وإلا تبقى الخلفية الثابتة ظاهرة بدل شاشة فارغة
      const show=()=>{if(gen===_vidGen&&_bgPage===pg)v.classList.add('playing');};
      if(!v.paused&&v.readyState>=2){
        if(typeof requestAnimationFrame==='function')requestAnimationFrame(show);else setTimeout(show,16);
      }else{
        v.addEventListener('playing',show,{once:true});
      }
      _playVid(v);
    }else{
      // تلاشَ أولاً ثم أوقف — يمنع القطع المفاجئ أثناء الانتقال
      v.classList.remove('playing');
      _vidTimers[id]=setTimeout(()=>{if(gen===_vidGen){try{v.pause();}catch(e){}}},1000);
    }
  });
}
// تجهيز باقي الفيديوهات بالخلفية بعد فتح الصفحة
setTimeout(()=>{Object.keys(BG_VIDS).forEach(ensureVideoSrc);},2500);
// لو منع المتصفح التشغيل التلقائي (وضع توفير الطاقة مثلاً) نعيد المحاولة مع أول لمسة أو نقرة
['pointerdown','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,()=>{
  if(!_bgPage)return;
  const v=document.getElementById(BG_VIDS[_bgPage]);
  if(v&&v.paused)_playVid(v);
},{passive:true}));
// طلب جديد: يخرج من وضع التعديل ويصفّر النموذج قبل الفتح

// ═══════════ تثبيت التطبيق (PWA) ═══════════
let _installEvt=null;
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  _installEvt=e;
  const b=document.getElementById('installBtn');
  if(b)b.style.display='inline-flex';
});
function installApp(){
  if(!_installEvt){
    showToast('لتثبيت التطبيق: افتح قائمة المتصفح ثم اختر «تثبيت» أو «Install»');
    return;
  }
  _installEvt.prompt();
  _installEvt.userChoice.then(function(res){
    if(res&&res.outcome==='accepted')showToast('تم تثبيت التطبيق على جهازك');
    _installEvt=null;
    const b=document.getElementById('installBtn');
    if(b)b.style.display='none';
  }).catch(function(){});
}
window.addEventListener('appinstalled',function(){
  const b=document.getElementById('installBtn');
  if(b)b.style.display='none';
});

function newOrder(){
  if(typeof editOrderId!=='undefined'&&editOrderId)exitEditState();
  resetForm();
  currentSvc=null;
  document.querySelectorAll('.svc-btn').forEach(b=>b.classList.remove('sel'));
  ['contract','events','projects','training'].forEach(s=>{
    const el=document.getElementById('sec-'+s);if(el)el.classList.remove('show');
  });
  const sc=document.getElementById('sec-client');if(sc)sc.classList.remove('show');
  const sw=document.getElementById('submit-wrap');if(sw)sw.style.display='none';
  updateCodePreview();
  showPage('form');
}
function showPage(page){
  if(page!=='login'&&!currentUser){page='login';}
  document.body.classList.toggle('on-login', page==='login');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  setBgVideo(page);
  const tab=document.getElementById('tab-'+page);
  if(tab) tab.classList.add('active');
  if(page==='dashboard'){if(editOrderId)exitEditState();renderDashboard();}
  window.scrollTo({top:0,behavior:'smooth'});
}

// ═══════════ SERVICE PICKER ═══════════
function pickSvc(svc,btn){
  currentSvc=svc;
  document.querySelectorAll('.svc-btn').forEach(b=>b.classList.remove('sel'));
  btn.classList.add('sel');
  ['contract','events','projects','training'].forEach(s=>document.getElementById('sec-'+s).classList.remove('show'));
  document.getElementById('sec-client').classList.add('show');
  document.getElementById('sec-'+svc).classList.add('show');
  document.getElementById('submit-wrap').style.display='block';
  updateCodePreview();
  setTimeout(()=>{const s=document.getElementById('sec-client');if(s&&s.scrollIntoView)s.scrollIntoView({behavior:'smooth',block:'start'});},100);
}

function pick1(grp,btn,cls){
  btn.closest('.ch').querySelectorAll('.cb').forEach(b=>b.className='cb');
  btn.className='cb '+cls;
}
function toggleMulti(btn){btn.classList.toggle('sel');updateCodePreview();syncEventSvcCounts();}

// إظهار حقول العدد للفرق الراجلة وعربات القولف عند اختيارها بالفعاليات
let _restoringForm=false;
function syncSvcBlocks(prefix){
  const wrap=document.getElementById(prefix+'-svctype-wrap');if(!wrap)return;
  const sel=[...wrap.querySelectorAll('.cb.multi.sel')].map(b=>b.textContent.trim());
  const map=[
    ['amb',    x=>x.includes('إسعاف'), ['-amb-count','-amb-doctors','-amb-paramedics','-amb-drivers']],
    ['clinic', x=>x.includes('عيادة'), ['-clinic-count','-clinic-doctors','-clinic-nurses','-clinic-paramedics']],
    ['walk',   x=>x.includes('راجلة'), ['-walk-count','-walk-paramedics']],
    ['golf',   x=>x.includes('قولف'),  ['-golf-count','-golf-paramedics','-golf-drivers']]
  ];
  let any=false;
  map.forEach(([key,test,fields])=>{
    const on=sel.some(test);
    if(on)any=true;
    const blk=document.getElementById(prefix+'-blk-'+key);
    if(blk)blk.style.display=on?'block':'none';
    // أثناء استعادة نموذج التعديل لا نمسح القيم (الأزرار لم تُستعَد كلها بعد)
    if(!on&&!_restoringForm)fields.forEach(sfx=>{const i=document.getElementById(prefix+sfx);if(i)i.value='';});
  });
  const box=document.getElementById(prefix+'-svc-blocks');
  if(box)box.style.display=any?'flex':'none';
}
function syncEventSvcCounts(){syncSvcBlocks('e');syncSvcBlocks('p');}
function toggleCity(btn,groupId){
  btn.classList.toggle('sel');
  if(btn.classList.contains('city-other')){
    const otherId=groupId.replace('-cities','')+'-cities-other';
    const inp=document.getElementById(otherId);
    if(inp){inp.style.display=btn.classList.contains('sel')?'block':'none';if(btn.classList.contains('sel'))inp.focus();}
  }
}
function getCities(groupId){
  const el=document.getElementById(groupId);if(!el)return'';
  const selected=[...el.querySelectorAll('.city-cb.sel')].map(b=>b.textContent.trim());
  const otherId=groupId.replace('-cities','')+'-cities-other';
  const inp=document.getElementById(otherId);
  if(inp&&inp.style.display!=='none'&&inp.value.trim()){
    const idx=selected.indexOf('أخرى');if(idx!==-1)selected[idx]=inp.value.trim();else selected.push(inp.value.trim());
  }
  return selected.join('، ');
}



function chkEvAccom(){
  const n=parseInt((document.getElementById('e-dur-num')||{}).value)||0;
  const unit=getSelected('e-dur-unit')||'أيام';
  const d=unit.includes('شهر')||unit.includes('أشهر')?n*30:n; // تحويل الأشهر لأيام لفحص السكن
  const cities=getCities('e-cities');
  const out=cities&&!cities.includes('الرياض');
  document.getElementById('e-accom-wrap').className='cond s2'+(d>14&&out?' show':'');
}
// دورة التوعية بالإسعافات الأولية: حد أقصى 200 متدرب ولا تُقسَّم لجلسات
function toggleAed(){
  const on=document.getElementById('tr-aed').checked,w=document.getElementById('tr-aed-wrap');
  if(w)w.style.display=on?'block':'none';
  const c=document.getElementById('tr-aed-count');
  if(!on){if(c&&!_restoringForm)c.value='';}
  else if(!_restoringForm&&c&&!c.value)c.value='1';
  syncAedLock();
}
// جهاز AED بدون أي دورة: تُقفل خانات المقر والاعتماد واللغة لأنها خاصة بالدورات
const AED_LOCK_IDS=['tr-venue','tr-cert','tr-lang'];
function toggleKit(){
  const on=document.getElementById('tr-kit').checked,w=document.getElementById('tr-kit-wrap');
  if(w)w.style.display=on?'block':'none';
  if(!_restoringForm){
    const c=document.getElementById('tr-kit-count');
    if(!on){if(c)c.value='';['tr-kit-size','tr-kit-logo'].forEach(id=>document.querySelectorAll('#'+id+' .cb').forEach(b=>b.className='cb'));}
    else if(c&&!c.value)c.value='1';
  }
  syncAedLock();
}
// خدمات إضافية (AED / حقائب) بدون أي دورة
function isAedOnly(){
  const extra=['tr-aed','tr-kit'].some(id=>{const el=document.getElementById(id);return !!(el&&el.checked);});
  return extra&&!['crs-aware','crs-fa','crs-fire','crs-ohs'].some(id=>document.getElementById(id).checked);
}
function syncAedLock(){
  const lock=isAedOnly();
  AED_LOCK_IDS.forEach(id=>{
    const g=document.getElementById(id);if(!g)return;
    const f=g.closest('.fld');if(f)f.classList.toggle('locked',lock);
    g.querySelectorAll('.cb').forEach(b=>{
      b.disabled=lock;
      if(lock)b.className=b.classList.contains('multi')?'cb multi':'cb';
    });
  });
  const tc=document.getElementById('tr-count');
  if(tc){const f=tc.closest('.fld');if(f)f.classList.toggle('locked',lock);tc.disabled=lock;if(lock&&!_restoringForm)tc.value='';}
  const n=document.getElementById('tr-lock-note');if(n)n.style.display=lock?'block':'none';
  const ll=document.getElementById('tr-loc-label');if(ll)ll.textContent=lock?'مكان التسليم':'مكان الدورة';
  const tt=document.getElementById('tr-title-txt');if(tt)tt.textContent=lock?'تفاصيل الطلب':'تفاصيل الدورة';
}
document.addEventListener('change',e=>{if(e.target&&/^crs-/.test(e.target.id||''))syncAedLock();});
function isAwarenessOnly(){
  const aware=document.getElementById('crs-aware');
  if(!aware||!aware.checked)return false;
  // تكون توعوية فقط إذا لم تُختَر أي دورة أخرى
  return !['crs-fa','crs-fire','crs-ohs'].some(id=>{
    const el=document.getElementById(id);return el&&el.checked;
  });
}
function chkTrainees(){
  const el=document.getElementById('tr-count');if(!el)return;
  const n=parseInt(el.value)||0;
  const note=document.getElementById('tr-note');
  const lbl=document.getElementById('tr-count-note');
  const awareness=isAwarenessOnly();
  if(lbl)lbl.textContent=awareness?'الحد الأقصى 200 متدرب':'الحد الأقصى 20 لكل جلسة';
  if(!note)return;
  if(awareness){
    if(n>200){note.textContent='الحد الأقصى لدورة التوعية 200 متدرب';note.style.display='block';}
    else note.style.display='none';
  }else{
    if(n>20){note.textContent=`${n} متدرب — يتطلب ${Math.ceil(n/20)} جلسات`;note.style.display='block';}
    else note.style.display='none';
  }
}
function getMultiText(grpId){
  const el=document.getElementById(grpId);if(!el)return'';
  return[...el.querySelectorAll('.cb.multi.sel')].map(b=>b.textContent.trim()).join('، ');
}
function toggleEvTypeOther(show){
  const el=document.getElementById('e-evtype-other');
  if(!el)return;
  el.style.display=show?'block':'none';
  if(!show)el.value='';
  else el.focus();
}
function getSelected(grpId){
  const el=document.getElementById(grpId);if(!el)return'';
  const a=el.querySelector('.cb.t,.cb.g,.cb.r,.cb.a,.cb.n');return a?a.textContent.trim():'';
}
function v(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function nextOrderCode(){
  // عدّاد تصاعدي دائم: لا يعيد استخدام رقم أبداً حتى بعد حذف طلبات
  let max=parseInt(localStorage.getItem('lazem_code_counter')||'0',10)||0;
  orders.forEach(o=>{const n=parseInt(o.code,10);if(!isNaN(n)&&n>max)max=n;});
  const next=max+1;
  localStorage.setItem('lazem_code_counter',String(next));
  return String(next).padStart(4,'0');
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ═══════════ LZM CODE STRUCTURE (per Coding Standard v0.1) ═══════════
// LZM-[Classification]-[Level]-[Client]-[Year]  e.g. LZM-FMC-A-KAP-25
function getSvcTypes(secId){
  const sec=document.getElementById(secId);if(!sec)return[];
  return[...sec.querySelectorAll('.cb.multi.sel')].map(b=>b.textContent.trim());
}
function getProjectSvcTypes(){
  const sec=document.getElementById('sec-projects');if(!sec)return[];
  return[...sec.querySelectorAll('.cb.multi.sel')].map(b=>b.textContent.trim());
}
function getClassCode(){
  if(currentSvc==='contract')return'MT';
  if(currentSvc==='events'){
    const t=getSvcTypes('sec-events');
    const hasClinic=t.some(x=>x.includes('عيادة'));
    const hasAmb=t.some(x=>x.includes('إسعاف'));
    if(hasClinic&&hasAmb)return'CWA';
    if(hasClinic)return'CLI';
    return'FMC';
  }
  if(currentSvc==='training')return'TRG';
  if(currentSvc==='projects'){
    const t=getProjectSvcTypes();
    const hasClinic=t.some(x=>x.includes('عيادة'));
    const hasAmb=t.some(x=>x.includes('إسعاف'));
    if(hasClinic&&hasAmb)return'CWA';
    if(hasClinic)return'CLI';
    return'FMC';
  }
  return'•••';
}
const LEVELS={}; // selected equipment level per prefix: ev/pr/ct

function setLvl(prefix,val,btn){
  LEVELS[prefix]=val;
  document.querySelectorAll('[id^="'+prefix+'-lc-"]').forEach(c=>c.className='level-card');
  btn.className='level-card sel-lvl';
  updateCodePreview();
}

function getLevelCode(){
  if(currentSvc==='events')   return LEVELS['ev']||'NA';
  if(currentSvc==='projects') return LEVELS['pr']||'NA';
  if(currentSvc==='contract') return LEVELS['ct']||'NA';
  if(currentSvc==='training'){
    // Per standard: FA1=توعية, FA2=إسعافات+CPR+AED, FA3=بيئة العمل, FS=حرائق
    if(document.getElementById('crs-aware')&&document.getElementById('crs-aware').checked)return'FA1';
    if(document.getElementById('crs-fa')&&document.getElementById('crs-fa').checked)return'FA2';
    if(document.getElementById('crs-ohs')&&document.getElementById('crs-ohs').checked)return'FA3';
    if(document.getElementById('crs-fire')&&document.getElementById('crs-fire').checked)return'FS';
    return'NA';
  }
  return'NA';
}

function getLevelLabel(code){
  const map={'B':'B — أساسي (BLS)','B+':'B+ — أساسي معزز','A':'A — متقدم (ALS)','A+':'A+ — متقدم شامل','FA1':'FA1 — توعية إسعافات أولية','FA2':'FA2 — إسعافات أولية + CPR + AED','FA3':'FA3 — إسعافات بيئة العمل','FS':'FS — السلامة من الحرائق','FW':'FW — مشرف سلامة','NA':'NA'};
  return map[code]||code;
}

function getYearCode(){
  let d=null;
  if(currentSvc==='events'&&v('e-start'))d=new Date(v('e-start'));
  else if(currentSvc==='projects'&&v('p-start'))d=new Date(v('p-start'));
  if(!d||isNaN(d))d=new Date();
  return String(d.getFullYear()).slice(-2);
}

function buildLzmCode(){
  const cls=currentSvc?getClassCode():'•••';
  const lvl=currentSvc?getLevelCode():'••';
  const cli=v('f-client-code')||'•••';
  const yr=getYearCode();
  return `LZM-${cls}-${lvl}-${cli}-${yr}`;
}

// Sequential suffix per standard: if same client+class+level+year exists → -01/-02...
function finalizeLzmCode(base){
  const dupes=orders.filter(o=>(o.lzmCode||'').startsWith(base));
  if(dupes.length===0)return base;
  return base+'-'+String(dupes.length+1).padStart(2,'0');
}

function updateCodePreview(){
  const el=document.getElementById('codePreviewValue');
  if(el) el.textContent=buildLzmCode();
}

// ═══════════ SAVE ORDER (to Firestore) ═══════════
let _submitting=false;
async function saveOrder(){
  if(_submitting)return; // يمنع الضغط المزدوج/المتكرر من إنشاء طلبين
  try{await _saveOrderImpl();}
  catch(e){console.error('saveOrder failed',e);showToast('تعذّر حفظ الطلب — حاول مرة أخرى');}
  finally{
    // مهما حصل: لا يبقى زر الحفظ معلّقاً
    _submitting=false;
    const b=document.querySelector('.submit-btn');if(b){b.disabled=false;b.style.opacity='1';}
  }
}
async function _saveOrderImpl(){
  const clientName=v('f-client-name');
  if(!clientName){showToast('أدخل اسم العميل');document.getElementById('f-client-name').focus();return;}
  if(!currentSvc){showToast('اختر نوع الخدمة');return;}
  const clientCode=v('f-client-code');
  if(!clientCode||clientCode.length<2){showToast('أدخل رمز العميل (3 أحرف)');document.getElementById('f-client-code').focus();return;}

  // الحقول الإلزامية حسب نوع الخدمة
  if(currentSvc==='events'){
    if(!getSelected('e-evtype')){showToast('اختر نوع الفعالية');const _ev=document.getElementById('e-evtype');if(_ev&&_ev.scrollIntoView)_ev.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(getSelected('e-evtype')==='أخرى'&&!v('e-evtype-other')){showToast('اكتب نوع الفعالية');document.getElementById('e-evtype-other').focus();return;}
    if(!v('e-hours')){showToast('أدخل عدد الساعات اليومية');document.getElementById('e-hours').focus();return;}
    if(!v('e-dur-num')){showToast('أدخل المدة الزمنية');document.getElementById('e-dur-num').focus();return;}
  }
  if(currentSvc==='projects'){
    if(!v('p-hours')){showToast('أدخل ساعات العمل اليومية');document.getElementById('p-hours').focus();return;}
    if(!v('p-dur-num')){showToast('أدخل المدة الزمنية');document.getElementById('p-dur-num').focus();return;}
  }

  if(currentSvc==='training'&&document.getElementById('tr-aed').checked&&!(parseInt(v('tr-aed-count'))>0)){
    showToast('أدخل عدد أجهزة AED');document.getElementById('tr-aed-count').focus();return;
  }
  if(currentSvc==='training'&&document.getElementById('tr-kit').checked){
    if(!(parseInt(v('tr-kit-count'))>0)){showToast('أدخل عدد حقائب الإسعافات');document.getElementById('tr-kit-count').focus();return;}
    if(!getSelected('tr-kit-size')){showToast('اختر مقاس الحقيبة');return;}
    if(!getSelected('tr-kit-logo')){showToast('حدّد طباعة شعار الشركة: نعم أو لا');return;}
  }
  const svcLabels={contract:'عقود النقل',events:'تغطية الفعاليات',projects:'تغطية المشاريع',training:'الدورات التدريبية'};
  let details={};

  if(currentSvc==='contract'){
    details={'مستوى التجهيز':getLevelLabel(LEVELS['ct']||'NA'),'مدة العقد':getSelected('c-dur'),'المدينة':getSelected('c-city'),'اسم الجهة':v('c-company')};
  } else if(currentSvc==='events'){
    details={'مستوى التجهيز':getLevelLabel(LEVELS['ev']||'NA'),'نوع الفعالية':(getSelected('e-evtype')==='أخرى'?(v('e-evtype-other')||'أخرى'):getSelected('e-evtype')),'نوع الخدمة':getSvcTypes('sec-events').join('، '),
      'سيارات الإسعاف':v('e-amb-count'),'أطباء الإسعاف':v('e-amb-doctors'),'مسعفو الإسعاف':v('e-amb-paramedics'),'سائقو الإسعاف':v('e-amb-drivers'),
      'عدد العيادات':v('e-clinic-count'),'أطباء العيادة':v('e-clinic-doctors'),'ممرضو العيادة':v('e-clinic-nurses'),'مسعفو العيادة':v('e-clinic-paramedics'),
      'عدد الفرق الراجلة':v('e-walk-count'),'مسعفو الفرق الراجلة':v('e-walk-paramedics'),
      'عدد عربات القولف':v('e-golf-count'),'مسعفو عربات القولف':v('e-golf-paramedics'),'سائقو عربات القولف':v('e-golf-drivers'),'عدد الحضور':v('e-attendees'),'المدة الزمنية':(v('e-dur-num')?v('e-dur-num')+' '+(getSelected('e-dur-unit')||'أيام'):''),'ساعات يومياً':v('e-hours'),'تاريخ البداية':v('e-start'),'المدن':getCities('e-cities'),'الموقع':v('e-loc'),'السكن':getSelected('e-accom')};
  } else if(currentSvc==='projects'){
    details={'مستوى التجهيز':getLevelLabel(LEVELS['pr']||'NA'),'طبيعة المشروع':getSelected('p-type'),'نوع الأيام':getSelected('p-dtype'),'ساعات العمل اليومية':v('p-hours'),'أيام الأسبوع':v('p-dweek'),'المدة الزمنية':(v('p-dur-num')?v('p-dur-num')+' '+(getSelected('p-dur-unit')||'أشهر'):''),'تاريخ البداية':v('p-start'),'المدن':getCities('p-cities'),'عدد العاملين في المشروع':v('p-workers'),'نوع الخدمة':getProjectSvcTypes().join('، '),
      'سيارات الإسعاف':v('p-amb-count'),'أطباء الإسعاف':v('p-amb-doctors'),'مسعفو الإسعاف':v('p-amb-paramedics'),'سائقو الإسعاف':v('p-amb-drivers'),
      'عدد العيادات':v('p-clinic-count'),'أطباء العيادة':v('p-clinic-doctors'),'ممرضو العيادة':v('p-clinic-nurses'),'مسعفو العيادة':v('p-clinic-paramedics'),
      'عدد الفرق الراجلة':v('p-walk-count'),'مسعفو الفرق الراجلة':v('p-walk-paramedics'),
      'عدد عربات القولف':v('p-golf-count'),'مسعفو عربات القولف':v('p-golf-paramedics'),'سائقو عربات القولف':v('p-golf-drivers'),'السكن والإعاشة':getSelected('p-accom')};
  } else if(currentSvc==='training'){
    const courses=[];
    if(document.getElementById('crs-aware').checked)courses.push('توعية بالإسعافات الأولية (4 ساعات)');
    if(document.getElementById('crs-fa').checked)courses.push('الإسعافات الأولية (7 ساعات)');
    if(document.getElementById('crs-fire').checked)courses.push('السلامة من الحرائق (6 ساعات)');
    if(document.getElementById('crs-ohs').checked)courses.push('الصحة والسلامة المهنية (6 ساعات)');
    const n=parseInt(v('tr-count'))||0;
    const trLoc=getSelected('tr-loc');
    const trCities=trLoc&&trLoc.includes('خارج')?getCities('tr-cities'):'الرياض';
    const awareness=isAwarenessOnly();
    details={'مكان الدورة':trLoc+(trCities&&trLoc.includes('خارج')?' — '+trCities:''),'مقر التدريب':getSelected('tr-venue'),'نوع الاعتماد':getSelected('tr-cert'),'اللغة':getMultiText('tr-lang'),'عدد المتدربين':v('tr-count'),'الدورات المطلوبة':courses.join('، '),'اسم الجهة':v('tr-company')};
    // عدد الجلسات لا ينطبق على دورة التوعية (حد 200 بجلسة واحدة)
    if(!awareness&&n>0)details['عدد الجلسات']=n>20?Math.ceil(n/20)+' جلسات':'1 جلسة';
    if(document.getElementById('tr-aed').checked)details['عدد أجهزة AED']=v('tr-aed-count');
    if(document.getElementById('tr-kit').checked){
      details['عدد حقائب الإسعافات']=v('tr-kit-count');
      details['مقاس الحقيبة']=getSelected('tr-kit-size');
      details['طباعة شعار الشركة']=getSelected('tr-kit-logo');
    }
  }

  Object.keys(details).forEach(k=>{if(!details[k])delete details[k];});

  _submitting=true;
  const submitBtn=document.querySelector('.submit-btn');
  if(submitBtn){submitBtn.disabled=true;submitBtn.style.opacity='.6';}

  const formState=captureFormState(currentSvc);

  // ═══ وضع التعديل: تحديث الطلب الموجود بدل إنشاء جديد ═══
  if(editOrderId){
    const o=findOrder(editOrderId);
    if(!o)showToast('تعذّر التعديل: الطلب لم يعد موجوداً');
    if(o){
      const upd={
        clientName,clientCode,
        notes:v('f-client-notes'),
        details,formState,quoteDue:v('f-quote-due'),
        svc:currentSvc,svcLabel:svcLabels[currentSvc]
      };
      // إعادة توليد كود LZM إذا تغيرت مكوناته (مع استثناء الطلب نفسه من عدّ التكرار)
      const base=buildLzmCode();
      if(!(o.lzmCode||'').startsWith(base)){
        const dupes=orders.filter(x=>x.id!==o.id&&(x.lzmCode||'').startsWith(base));
        upd.lzmCode=dupes.length===0?base:base+'-'+String(dupes.length+1).padStart(2,'0');
      }
      Object.assign(o,upd);
      if(String(o.id).startsWith('LOCAL-')){
        const p=pendingOrders.find(x=>x.id===o.id);
        if(p)Object.assign(p,upd);
        persistPending();
      }else if(db){
        // تحديث فوري محلياً، والمزامنة السحابية بالخلفية بدون انتظار
        const c=cloudOrders.find(x=>x.id===o.id);
        if(c)Object.assign(c,upd);
        try{
          db.collection('orders').doc(o.id).update(cleanData(upd))
            .catch(()=>showToast('حُفظ محلياً — تعذرت المزامنة السحابية'));
        }catch(e){console.warn('update failed',e);showToast('حُفظ محلياً — تعذرت المزامنة السحابية');}
      }
      mergeOrders();
      showToast('تم حفظ التعديلات على الطلب #'+(o.code||''));
    }
    exitEditState();
    resetForm();
    showPage('dashboard');
    _submitting=false;
    if(submitBtn){submitBtn.disabled=false;submitBtn.style.opacity='1';}
    return;
  }

  const order={
    id:'LOCAL-'+Date.now(),
    code:nextOrderCode(),
    lzmCode:finalizeLzmCode(buildLzmCode()),
    clientCode:clientCode,
    createdAt:new Date().toISOString(),
    svc:currentSvc,svcLabel:svcLabels[currentSvc],
    clientName,
    notes:v('f-client-notes'),
    details,formState,quoteDue:v('f-quote-due'),quoteDone:false,
    addedBy:currentUser.name,
    addedByUid:currentUser.uid
  };

  // Instant local save — always succeeds
  pendingOrders.unshift(order);
  persistPending();
  mergeOrders();
  showToast('تم حفظ الطلب!');
  resetForm();
  showPage('dashboard');
  _submitting=false;
  if(submitBtn){submitBtn.disabled=false;submitBtn.style.opacity='1';}

  // Background cloud sync (non-blocking)
  trySyncPending();
}

// ═══════════ BACKGROUND SYNC ═══════════
let syncing=false;
async function trySyncPending(){
  if(!fbReady||!db)return;
  if(syncing||!pendingOrders.length)return;
  syncing=true;
  try{
    const queue=[...pendingOrders];
    for(const item of queue){
      const localId=item.id;
      if(deletedIds.includes(localId)){pendingOrders=pendingOrders.filter(p=>p.id!==localId);persistPending();continue;}
      // لو وصل للسحابة سابقاً (مهلة انتهت ثم نجح الإرسال) لا نرسله مرة ثانية
      if(cloudOrders.some(o=>o.localRef===localId)){pendingOrders=pendingOrders.filter(p=>p.id!==localId);persistPending();continue;}
      try{
        const sentJson=JSON.stringify(item);
        const data=cleanData(item);
        delete data.id;delete data._pending;
        data.localRef=localId; // مرجع للمطابقة لاحقاً ومنع التكرار
        data.createdAtLocal=item.createdAt;
        data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
        const timeout=new Promise((_,rej)=>setTimeout(()=>rej(new Error('T')),10000));
        const ref=await Promise.race([timeout, db.collection('orders').add(data)]);
        // أثناء الإرسال قد يكون المستخدم حذف الطلب أو عدّله — نطابق السحابة مع آخر حالة
        const cur=pendingOrders.find(p=>p.id===localId);
        if(deletedIds.includes(localId)||!cur){
          if(ref&&ref.delete)ref.delete().catch(()=>{});
        }else if(JSON.stringify(cur)!==sentJson&&ref&&ref.update){
          const latest=cleanData(cur);delete latest.id;delete latest._pending;delete latest.createdAt;
          ref.update(latest).catch(()=>{});
        }
        pendingOrders=pendingOrders.filter(p=>p.id!==localId);
        persistPending();
      }catch(e){
        break; // stop on first failure, retry later
      }
    }
    mergeOrders();
    if(document.getElementById('page-dashboard').classList.contains('active'))renderDashboard();
  }catch(e){console.warn('sync failed',e);}
  finally{syncing=false;}
}
// Retry sync periodically
setInterval(trySyncPending,30000);

function resetForm(){
  const _qd=document.getElementById('f-quote-due');if(_qd){_qd.value='';updateQuoteDueHint();}
  currentSvc=null;
  document.querySelectorAll('.svc-btn').forEach(b=>b.classList.remove('sel'));
  ['contract','events','projects','training'].forEach(s=>document.getElementById('sec-'+s).classList.remove('show'));
  document.getElementById('sec-client').classList.remove('show');
  document.getElementById('submit-wrap').style.display='none';
  document.querySelectorAll('.form-section input,.form-section textarea').forEach(el=>el.value='');
  document.querySelectorAll('.cb').forEach(b=>b.className=b.className.includes('multi')?'cb multi':'cb');
  document.querySelectorAll('.city-cb').forEach(b=>b.classList.remove('sel'));
  document.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false);
  document.querySelectorAll('.level-card').forEach(c=>c.className='level-card');
  Object.keys(LEVELS).forEach(k=>delete LEVELS[k]);
  const tcw=document.getElementById('tr-city-wrap');if(tcw)tcw.style.display='none';
  const aw=document.getElementById('tr-aed-wrap');if(aw)aw.style.display='none';
  const kw=document.getElementById('tr-kit-wrap');if(kw)kw.style.display='none';
  syncAedLock();
  const eto=document.getElementById('e-evtype-other');if(eto){eto.value='';eto.style.display='none';}
  document.querySelectorAll('#tr-cities .city-cb').forEach(b=>b.classList.remove('sel'));
  ['e','p'].forEach(px=>[px+'-svc-blocks',px+'-blk-amb',px+'-blk-clinic',px+'-blk-walk',px+'-blk-golf'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';}));
  const tco=document.getElementById('tr-cities-other');if(tco){tco.value='';tco.style.display='none';}
  const tcn=document.getElementById('tr-count-note');if(tcn)tcn.textContent='الحد الأقصى 20 لكل جلسة';
  currentVideoKey=null;
}

// ═══════════ DASHBOARD ═══════════
function renderDashboard(){
  const all=orders.length;
  countTo('st-all',all);
  countTo('st-events',orders.filter(o=>o.svc==='events').length);
  countTo('st-projects',orders.filter(o=>o.svc==='projects').length);
  countTo('st-training',orders.filter(o=>o.svc==='training').length);
  document.getElementById('hdrCount').textContent='عدد الطلبات '+all;
  const hAll=document.getElementById('hero-all');
  const hEv=document.getElementById('hero-events');
  const hPr=document.getElementById('hero-projects');
  if(hAll)hAll.textContent=all;
  if(hEv)hEv.textContent=orders.filter(o=>o.svc==='events').length;
  if(hPr)hPr.textContent=orders.filter(o=>o.svc==='projects').length;
  renderOrders();
}


// ═══════════ التواريخ — تنسيق موحّد (ميلادي، أرقام لاتينية) ═══════════
const DATE_LOCALE='ar-SA-u-ca-gregory-nu-latn';
function _toDate(ts){
  if(!ts)return null;
  if(ts.toDate)return ts.toDate();
  if(typeof ts==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(ts)){const p=ts.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
  const d=new Date(ts);return isNaN(d)?null:d;
}
function fmtDate(ts,opts){
  const d=_toDate(ts);if(!d)return'—';
  try{return d.toLocaleDateString(DATE_LOCALE,opts||{day:'numeric',month:'short',year:'numeric'});}
  catch(e){return d.toISOString().slice(0,10);}
}
function fmtDateLong(ts){return fmtDate(ts,{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
function fmtTime(d){
  try{return d.toLocaleTimeString(DATE_LOCALE,{hour:'numeric',minute:'2-digit'});}catch(e){return'';}
}
// يحوّل أي قيمة تاريخ خام (2026-09-01 أو 2026-09-01T08:00) إلى نص مقروء
function prettyVal(val){
  const s=String(val==null?'':val);
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)){const d=new Date(s);if(!isNaN(d))return fmtDateLong(d)+' — '+fmtTime(d);}
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return fmtDateLong(s);
  return s;
}
function isoDay(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

// ═══════════ تاريخ تسليم التسعيرة ═══════════
function daysUntil(iso){
  const d=_toDate(iso);if(!d)return null;
  const t=new Date();t.setHours(0,0,0,0);d.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function dayWord(n){return n===1?'يوم':n===2?'يومين':(n>=3&&n<=10)?n+' أيام':n+' يوماً';}
function dueInfo(o){
  if(!o||!o.quoteDue)return{key:'none',emoji:'',label:'',cls:''};
  if(o.quoteDone)return{key:'done',emoji:'✅',label:'تم تسليم التسعيرة',cls:'due-done'};
  const n=daysUntil(o.quoteDue);
  if(n===null)return{key:'none',emoji:'',label:'',cls:''};
  if(n<0)return{key:'overdue',emoji:'🔴',label:'متأخرة '+dayWord(-n),cls:'due-over'};
  if(n===0)return{key:'today',emoji:'🟠',label:'تستحق اليوم',cls:'due-today'};
  if(n===1)return{key:'week',emoji:'🟡',label:'تستحق غداً',cls:'due-soon'};
  if(n<=7)return{key:'week',emoji:'🟡',label:'بعد '+dayWord(n),cls:'due-soon'};
  return{key:'later',emoji:'🟢',label:'بعد '+dayWord(n),cls:'due-ok'};
}
function setQuoteDue(offset){
  const el=document.getElementById('f-quote-due');if(!el)return;
  if(offset===null){el.value='';}
  else{const d=new Date();d.setDate(d.getDate()+offset);el.value=isoDay(d);}
  updateQuoteDueHint();
}
function updateQuoteDueHint(){
  const el=document.getElementById('f-quote-due'),h=document.getElementById('quoteDueHint');
  if(!el||!h)return;
  // تحديد الزر المطابق للتاريخ المختار (اليوم / غداً / بعد 3 أيام / بعد أسبوع)
  const diff=el.value?daysUntil(el.value):null;
  document.querySelectorAll('.qd-chip[data-off]').forEach(b=>b.classList.toggle('on',diff!==null&&String(diff)===b.dataset.off));
  if(!el.value){h.textContent='حدّد الموعد المطلوب لتسليم التسعيرة للعميل (اختياري)';h.className='qd-hint';return;}
  const i=dueInfo({quoteDue:el.value});
  h.textContent=i.emoji+' '+fmtDateLong(el.value)+' — '+i.label;
  h.className='qd-hint '+i.cls;
}
function toggleQuoteDone(){
  if(!openOrderId)return;
  const o=findOrder(openOrderId);if(!o){closeDetail();return;}
  const upd={quoteDone:!o.quoteDone,quoteDoneAt:!o.quoteDone?new Date().toISOString():''};
  Object.assign(o,upd);
  if(String(o.id).startsWith('LOCAL-')){
    const p=pendingOrders.find(x=>x.id===o.id);if(p)Object.assign(p,upd);persistPending();
  }else{
    const c=cloudOrders.find(x=>x.id===o.id);if(c)Object.assign(c,upd);
    if(db){try{db.collection('orders').doc(o.id).update(cleanData(upd)).catch(()=>showToast('حُفظ محلياً — تعذرت المزامنة السحابية'));}catch(e){console.warn(e);}}
  }
  mergeOrders();
  showToast(upd.quoteDone?'تم تسجيل تسليم التسعيرة':'أُعيدت التسعيرة إلى قيد الانتظار');
  openOrder(o.id);
  if(document.getElementById('page-dashboard').classList.contains('active'))renderDashboard();
}
function filterByDue(key){const s=document.getElementById('filterDue');if(s){s.value=key;renderOrders();}}

// ═══════════ مسميات وأيقونات ═══════════
const SVC_NAMES={contract:'عقود النقل',events:'تغطية الفعاليات',projects:'تغطية المشاريع',training:'الدورات التدريبية'};
const SVC_EMOJI={contract:'📋',events:'🎪',projects:'🏗️',training:'🎓'};
// طلبات التدريب قد تكون دورة، أو جهاز AED (أجهزة طبية)، أو حقائب إسعافات (مستلزمات طبية)، أو مزيج
function trainingParts(o){
  const d=(o&&o.details)||{};
  return {aed:!!d['عدد أجهزة AED'],kit:!!d['عدد حقائب الإسعافات'],course:!!String(d['الدورات المطلوبة']||'').trim()};
}
function isSupplyOnly(o){const x=trainingParts(o);return !!o&&o.svc==='training'&&(x.aed||x.kit)&&!x.course;}
function svcName(o){
  if(o.svc==='training'){
    const x=trainingParts(o);
    const extra=x.aed&&x.kit?'أجهزة ومستلزمات طبية':x.aed?'أجهزة طبية':x.kit?'مستلزمات طبية':'';
    if(extra)return x.course?SVC_NAMES.training+' + '+extra:extra;
  }
  return SVC_NAMES[o.svc]||String(o.svcLabel||'');
}
// تفاصيل الطلب للعرض والنسخ: في طلبات الأجهزة/المستلزمات فقط «مكان الدورة» يصير «مكان التسليم»
function detailEntries(o){
  const only=isSupplyOnly(o);
  return Object.entries((o&&o.details)||{}).map(([k,vv])=>[only&&k==='مكان الدورة'?'مكان التسليم':k,vv]);
}
function svcFull(o){const e=isSupplyOnly(o)?'🧰':SVC_EMOJI[o.svc];return (e?e+' ':'')+svcName(o);}
const KEY_EMOJI=[['مستوى التجهيز','⭐'],['نوع الفعالية','🎪'],['طبيعة المشروع','🏗️'],['نوع الأيام','🗓️'],['ساعات','⏱️'],['أيام الأسبوع','🗓️'],['المدة الزمنية','⏳'],['مدة العقد','⏳'],['تاريخ البداية','📆'],['المدن','📍'],['الموقع','📍'],['مكان الدورة','📍'],['مكان التسليم','📍'],['أجهزة AED','⚡'],['حقائب','🧰'],['مقاس الحقيبة','📏'],['طباعة شعار','🖨️'],['مقر التدريب','🏫'],['عدد العاملين','👷'],['عدد الحضور','👥'],['عدد المتدربين','👥'],['نوع الخدمة','🩺'],['سيارات الإسعاف','🚑'],['أطباء','👨‍⚕️'],['ممرض','💉'],['مسعف','⛑️'],['سائق','🚗'],['العيادات','🏥'],['الفرق الراجلة','🚶'],['القولف','🛺'],['السكن','🏨'],['الاعتماد','🎖️'],['اللغة','🌐'],['الجلسات','🧑‍🏫'],['الدورات المطلوبة','📚'],['اسم الجهة','🏢']];
function keyEmoji(k){const f=KEY_EMOJI.find(([frag])=>String(k).includes(frag));return f?f[1]:'▫️';}

const SVC_SVG={
  contract:'<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 28H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.5"/><path d="M10 9.5h8M10 14h6M10 18.5h3.5"/><path d="M23 15.5l5.5 2v4.3c0 3-2.2 5.200-5.500 6.400-3.300-1.200-5.500-3.400-5.500-6.400v-4.300z"/><path d="M23 19.700v4.600M20.700 22h4.600"/></svg>',
  events:'<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="24" height="22" rx="3"/><path d="M4 12h24M10 3.500v5M22 3.500v5M16 3.500v5"/><circle cx="16" cy="20" r="5"/><path d="M16 17.600v4.800M13.600 20h4.800"/></svg>',
  projects:'<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.500 28h27"/><path d="M4.500 28V15.500l6.500 4v-4l6.500 4V7h7v21"/><path d="M21 11.500v5M18.500 14h5"/><path d="M8.500 23.500h2M13.500 23.500h2M20 28v-5h2.500v5"/></svg>',
  training:'<svg width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 5 3 11l13 6 13-6z"/><path d="M8 13.400V19c0 1.800 3.600 3.500 8 3.500s8-1.700 8-3.500v-5.600"/><path d="M29 11v6.500"/><path d="M6 27.500h5l1.500-2.500 2.500 4.500 2-3.500 1 1.500h8"/></svg>'
};

function renderDueStrip(){
  const el=document.getElementById('dueStrip');if(!el)return;
  let over=0,today=0,week=0;
  orders.forEach(o=>{const k=dueInfo(o).key;if(k==='overdue')over++;else if(k==='today')today++;else if(k==='week')week++;});
  if(!over&&!today&&!week){el.style.display='none';el.innerHTML='';return;}
  const parts=[];
  if(over)parts.push(`<button class="ds-item due-over" onclick="filterByDue('overdue')">🔴 ${over} متأخرة</button>`);
  if(today)parts.push(`<button class="ds-item due-today" onclick="filterByDue('today')">🟠 ${today} تستحق اليوم</button>`);
  if(week)parts.push(`<button class="ds-item due-soon" onclick="filterByDue('week')">🟡 ${week} خلال 7 أيام</button>`);
  el.innerHTML='<span class="ds-title">⏰ مواعيد تسليم التسعيرات</span>'+parts.join('')+`<button class="ds-item ds-all" onclick="filterByDue('')">عرض الكل</button>`;
  el.style.display='flex';
}
function renderOrders(){
  const search=(document.getElementById('searchInput').value||'').toLowerCase();
  const svcFilter=document.getElementById('filterSvc').value;
  const dueSel=document.getElementById('filterDue');const dueFilter=dueSel?dueSel.value:'';
  let filtered=orders.filter(o=>{
    const m=(o.clientName||'').toLowerCase().includes(search)||(o.addedBy||'').toLowerCase().includes(search)||(o.lzmCode||'').toLowerCase().includes(search)||(o.clientCode||'').toLowerCase().includes(search)||(o.code||'').includes(search);
    const dk=dueInfo(o).key;
    const dueOk=!dueFilter||(dueFilter==='week'?(dk==='week'||dk==='today'):dk===dueFilter);
    return m&&(!svcFilter||o.svc===svcFilter)&&dueOk;
  });
  renderDueStrip();
  const list=document.getElementById('ordersList');

  if(!filtered.length){
    list.innerHTML=`<div class="empty-state"><p>${orders.length?'لا توجد نتائج مطابقة':'لا يوجد طلبات بعد — اضغط طلب جديد للبدء'}</p></div>`;
    return;
  }
  list.innerHTML=filtered.map(o=>{
    const date=fmtDate(orderDate(o));const di=dueInfo(o);
    const lv=o.details&&(o.details['مستوى التجهيز']||o.details['مستوى الخدمة']);const level=lv?` · ${lv.split(' — ')[0]}`:'';
    return `<div class="order-card" onclick="openOrder('${o.id}')">
      <div class="order-card-top">
        <div class="order-svc-icon ${o.svc}">${SVC_SVG[o.svc]||''}</div>
        <span class="status-badge">${o._pending?'⏳ محلي':'🆕 جديد'}</span>
      </div>
      <div class="order-name">${esc(o.clientName)}</div>
      <div class="order-svc-lbl">${svcFull(o)}${level}</div>
      ${di.key!=='none'?`<div class="due-chip ${di.cls}"><span>${di.emoji} ${di.label}</span><span class="due-date">📅 ${fmtDate(o.quoteDue)}</span></div>`:''}
      <div class="order-card-footer">
        <span class="order-who">تم بواسطة: ${esc(o.addedBy||'—')}</span>
        <span class="order-num">${o.lzmCode||'#'+(o.code||'')} · ${date}</span>
      </div>
    </div>`;
  }).join('');
}

// ═══════════ ORDER DETAIL ═══════════
function openOrder(id){
  const o=findOrder(id);if(!o)return;
  openOrderId=o.id;
  disarmDelete();
  const svcColors={contract:'rgba(94,203,216,.12)',events:'rgba(251,191,36,.1)',projects:'rgba(42,138,159,.12)',training:'rgba(52,211,153,.1)'};
  const icon=document.getElementById('dIcon');
  icon.innerHTML=SVC_SVG[o.svc]||'';icon.style.background=svcColors[o.svc];
  document.getElementById('dName').textContent=o.clientName;
  const _cd=_toDate(orderDate(o));const date=_cd?fmtDate(_cd,{day:'numeric',month:'long',year:'numeric'})+' — '+fmtTime(_cd):'—';
  document.getElementById('dMeta').textContent=`${o.lzmCode||'#'+(o.code||'')} · ${date}`;
  const dBy=document.getElementById('dBy');
  if(dBy)dBy.textContent=`✍️ تم الطلب بواسطة: ${o.addedBy||'—'}`;
  const di=dueInfo(o);
  const rows=[['🏷️','كود المشروع',o.lzmCode||''],['🔢','رقم الطلب',`#${o.code||''}`],['👤','اسم العميل',o.clientName],['🩺','الخدمة',svcName(o)],
    ...detailEntries(o).map(([k,vv])=>[keyEmoji(k),k,prettyVal(vv)]),
    ['📝','ملاحظات',o.notes||''],
    ['📅','تاريخ تسليم التسعيرة',o.quoteDue?fmtDateLong(o.quoteDue):''],
    ['⏰','حالة التسعيرة',di.key!=='none'?di.emoji+' '+di.label:'']
  ].filter(r=>r[2]&&r[2]!=='—'&&r[2]!=='');
  document.getElementById('dRows').innerHTML=rows.map(([e,l,vv])=>`<div class="detail-row"><span class="dr-label"><span class="dr-emo">${e}</span>${esc(l)}</span><span class="dr-val">${esc(vv)}</span></div>`).join('');
  const qb=document.getElementById('btnQuoteDone');
  if(qb){qb.style.display=o.quoteDue?'':'none';qb.textContent=o.quoteDone?'↩️ إلغاء التسليم':'✅ تم تسليم التسعيرة';}
  document.getElementById('detailOverlay').classList.add('show');
}
function closeDetail(){document.getElementById('detailOverlay').classList.remove('show');openOrderId=null;disarmDelete();}



// ═══════════ EDIT ORDER — يفتح نموذج الطلب الأصلي معبأً ═══════════
let editOrderId=null;
const SVC_BTN_INDEX={contract:0,events:1,projects:2,training:3};

function captureFormState(svc){
  const fs={inputs:{},checks:{},choices:{},multis:{},levels:{...LEVELS}};
  ['f-client-name','f-client-code','f-client-notes'].forEach(id=>{
    const el=document.getElementById(id);if(el)fs.inputs[id]=el.value;
  });
  const sec=document.getElementById('sec-'+svc);
  if(sec){
    sec.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{
      if(el.type==='checkbox')fs.checks[el.id]=el.checked;
      else fs.inputs[el.id]=el.value;
    });
    sec.querySelectorAll('.ch[id]').forEach(g=>{
      const sel=getSelected(g.id);
      if(sel)fs.choices[g.id]=sel;
    });
    ['e-svctype-wrap','p-svctype-wrap','tr-lang-wrap'].forEach(wid=>{
      const w=document.getElementById(wid);
      if(w&&sec.contains(w)){
        fs.multis[wid]=[...w.querySelectorAll('.cb.multi.sel')].map(b=>b.textContent.trim());
      }
    });
    // أزرار المدن (متعددة الاختيار)
    fs.cities={};
    sec.querySelectorAll('.cities-wrap[id]').forEach(cw=>{
      fs.cities[cw.id]=[...cw.querySelectorAll('.city-cb.sel')].map(b=>b.textContent.trim());
      const oi=document.getElementById(cw.id+'-other');
      if(oi&&oi.value.trim())fs.inputs[cw.id+'-other']=oi.value;
    });
    // حاويات شرطية ظاهرة (مثل مدن الدورات)
    fs.shown=[...sec.querySelectorAll('[id$="-wrap"]')].filter(x=>x.style.display==='block').map(x=>x.id);
  }
  return fs;
}

function restoreFormState(svc,fs){
  if(!fs)return;
  _restoringForm=true;
  Object.entries(fs.inputs||{}).forEach(([id,val])=>{
    const el=document.getElementById(id);
    if(el){el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  Object.entries(fs.checks||{}).forEach(([id,ck])=>{
    const el=document.getElementById(id);
    if(el){el.checked=ck;el.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  Object.entries(fs.choices||{}).forEach(([gid,txt])=>{
    const g=document.getElementById(gid);if(!g)return;
    const btn=[...g.querySelectorAll('.cb')].find(b=>b.textContent.trim()===txt);
    if(btn)btn.click();
  });
  Object.entries(fs.multis||{}).forEach(([wid,arr])=>{
    const w=document.getElementById(wid);if(!w)return;
    (arr||[]).forEach(txt=>{
      const btn=[...w.querySelectorAll('.cb.multi')].find(b=>b.textContent.trim()===txt&&!b.classList.contains('sel'));
      if(btn)btn.click();
    });
  });
  Object.entries(fs.levels||{}).forEach(([prefix,val])=>{
    const btn=document.getElementById(prefix+'-lc-'+String(val).replace('+','p'));
    if(btn)btn.click();
  });
  // إظهار الحاويات الشرطية أولاً ثم استعادة المدن بداخلها
  (fs.shown||[]).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='block';});
  syncEventSvcCounts();
  Object.entries(fs.cities||{}).forEach(([cwId,arr])=>{
    const cw=document.getElementById(cwId);if(!cw)return;
    (arr||[]).forEach(txt=>{
      const btn=[...cw.querySelectorAll('.city-cb')].find(b=>b.textContent.trim()===txt&&!b.classList.contains('sel'));
      if(btn)btn.click();
    });
    const oi=document.getElementById(cwId+'-other');
    if(oi&&(fs.inputs||{})[cwId+'-other']){oi.value=fs.inputs[cwId+'-other'];oi.style.display='block';}
  });
  updateCodePreview();
  chkTrainees();
}


// استعادة الخيارات من تفاصيل الطلب (للطلبات المحفوظة قبل ميزة لقطة النموذج)
const DETAIL_TO_INPUT={
  contract:{'اسم الجهة':'c-company'},
  events:{'سيارات الإسعاف':'e-amb-count','أطباء الإسعاف':'e-amb-doctors','مسعفو الإسعاف':'e-amb-paramedics','سائقو الإسعاف':'e-amb-drivers','عدد العيادات':'e-clinic-count','أطباء العيادة':'e-clinic-doctors','ممرضو العيادة':'e-clinic-nurses','مسعفو العيادة':'e-clinic-paramedics','عدد الفرق الراجلة':'e-walk-count','مسعفو الفرق الراجلة':'e-walk-paramedics','عدد عربات القولف':'e-golf-count','مسعفو عربات القولف':'e-golf-paramedics','سائقو عربات القولف':'e-golf-drivers','أطباء':'e-clinic-doctors','مسعفون':'e-amb-paramedics','ممرضون':'e-clinic-nurses','سائقون':'e-amb-drivers','عدد الحضور':'e-attendees','ساعات يومياً':'e-hours','تاريخ البداية':'e-start','الموقع':'e-loc'},
  projects:{'عدد العاملين في المشروع':'p-workers','ساعات العمل اليومية':'p-hours','أيام الأسبوع':'p-dweek','تاريخ البداية':'p-start','سيارات الإسعاف':'p-amb-count','أطباء الإسعاف':'p-amb-doctors','مسعفو الإسعاف':'p-amb-paramedics','سائقو الإسعاف':'p-amb-drivers','عدد العيادات':'p-clinic-count','أطباء العيادة':'p-clinic-doctors','ممرضو العيادة':'p-clinic-nurses','مسعفو العيادة':'p-clinic-paramedics','عدد الفرق الراجلة':'p-walk-count','مسعفو الفرق الراجلة':'p-walk-paramedics','عدد عربات القولف':'p-golf-count','مسعفو عربات القولف':'p-golf-paramedics','سائقو عربات القولف':'p-golf-drivers','أطباء':'p-clinic-doctors','مسعفون':'p-amb-paramedics','ممرضون':'p-clinic-nurses','سائقون':'p-amb-drivers'},
  training:{'عدد المتدربين':'tr-count','اسم الجهة':'tr-company'}
};
function restoreFromDetails(svc,details){
  const sec=document.getElementById('sec-'+svc);if(!sec)return;
  _restoringForm=true;
  // الحقول النصية والرقمية
  const map=DETAIL_TO_INPUT[svc]||{};
  Object.entries(map).forEach(([key,id])=>{
    const el=document.getElementById(id);
    if(el&&details[key]){el.value=details[key];el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
  });
  // أزرار الاختيار: نطابق نص الزر مع أي قيمة موجودة بالتفاصيل
  const vals=Object.values(details).map(x=>String(x));
  sec.querySelectorAll('.ch[id] .cb').forEach(btn=>{
    const t=btn.textContent.trim();
    if(vals.some(v=>v===t||v.startsWith(t+' —')))btn.click();
  });
  // اللغات المتعددة (الدورات)
  if(svc==='training'&&details['اللغة']){
    String(details['اللغة']).split('،').map(s=>s.trim()).filter(Boolean).forEach(lang=>{
      const b=[...document.querySelectorAll('#tr-lang .cb.multi')].find(x=>x.textContent.trim()===lang&&!x.classList.contains('sel'));
      if(b)b.click();
    });
  }
  // الخدمات المتعددة
  const svcTypes=String(details['نوع الخدمة']||'').split('،').map(s=>s.trim()).filter(Boolean);
  sec.querySelectorAll('.cb.multi').forEach(btn=>{
    if(svcTypes.includes(btn.textContent.trim())&&!btn.classList.contains('sel'))btn.click();
  });
  syncEventSvcCounts();
  // المدة الزمنية: تفكيك النص لرقم ووحدة (الفعاليات والمشاريع)
  if(svc==='projects'||svc==='events'){
    const dpx=svc==='projects'?'p':'e';
    const raw=details['المدة الزمنية']||details['عدد الأيام']||'';
    if(raw){
      const m=String(raw).match(/(\d+)\s*(.*)/);
      if(m){
        const numEl=document.getElementById(dpx+'-dur-num');if(numEl)numEl.value=m[1];
        const txt=m[2]||'';
        const unit=(txt.includes('شهر')||txt.includes('أشهر'))?'أشهر':'أيام';
        const b=[...document.querySelectorAll('#'+dpx+'-dur-unit .cb')].find(x=>x.textContent.trim()===unit);
        if(b)b.click();
      }
    }
  }
  // نوع الفعالية: لو قيمة غير مدرجة فهي "أخرى" بنص حر
  if(svc==='events'&&details['نوع الفعالية']){
    const val=String(details['نوع الفعالية']).trim();
    const btns=[...document.querySelectorAll('#e-evtype .cb')];
    const exact=btns.find(b=>b.textContent.trim()===val);
    if(exact){exact.click();}
    else{
      const other=btns.find(b=>b.textContent.trim()==='أخرى');
      if(other){other.click();const inp=document.getElementById('e-evtype-other');if(inp){inp.style.display='block';inp.value=val;}}
    }
  }
  const _px=(svc==='projects')?'p':'e';
  [['سيارات الإسعاف','-amb-count'],['أطباء الإسعاف','-amb-doctors'],['مسعفو الإسعاف','-amb-paramedics'],['سائقو الإسعاف','-amb-drivers'],['عدد العيادات','-clinic-count'],['أطباء العيادة','-clinic-doctors'],['ممرضو العيادة','-clinic-nurses'],['مسعفو العيادة','-clinic-paramedics'],['عدد الفرق الراجلة','-walk-count'],['مسعفو الفرق الراجلة','-walk-paramedics'],['عدد عربات القولف','-golf-count'],['مسعفو عربات القولف','-golf-paramedics'],['سائقو عربات القولف','-golf-drivers'],['أطباء','-clinic-doctors'],['مسعفون','-amb-paramedics'],['ممرضون','-clinic-nurses'],['سائقون','-amb-drivers']].map(([k,s])=>[k,_px+s]).forEach(([k,id])=>{
    const el=document.getElementById(id);if(el&&details[k])el.value=details[k];
  });
  _restoringForm=false;
  // مستوى التجهيز
  const lvlRaw=String(details['مستوى التجهيز']||'');
  const lvl=lvlRaw.split(' — ')[0].trim();
  const prefix={events:'ev',projects:'pr',contract:'ct'}[svc];
  if(prefix&&lvl){const b=document.getElementById(prefix+'-lc-'+lvl.replace('+','p'));if(b)b.click();}
  // مدينة خارج الرياض بالدورات
  if(svc==='training'){
    const loc=String(details['مكان الدورة']||'');
    if(loc.includes('—')){
      const citiesStr=loc.split('—')[1].trim();
      const wrap=document.getElementById('tr-city-wrap');if(wrap)wrap.style.display='block';
      const list=citiesStr.split('،').map(s=>s.trim()).filter(Boolean);
      const known=[...document.querySelectorAll('#tr-cities .city-cb')].map(b=>b.textContent.trim());
      list.forEach(c=>{
        const btn=[...document.querySelectorAll('#tr-cities .city-cb')].find(b=>b.textContent.trim()===c);
        if(btn&&!btn.classList.contains('sel'))btn.click();
        else if(!known.includes(c)){
          const other=[...document.querySelectorAll('#tr-cities .city-cb')].find(b=>b.textContent.trim()==='أخرى');
          if(other&&!other.classList.contains('sel'))other.click();
          const inp=document.getElementById('tr-cities-other');if(inp)inp.value=c;
        }
      });
    }
    const courses=String(details['الدورات المطلوبة']||'');
    [['crs-aware','توعية'],['crs-fa','الإسعافات الأولية (7'],['crs-fire','الحرائق'],['crs-ohs','الصحة والسلامة']].forEach(([id,frag])=>{
      const el=document.getElementById(id);
      if(el){el.checked=courses.includes(frag);el.dispatchEvent(new Event('change',{bubbles:true}));}
    });
  }
  updateCodePreview();
}

function startEditOrder(){
  if(!openOrderId)return;
  const o=findOrder(openOrderId);if(!o){closeDetail();showToast('تعذّر فتح الطلب للتعديل');return;}
  closeDetail();
  editOrderId=o.id;
  showPage('form');
  const btn=document.querySelectorAll('.svc-btn')[SVC_BTN_INDEX[o.svc]??0];
  pickSvc(o.svc,btn);
  // تعبئة الحقول الأساسية دائماً
  const nm=document.getElementById('f-client-name');if(nm)nm.value=o.clientName||'';
  // رمز العميل: من الطلب، وإلا نستنتجه من كود LZM (الجزء الرابع) للطلبات القديمة
  let ccVal=o.clientCode||'';
  if(!ccVal&&o.lzmCode){const parts=String(o.lzmCode).split('-');if(parts.length>=4)ccVal=parts[3];}
  const cc=document.getElementById('f-client-code');if(cc)cc.value=ccVal;
  const nt=document.getElementById('f-client-notes');if(nt)nt.value=o.notes||'';
  const qd=document.getElementById('f-quote-due');if(qd){qd.value=o.quoteDue||'';updateQuoteDueHint();}
  // استعادة كل الخيارات إن كانت محفوظة
  if(o.formState)restoreFormState(o.svc,o.formState);
  else restoreFromDetails(o.svc,o.details||{});
  updateCodePreview();
  // تغيير نص زر الحفظ
  const sb=document.querySelector('.submit-btn');
  if(sb)sb.textContent='💾 حفظ التعديلات على الطلب #'+(o.code||'');
  showToast('وضع التعديل — عدّل الخيارات ثم احفظ');
}

function exitEditState(){
  editOrderId=null;
  const sb=document.querySelector('.submit-btn');
  if(sb)sb.textContent='حفظ الطلب في السجل';
}

// الحذف بخطوتين داخل الصفحة (بدون نافذة المتصفح) وفوري بدون انتظار السحابة
let _delArm=null,_delT=null;
function disarmDelete(){
  _delArm=null;clearTimeout(_delT);
  const b=document.querySelector('.modal-ftr .btn-del');
  if(b){b.textContent='حذف';b.classList.remove('armed');}
}
function deleteOrder(){
  const o=findOrder(openOrderId);
  if(!o){closeDetail();return;}
  const btn=document.querySelector('.modal-ftr .btn-del');
  const armKey=o.localRef||o.id; // ثابت حتى لو تغيّر رقم الطلب بالمزامنة بين الضغطتين
  if(_delArm!==armKey){
    _delArm=armKey;clearTimeout(_delT);
    if(btn){btn.textContent='تأكيد الحذف؟';btn.classList.add('armed');}
    _delT=setTimeout(disarmDelete,4000);
    return;
  }
  disarmDelete();
  [o.id,o.localRef].filter(Boolean).forEach(id=>{if(!deletedIds.includes(id))deletedIds.push(id);});
  persistDeleted();
  pendingOrders=pendingOrders.filter(p=>p.id!==o.id&&p.id!==o.localRef);
  persistPending();
  mergeOrders();
  closeDetail();
  if(editOrderId&&(editOrderId===o.id||editOrderId===o.localRef))exitEditState();
  renderDashboard();
  showToast('تم حذف الطلب');
}

function buildOrderText(o){
  // النص النهائي للطلب بدون أي إيموجي — الإيموجي داخل الموقع فقط
  const brand=(o.svc==='training')?'لازم للتدريب — Lazem Training':'لازم للخدمات الطبية — Lazem Medical Services';
  const L='━━━━━━━━━━━━━━━━\n';
  let txt=`${brand}\n`+L;
  txt+=`كود المشروع: ${o.lzmCode||''}\nرقم الطلب: #${o.code||''}\nالعميل: ${o.clientName}\n`;
  txt+=`الخدمة: ${svcName(o)}\nتم الطلب بواسطة: ${o.addedBy||'—'}\n`+L;
  detailEntries(o).forEach(([k,vv])=>{if(vv)txt+=`${k}: ${prettyVal(vv)}\n`;});
  if(o.notes)txt+=`ملاحظات: ${o.notes}\n`;
  if(o.quoteDue){
    txt+=L+`تاريخ تسليم التسعيرة: ${fmtDateLong(o.quoteDue)}\n`;
    if(o.quoteDone)txt+=`تم تسليم التسعيرة\n`;
  }
  txt+=L;
  return stripEmoji(txt);
}
function stripEmoji(t){
  return String(t).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{23E9}-\u{23FF}]/gu,'').replace(/[ \t]{2,}/g,' ').replace(/^ +/gm,'');
}
function copyText(txt){
  // النسخ يعمل حتى لو المتصفح لا يدعم clipboard (رابط http أو ملف محلي)
  const fallback=()=>{
    try{
      const ta=document.createElement('textarea');ta.value=txt;ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;top:-1000px;opacity:0;';document.body.appendChild(ta);ta.select();
      const ok=document.execCommand&&document.execCommand('copy');ta.remove();return !!ok;
    }catch(e){return false;}
  };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText)
      return navigator.clipboard.writeText(txt).then(()=>true).catch(()=>fallback());
  }catch(e){}
  return Promise.resolve(fallback());
}
function copyOrder(){const o=findOrder(openOrderId);if(!o)return;copyText(buildOrderText(o)).then(ok=>showToast(ok?'تم النسخ!':'تعذّر النسخ'));}
function shareOrder(){const o=findOrder(openOrderId);if(!o)return;const txt=buildOrderText(o);try{if(navigator.share){navigator.share({title:`طلب #${o.code||''}`,text:txt}).catch(()=>{});return;}}catch(e){}window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');}

// ═══ تصدير Excel/CSV ═══
function buildCSV(){
  const base=['رقم الطلب','كود المشروع','رمز العميل','اسم العميل','الخدمة','تاريخ الطلب','تاريخ تسليم التسعيرة','حالة التسعيرة','تم بواسطة','ملاحظات'];
  const detailKeys=[...new Set(orders.flatMap(o=>Object.keys(o.details||{})))];
  const rows=[[...base,...detailKeys]];
  orders.forEach(o=>{
    rows.push([
      o.code||'', o.lzmCode||'', o.clientCode||'', o.clientName||'',
      svcName(o), fmtDate(orderDate(o)),
      o.quoteDue?fmtDate(o.quoteDue):'', dueInfo(o).label,
      o.addedBy||'', o.notes||'',
      ...detailKeys.map(k=>prettyVal((o.details&&o.details[k])||''))
    ]);
  });
  return '\ufeff'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function exportCSV(){
  if(!orders.length){showToast('لا توجد طلبات للتصدير');return;}
  const blob=new Blob([buildCSV()],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='lazem-orders-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  showToast('تم تصدير '+orders.length+' طلب');
}
/* ══ تصدير Excel حقيقي (.xlsx) بنفس تنسيق ملف الـ CRM ══ */
const CRM_HEAD=['company name ','servise ','lead sorce ','clint name ','clint contact ','Expected Revenue','states ','date ','account manger '];
const CRM_WIDTHS=[28.6,19.1,18,18.6,35.6,29.7,18,10.6,15.9];
const CRM_SVC={contract:'ambulance transport',events:'medical coverge',projects:'project coverage',training:'training'};
const EN_MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
function crmRows(){
  return orders.map(o=>{
    const d=_toDate(orderDate(o));
    // الأعمدة الفارغة (lead source / client name / contact / revenue) تُعبأ يدوياً بعد التصدير
    let svc=CRM_SVC[o.svc]||'';
    if(o.svc==='training'){
      const x=trainingParts(o),parts=[];
      if(x.course||(!x.aed&&!x.kit))parts.push('training');
      if(x.aed)parts.push('AED');
      if(x.kit)parts.push('first aid kits');
      svc=parts.join(' + ');
    }
    return [o.clientName||'',svc,'','','','',o.quoteDone?'quotation sent':'under review',d?EN_MONTHS[d.getMonth()]:'',o.addedBy||''];
  });
}
const _xe=t=>String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _col=i=>String.fromCharCode(65+i);
function buildXlsxParts(rows){
  const n=rows.length+1,last='I'+n;
  const cell=(r,c,v,s)=>{
    const ref=_col(c)+r;
    if(v===''||v==null)return `<c r="${ref}" s="${s}"/>`;
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${_xe(v)}</t></is></c>`;
  };
  let sd=`<row r="1">${CRM_HEAD.map((h,c)=>cell(1,c,h,1)).join('')}</row>`;
  rows.forEach((row,i)=>{const r=i+2;sd+=`<row r="${r}">${row.map((v,c)=>cell(r,c,v,c===5?3:2)).join('')}</row>`;});
  const X='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return {
    '[Content_Types].xml':X+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':X+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Sheet1!$A$1:$I$${n}</definedName></definedNames></workbook>`,
    'xl/_rels/workbook.xml.rels':X+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':X+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos Narrow"/><family val="2"/></font><font><b/><sz val="11"/><name val="Aptos Narrow"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFA5A5A5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="double"><color rgb="FF3F3F3F"/></left><right style="double"><color rgb="FF3F3F3F"/></right><top style="double"><color rgb="FF3F3F3F"/></top><bottom style="double"><color rgb="FF3F3F3F"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml':X+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${CRM_WIDTHS.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sd}</sheetData><autoFilter ref="A1:${last}"/></worksheet>`
  };
}
let _crcT=null;
function _crc32(u8){
  if(!_crcT){_crcT=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;_crcT[i]=c>>>0;}}
  let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=_crcT[(c^u8[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;
}
function zipStore(parts){
  const enc=new TextEncoder(),chunks=[],central=[];let off=0;
  const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  Object.entries(parts).forEach(([name,text])=>{
    const nm=enc.encode(name),data=enc.encode(text),crc=_crc32(data);
    const common=[...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(nm.length),...u16(0)];
    const lh=new Uint8Array([0x50,0x4B,3,4,...common]);
    chunks.push(lh,nm,data);
    central.push(new Uint8Array([0x50,0x4B,1,2,...u16(20),...common,...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nm);
    off+=lh.length+nm.length+data.length;
  });
  const cs=central.reduce((a,c)=>a+c.length,0),cnt=Object.keys(parts).length;
  const end=new Uint8Array([0x50,0x4B,5,6,...u16(0),...u16(0),...u16(cnt),...u16(cnt),...u32(cs),...u32(off),...u16(0)]);
  return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function exportExcel(){
  if(!orders.length){showToast('لا توجد طلبات للتصدير');return;}
  const blob=zipStore(buildXlsxParts(crmRows()));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='CRM_Lazem_'+isoDay(new Date())+'.xlsx';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  showToast('تم تصدير '+orders.length+' طلب');
}
// عدّاد متحرك لأرقام الإحصائيات
function countTo(id,target){
  const el=document.getElementById(id);if(!el)return;
  const from=parseInt(el.textContent)||0;
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(from===target||reduce||typeof requestAnimationFrame!=='function'||document.hidden){el.textContent=target;return;}
  el._cnt=(el._cnt||0)+1;const my=el._cnt,t0=performance.now(),dur=650;
  const step=t=>{
    if(el._cnt!==my)return;
    const k=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-k,3);
    el.textContent=Math.round(from+(target-from)*e);
    if(k<1)requestAnimationFrame(step);else el.textContent=target;
  };
  requestAnimationFrame(step);
}
// خانة رمز العميل: لو الكيبورد عربي نحوّل كل حرف إلى الحرف الإنجليزي على نفس الزر (ض=Q ، ش=A ...)
const AR_KEYS={'ض':'q','ص':'w','ث':'e','ق':'r','ف':'t','غ':'y','ع':'u','ه':'i','خ':'o','ح':'p','ش':'a','س':'s','ي':'d','ب':'f','ل':'g','ا':'h','ت':'j','ن':'k','م':'l','ئ':'z','ء':'x','ؤ':'c','ر':'v','ى':'n','ة':'m','أ':'h','إ':'y','آ':'n','ـ':'j','ذ':'','ج':'','د':'','ك':'','ط':'','ز':'','و':'','ظ':''};
function arToLatinKeys(val,e){
  // زر B في الكيبورد العربي يكتب "لا" دفعة واحدة
  if(e&&(e.data==='لا'||e.data==='لآ'))val=val.replace(e.data,'b');
  let out='';
  for(const ch of String(val))out+=(ch in AR_KEYS)?AR_KEYS[ch]:ch;
  return out.replace(/[^a-zA-Z]/g,'').toUpperCase().slice(0,3);
}
function showToast(msg){
  let m=String(msg);
  if(!/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(m)){
    if(/^(أدخل|اختر|حدّد|اكتب|لا توجد|تعذّر|لتثبيت)/.test(m)||m.includes('تعذرت'))m='⚠️ '+m;
    else if(/حذف/.test(m))m='🗑️ '+m;
    else if(/نسخ/.test(m))m='📋 '+m;
    else if(/تصدير/.test(m))m='📊 '+m;
    else if(/وضع التعديل/.test(m))m='✏️ '+m;
    else m='✅ '+m;
  }
  const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');
  clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove('show'),2800);
}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){const ov=document.getElementById('detailOverlay');if(ov&&ov.classList.contains('show'))closeDetail();}
});
const _dov=document.getElementById('detailOverlay');
if(_dov)_dov.addEventListener('click',function(e){if(e.target===this)closeDetail();});
['crs-aware','crs-fa','crs-fire','crs-ohs'].forEach(id=>{
  const el=document.getElementById(id);
  if(el){el.addEventListener('change',updateCodePreview);el.addEventListener('change',chkTrainees);}
});
['e-start','p-start'].forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener('change',updateCodePreview);
});

// تفعيل فيديو صفحة الدخول فور تحميل السكربت
setBgVideo('login');
