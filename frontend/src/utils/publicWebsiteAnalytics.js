// Only public marketing DOM is observed. Form/search values and destination queries are never recorded.
export const ANALYTICS_ROOTS='.audience-site,.nlu-site,.itsco-site,.tisi-site,.rise-site,.mh-site,.ptco-site,.range-site,.pmh-page,.pmh-sub,.pmh-sub-page';
const EXCLUDED='[data-analytics-ignore], [translate="no"], .public-profile-editor, .pmh-admin-pill, .public-website-analytics';
const compact=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,100);
const slug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9_.:-]+/g,'-').slice(0,65)||'area';
const hash=s=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return(n>>>0).toString(36);};
export function anonymousWebsiteVisitor(storage,crypto,now=Date.now()) {
  try {const stored=JSON.parse(storage.getItem('publicWebsiteVisitor')||'null');if(/^[a-f0-9-]{36}$/i.test(stored?.id||'')&&stored.expires>now)return stored.id;}catch{/* Private browsing may block storage. */}
  const id=crypto.randomUUID();try{storage.setItem('publicWebsiteVisitor',JSON.stringify({id,expires:now+30*86400000}));}catch{/* This visit can still be counted without a persistent identifier. */}return id;
}
export function websiteSource(referrer,origin){
  if(!referrer)return'direct';try{const u=new URL(referrer);if(u.origin===origin)return'internal';if(/(^|\.)(google|bing|duckduckgo|yahoo)\./i.test(u.hostname))return'search';if(/(^|\.)(facebook|instagram|linkedin|tiktok|x|twitter)\./i.test(u.hostname))return'social';return'referral';}catch{return'direct';}
}
export function analyticsCsv(rows) {
  const cell=value=>{let s=String(value??'');if(/^\s*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return [['Page','Area','Event','Count','Anonymous browsers','Visible active seconds','Average active seconds per browser','Last seen'],...rows.map(r=>[r.pagePath,r.label,r.kind,r.count,r.visitors,Math.round(Number(r.durationMs||0)/1000),Math.round(Number(r.durationMs||0)/Math.max(1,Number(r.visitors||0))/1000),r.lastSeen])].map(row=>row.map(cell).join(',')).join('\r\n');
}
export function createWebsiteTracker({document,window,pagePath,canTrack,emit,onTargets=()=>{},rootSelector=ANALYTICS_ROOTS,resolveMetadata,trackDwell=false,isFrameVisible=()=>true,isContentReady=root=>Boolean(root.querySelector('h1'))}) {
  let root=null,disposed=false,ready=false,scanTimer=null;const metadata=new WeakMap(),targets=new Map(),viewed=new Set(),timers=new Map();
  const context={pagePath,source:websiteSource(document.referrer,window.location.origin)};
  function send(kind,meta,durationMs){if(disposed||!canTrack())return;emit({...context,eventId:window.crypto.randomUUID(),kind,targetKey:meta.key,label:meta.label,device:window.innerWidth<600?'mobile':window.innerWidth<1024?'tablet':'desktop',language:(document.documentElement.lang||'en').split('-')[0],...(durationMs?{durationMs}: {})});}
  // Time is an estimate of visible, non-idle viewing, not a claim about attention.
  // Only eight major visible areas are timed, and page totals use page_time alone.
  const activeAreas=new Map(),pendingTime=new Map(),idleMs=60000,now=()=>window.performance.now();
  let lastActivity=now(),lastTick=lastActivity,visible=!document.hidden,focused=true;
  function sampleTime(){
    const time=now(),elapsed=Math.max(0,Math.min(time,lastActivity+idleMs)-lastTick);lastTick=time;
    if(!trackDwell||!ready||!visible||!focused||!isFrameVisible()||!canTrack()||elapsed<1)return;
    const accumulate=(kind,meta)=>{const key=kind+':'+meta.key;const previous=pendingTime.get(key);pendingTime.set(key,{kind,meta,duration:Math.min(60000,(previous?.duration||0)+elapsed)});};
    accumulate('page_time',{key:'page',label:'Page'});
    const major=[...activeAreas.values()].filter(meta=>meta.element.isConnected&&meta.element.matches('section,[data-analytics-area]'));
    for(const meta of major.slice(0,8))accumulate('section_time',meta);
  }
  function dwell(){sampleTime();const pending=[...pendingTime.values()];pendingTime.clear();for(const entry of pending.filter(e=>e.kind==='page_time'))send(entry.kind,entry.meta,Math.round(entry.duration));for(const entry of pending.filter(e=>e.kind==='section_time'&&e.duration>=1000).sort((a,b)=>b.duration-a.duration).slice(0,8))send(entry.kind,entry.meta,Math.round(entry.duration));}
  function visibility(){dwell();visible=!document.hidden;lastTick=now();if(visible)lastActivity=lastTick;}
  function blur(){dwell();focused=false;}
  function focus(){focused=true;lastActivity=lastTick=now();}
  function meaningfulText(el){const explicit=el.getAttribute('data-analytics-label');if(explicit)return compact(explicit);const heading=el.querySelector('h1,h2,h3,h4');return compact(heading?.textContent)||({HEADER:'Navigation',FOOTER:'Footer',ARTICLE:'Card',SECTION:'Section'}[el.tagName])||'Page area';}
  function describe(el,area=false){
    if(metadata.has(el))return metadata.get(el);
    if(resolveMetadata){const safe=resolveMetadata(el,area);if(!safe)return null;const meta={...safe,area,element:el};metadata.set(el,meta);targets.set(el,meta);return meta;}
    const candidate=el.parentElement?.closest('section,article,header,footer');
    const parent=candidate&&root.contains(candidate)?candidate:null;
    const parentMeta=parent&&root.contains(parent)?describe(parent,true):{key:'page',label:'Page'};
    const explicit=el.getAttribute('data-analytics-id');
    const peers=Array.from((parent||root).querySelectorAll(area?'section,article,header,footer':'a,button,summary,select,input[type="search"],form'));
    const index=Math.max(0,peers.indexOf(el));
    let identity=explicit || `${el.tagName.toLowerCase()}-${index}`;
    if(area&&!explicit){const stableClass=Array.from(el.classList).find(c=>!c.startsWith('is-')&&!/active|selected/.test(c));identity=`${el.id||stableClass||el.tagName.toLowerCase()}-${index}`;}
    let label=area?meaningfulText(el):compact(el.getAttribute('data-analytics-label')||el.getAttribute('aria-label'));
    if(!area&&!label){
      if(el.tagName==='SELECT')label=compact(Array.from(el.closest('label')?.childNodes||[]).filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '))||'Filter';
      else if(el.matches('input,form'))label='Search';
      else label=compact(el.textContent)||compact(el.querySelector('img')?.alt)||'Link';
    }
    const key=parentMeta.key+'/'+slug(identity);
    const meta={key:key.length>220?parentMeta.key.slice(0,150)+'/area-'+hash(key):key,label,area,element:el};
    metadata.set(el,meta);targets.set(el,meta);return meta;
  }
  function allowed(el){return root?.contains(el)&&!el.closest(EXCLUDED)&&!el.matches('input:not([type="search"])');}
  const intersection=new window.IntersectionObserver(entries=>{sampleTime();for(const entry of entries){const el=entry.target,meta=metadata.get(el);if(!meta)continue;const inView=entry.isIntersecting&&(entry.intersectionRatio>=.5||entry.intersectionRect.height>=window.innerHeight*.5);if(inView)activeAreas.set(el,meta);else activeAreas.delete(el);if(inView&&!viewed.has(meta.key)&&!timers.has(el)){timers.set(el,window.setTimeout(()=>{timers.delete(el);if(document.hidden||!canTrack()||!isFrameVisible())return;viewed.add(meta.key);send('section_view',meta);},1000));}else if(!inView&&timers.has(el)){window.clearTimeout(timers.get(el));timers.delete(el);}}},{threshold:[0,.1,.25,.5,.75,1]});
  function scan(){
    if(disposed)return;root=document.querySelector(rootSelector);if(!root)return;
    // Wait for actual content; loading/error wrappers are not page impressions.
    if(!isContentReady(root))return;
    if(!ready){ready=true;lastTick=lastActivity=now();send('page_view',{key:'page',label:'Page'});}
    for(const el of root.querySelectorAll('section,article,header,footer,[data-analytics-area]')){if(!allowed(el))continue;const fresh=!metadata.has(el);if(describe(el,true)&&fresh)intersection.observe(el);}
    for(const el of root.querySelectorAll('a,button,summary,select,input[type="search"]')){if(allowed(el))describe(el);}
    for(const[el]of targets)if(!el.isConnected){targets.delete(el);activeAreas.delete(el);intersection.unobserve(el);window.clearTimeout(timers.get(el));timers.delete(el);}
    onTargets([...targets.values()]);
  }
  function queueScan(){if(scanTimer||disposed)return;scanTimer=window.setTimeout(()=>{scanTimer=null;scan();},150);}
  function click(event){const el=event.target.closest?.('a,button,summary');if(!el||!allowed(el))return;const meta=describe(el);if(!meta)return;const explicit=el.getAttribute('data-analytics-kind');const href=resolveMetadata?'':el.getAttribute('href')||'';
    const kind=['document_view','document_download'].includes(explicit)?explicit:explicit==='filter_use'||el.matches('button[aria-pressed],button[aria-selected],[role=tab]')?'filter_use':explicit==='profile_open'||/[?&]provider=|\/providers?\//.test(href)?'profile_open':'click';send(kind==='profile_open'&&el.tagName==='SUMMARY'&&el.parentElement?.open?'click':kind,meta);}
  function change(event){const el=event.target;if(el.matches('select')&&allowed(el)){const meta=describe(el);if(meta)send('filter_use',meta);}}
  // Search usage, not individual keystrokes or the submitted search text.
  function search(event){const el=event.target;if(el.matches('input[type="search"]')&&allowed(el)){const meta=describe(el);if(meta)send('search',meta);}}
  const depths=new Set();function scroll(){if(!ready)return;const height=Math.max(root?.scrollHeight||0,document.documentElement.scrollHeight);const depth=Math.min(100,Math.round((window.scrollY+window.innerHeight)/height*100));for(const mark of [25,50,75,100])if(depth>=mark&&!depths.has(mark)){depths.add(mark);send('scroll_depth',{key:`page/scroll-${mark}`,label:`Reached ${mark}% of page`});}}
  document.addEventListener('click',click,true);document.addEventListener('change',change,true);document.addEventListener('change',search,true);window.addEventListener('scroll',scroll,{passive:true});
  const activityEvents=['pointerdown','pointermove','keydown','touchstart','scroll'];
  // Avoid an analytics event for every mouse movement: only the 15-second heartbeat emits time.
  const active=()=>{sampleTime();lastActivity=now();};
  if(trackDwell){for(const type of activityEvents)document.addEventListener(type,active,{passive:true,capture:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('focus',focus);window.addEventListener('pagehide',dwell);}
  const dwellTimer=trackDwell?window.setInterval(dwell,15000):null;
  const mutation=new window.MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.public-website-analytics')))queueScan();});mutation.observe(document.body,{childList:true,subtree:true});scan();
  return {flush:dwell,refresh:queueScan,stop(){dwell();disposed=true;mutation.disconnect();intersection.disconnect();window.clearTimeout(scanTimer);window.clearInterval(dwellTimer);for(const timer of timers.values())window.clearTimeout(timer);document.removeEventListener('click',click,true);document.removeEventListener('change',change,true);document.removeEventListener('change',search,true);window.removeEventListener('scroll',scroll);for(const type of activityEvents)document.removeEventListener(type,active,true);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',dwell);onTargets([]);}};
}
