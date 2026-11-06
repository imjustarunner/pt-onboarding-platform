// Session-local recovery only. Never write clinical text into browser storage or URLs.
const entries=new Map(),MAX_ITEMS=8,MAX_BYTES=4*1024*1024,MAX_ITEM_BYTES=1024*1024;
let actor='';
const positive=value=>Number.isSafeInteger(Number(value)) && Number(value)>0?Number(value):0;
const actorKey=(userId,agencyId)=>positive(userId)&&positive(agencyId)?`${positive(userId)}:${positive(agencyId)}`:'';
const clone=value=>JSON.parse(JSON.stringify(value));
export function clinicalRecoveryFingerprint(value){const sort=item=>Array.isArray(item)?item.map(sort):item && typeof item==='object'?Object.fromEntries(Object.keys(item).sort().map(key=>[key,sort(item[key])])):item;return JSON.stringify(sort(value));}
function identity(value){const id={userId:positive(value.userId),agencyId:positive(value.agencyId),clientId:positive(value.clientId),clinicalSessionId:positive(value.clinicalSessionId),officeEventId:positive(value.officeEventId),draftId:positive(value.draftId)};return id.userId && id.agencyId && id.clientId && (id.clinicalSessionId || id.officeEventId || id.draftId)?id:null;}
const key=id=>JSON.stringify(id);

export function activateClinicalRecovery(userId,agencyId){const next=actorKey(userId,agencyId);if(!next || actor && actor!==next)entries.clear();actor=next;}
export function clearClinicalRecovery({deactivate=false}={}){entries.clear();if(deactivate)actor='';}
export function canRetainClinicalRecovery(value,snapshot){const id=identity(value);if(!id || actor!==actorKey(id.userId,id.agencyId))return false;const bytes=new TextEncoder().encode(clinicalRecoveryFingerprint(snapshot)).length;const existing=entries.get(key(id));return bytes<=MAX_ITEM_BYTES && (existing || entries.size<MAX_ITEMS) && [...entries.values()].reduce((sum,item)=>sum+item.bytes,0)-(existing?.bytes || 0)+bytes<=MAX_BYTES;}
export function stashClinicalRecovery(value,snapshot,baseFingerprint=''){
 const id=identity(value);if(!id || !canRetainClinicalRecovery(value,snapshot))return false;
 const data=clone(snapshot),fingerprint=clinicalRecoveryFingerprint(data),bytes=new TextEncoder().encode(fingerprint).length;
 if(bytes>MAX_ITEM_BYTES)return false;
 const idKey=key(id);entries.delete(idKey);entries.set(idKey,{identity:id,snapshot:data,fingerprint,baseFingerprint,bytes,createdAt:Date.now()});return true;
}
export function findClinicalRecovery(value,serverSnapshot){
 const id=identity(value);if(!id || actor!==actorKey(id.userId,id.agencyId))return null;
 let item=entries.get(key(id));
 // A save can complete after the app hid: match the same authorized encounter
 // when its previously unsaved draft acquired a server ID. Never merge silently.
 if(!item && (id.clinicalSessionId || id.officeEventId))item=[...entries.values()].reverse().find(row=>row.identity.userId===id.userId && row.identity.agencyId===id.agencyId && row.identity.clientId===id.clientId && row.identity.clinicalSessionId===id.clinicalSessionId && row.identity.officeEventId===id.officeEventId && !row.identity.draftId);
 if(!item)return null;const current=clinicalRecoveryFingerprint(serverSnapshot);
 if(item.fingerprint===current){entries.delete(key(item.identity));return null;}
 return {key:key(item.identity),snapshot:clone(item.snapshot),createdAt:item.createdAt,serverChanged:!!item.baseFingerprint && item.baseFingerprint!==current};
}
export function discardClinicalRecovery(value){if(typeof value==='string')entries.delete(value);else{const id=identity(value);if(id)entries.delete(key(id));}}
