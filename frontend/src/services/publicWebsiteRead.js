import api from './api';
// Only public website payloads; never cache patient data, authentication, or appointments.
const allowed=new Set(['/public/marketing-pages/partners','/public/marketing-pages/itsco/website-data']);
const memory=new Map(),pending=new Map(),ttl=60000;
export function getCachedPublicWebsite(url) {
 if(!allowed.has(url))throw new Error('Unsupported public website cache key');
 const key='public-website-v1:'+url;
 let cached=memory.get(key);
 if(!cached)try{cached=JSON.parse(sessionStorage.getItem(key)||'null');}catch{/* Storage may be disabled. */}
 return cached&&Date.now()-cached.at<ttl?cached.data:null;
}
export function readPublicWebsite(url,{force=false}={}) {
 if(!allowed.has(url))throw new Error('Unsupported public website cache key');
 const key='public-website-v1:'+url;
 const cached=getCachedPublicWebsite(url);
 if(!force&&cached)return Promise.resolve({data:cached});
 if(pending.has(key))return pending.get(key);
 const promise=api.get(url,{skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000}).then(response=>{
  const entry={at:Date.now(),data:response.data};memory.set(key,entry);try{sessionStorage.setItem(key,JSON.stringify(entry));}catch{/* Storage may be full. */}return response;
 }).finally(()=>pending.delete(key));
 pending.set(key,promise);return promise;
}
