/** Reevaluate live open listings; sends only with explicit --send / --report switches. */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {getListingById} from '../services/clientExchange.service.js';
import {notifyExchangeMatches} from '../services/clientExchangeNotifications.service.js';
import {getExchangeAudit} from '../services/clientExchangeAudit.service.js';
const agencyId=Number(process.argv.find(a=>a.startsWith('--agency='))?.split('=')[1]);
try {
  if(!agencyId)throw Error('--agency is required');
  const [rows]=await pool.execute("SELECT id,client_id,posted_by_user_id FROM client_exchange_listings WHERE agency_id=? AND status IN ('open','requested') ORDER BY created_at,id LIMIT 50",[agencyId]);
  for(const row of rows){
    const listing=await getListingById(row.id,{viewerUserId:row.posted_by_user_id,viewerRole:'admin'});
    const client=await Client.findById(row.client_id);
    if(!listing||!client||!['open','requested'].includes(listing.status)||['ARCHIVED','DECLINED'].includes(String(client.status).toUpperCase()))continue;
    const result=await notifyExchangeMatches({listing,client,send:process.argv.includes('--send'),report:process.argv.includes('--report')});
    const audit=await getExchangeAudit(row.id);
    console.log(JSON.stringify({listingId:row.id,result,evaluated:audit.providers.length,matched:audit.providers.filter(p=>p.matched).length,
      emailStatuses:audit.providers.reduce((out,p)=>{const s=p.emailDelivery?.status||'not_attempted';out[s]=(out[s]||0)+1;return out;},{}),
      smsStatuses:audit.providers.reduce((out,p)=>{const s=p.smsDelivery?.status||'not_attempted';out[s]=(out[s]||0)+1;return out;},{}),views:audit.views}));
  }
}catch(error){console.error(JSON.stringify({code:error.code||'audit_failed',message:error.message}));process.exitCode=1;}finally{await pool.end();process.exit(process.exitCode||0);}
