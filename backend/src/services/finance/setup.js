import pool from '../../config/database.js';
import { fail, id, audit } from './policy.js';

// Only the platform administrator or the explicit rollout script calls this setup.
// Enabling a module never enables bank imports or creates financial balances.
export async function enableFinanceOrganization({agencyId, managerAgencyId=null, actorUserId=null}, db=pool) {
  agencyId=id(agencyId); managerAgencyId=managerAgencyId?id(managerAgencyId):null;
  if(managerAgencyId===agencyId) managerAgencyId=null;
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[agency]]=await conn.execute('SELECT id,feature_flags FROM agencies WHERE id=? AND is_active=1 FOR UPDATE',[agencyId]);
    if(!agency) throw fail(404,'Active organization not found');
    if(managerAgencyId){const [[manager]]=await conn.execute('SELECT agency_id FROM finance_organizations WHERE agency_id=? AND enabled=1 AND is_demo=0',[managerAgencyId]);if(!manager)throw fail(400,'Enable the managing organization first');}
    const [[existing]]=await conn.execute('SELECT * FROM finance_organizations WHERE agency_id=?',[agencyId]);
    if(existing && Number(existing.manager_agency_id||0)!==Number(managerAgencyId||0))throw fail(409,'A management relationship already exists; it must be reviewed before reassignment');
    if(!existing)await conn.execute('INSERT INTO finance_organizations (agency_id,enabled,mode,manager_agency_id) VALUES (?,1,?,?)',[agencyId,managerAgencyId?'sponsored':'self_managed',managerAgencyId]);
    if(existing&&!existing.enabled)await conn.execute('UPDATE finance_organizations SET enabled=1,bank_enabled=0,revision=revision+1 WHERE agency_id=?',[agencyId]);
    let flags=agency.feature_flags||{}; if(typeof flags==='string')flags=JSON.parse(flags);
    await conn.execute('UPDATE agencies SET feature_flags=? WHERE id=?',[JSON.stringify({...flags,financeOperationsEnabled:true}),agencyId]);
    await audit(conn,{agencyId,userId:actorUserId},'module_configured','organization',agencyId,{managerAgencyId,created:!existing});
    await conn.commit(); return {agencyId,existing:!!existing};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
