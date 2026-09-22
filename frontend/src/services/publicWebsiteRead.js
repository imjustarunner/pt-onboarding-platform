import api from './api';
// Only public website payloads; never cache patient data, authentication, or appointments.
const allowed=new Set(['/public/marketing-pages/partners','/public/marketing-pages/itsco/website-data']);
const memory=new Map(),pending=new Map(),versions=new Map(),ttl=60000;
export function getCachedPublicWebsite(url) {
 if(!allowed.has(url))throw new Error('Unsupported public website cache key');
 const key='public-website-v1:'+url;
 let cached=memory.get(key);
 if(!cached)try{cached=JSON.parse(sessionStorage.getItem(key)||'null');}catch{/* Storage may be disabled. */}
 return cached&&Date.now()-cached.at<ttl?cached.data:null;
}
export function invalidatePublicWebsite(url) {
 if(!allowed.has(url))throw new Error('Unsupported public website cache key');
 const key='public-website-v1:'+url;
 versions.set(key,(versions.get(key)||0)+1);memory.delete(key);pending.delete(key);
 try{sessionStorage.removeItem(key);}catch{/* Storage may be disabled. */}
}
export function readPublicWebsite(url,{force=false}={}) {
 if(!allowed.has(url))throw new Error('Unsupported public website cache key');
 const key='public-website-v1:'+url;
 const cached=getCachedPublicWebsite(url);
 if(!force&&cached)return Promise.resolve({data:cached});
 if(pending.has(key))return pending.get(key);
 const version=versions.get(key)||0;
 const promise=api.get(url,{skipAuthRedirect:true,skipGlobalLoading:true,timeout:60000}).then(response=>{
  if((versions.get(key)||0)!==version)return response;
  const entry={at:Date.now(),data:response.data};memory.set(key,entry);try{sessionStorage.setItem(key,JSON.stringify(entry));}catch{/* Storage may be full. */}return response;
 }).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});
 pending.set(key,promise);return promise;
}
