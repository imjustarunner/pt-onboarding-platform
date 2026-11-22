import {fetchPayers} from './claimMd.service.js';
import {listSharedPayerDirectory} from './sharedPayerDirectory.service.js';
const cache=new Map();
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}};
const list=v=>Array.isArray(v)?v:v?[v]:[];

export async function eligibilityPayerCapability({agencyId,payerId,connection},deps={}) {
 const shared=await (deps.shared||listSharedPayerDirectory)(deps.db);
 const row=shared.find(row=>row.claimmd_payer_id===payerId);
 const known=parse(row?.directory_snapshot_json).eligibility;
 if(['yes','no','enrollment'].includes(known))return known;
 if(!connection?.accountKey)return 'unknown';
 const key=JSON.stringify([connection.connectionId,payerId]),now=Date.now();
 const cached=cache.get(key);if(cached?.expires>now)return cached.value;
 // Directory lookups contain no patient data and are not paid eligibility checks.
 const result=await (deps.fetch||fetchPayers)({agencyId,accountKey:connection.accountKey,payerId});
 const matches=list(result?.payer||result?.result?.payer).filter(p=>p.payerid===payerId||list(p.payer_alt_names).some(a=>a.alt_payerid===payerId));
 const capability=matches.length===1&&['yes','no','enrollment'].includes(matches[0].eligibility)?matches[0].eligibility:'unknown';
 if(cache.size>=1000)cache.delete(cache.keys().next().value);
 cache.set(key,{expires:now+5*60*1000,value:capability});
 return capability;
}
