/** Repair legacy personal addresses in work_email; dry-run unless --apply. */
import fs from 'node:fs';
import pool from '../config/database.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {providerUpdateWorkEmail} from '../services/providerUpdateRecipient.service.js';
const apply=process.argv.includes('--apply'),norm=v=>String(v||'').trim().toLowerCase();
const identities=(await Promise.all([2,6].map(agencyId=>EmailSenderIdentity.list({agencyId,onlyActive:true,includePlatformDefaults:false})))).flat();
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [rows]=await db.execute(`SELECT u.id,u.email,u.work_email,u.personal_email,GROUP_CONCAT(ua.agency_id) AS agencies FROM users u JOIN user_agencies ua ON ua.user_id=u.id
 WHERE ua.agency_id IN (2,6) AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE' AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant','staff','admin','super_admin') GROUP BY u.id FOR UPDATE`);
 const changes=[],conflicts=[];
 for(const row of rows){
  const targets=[...new Set(row.agencies.split(',').map(a=>providerUpdateWorkEmail(row,identities,a)).filter(Boolean))];
  if(targets.length!==1){conflicts.push({id:row.id,reason:targets.length?'Multiple agency mailboxes':'No verified agency mailbox'});continue;}
  const work=targets[0],old=norm(row.work_email),personal=norm(row.personal_email);
  if(old===work)continue;
  const agencyDomains=new Set(identities.filter(i=>/^po@/i.test(i.from_email||'')).map(i=>norm(i.from_email).split('@')[1]));
  const misplaced=old&&!agencyDomains.has(old.split('@')[1]);
  if(misplaced&&personal&&personal!==old){conflicts.push({id:row.id,reason:'Different personal address already saved'});continue;}
  changes.push({id:row.id,work_email:work,personal_email:misplaced?old:row.personal_email});
 }
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH is required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify(rows),{mode:0o600,flag:'wx'});for(const c of changes)await db.execute('UPDATE users SET work_email=?,personal_email=? WHERE id=?',[c.work_email,c.personal_email,c.id]);await db.commit();}else await db.rollback();
 console.log(JSON.stringify({applied:apply,changed:changes.map(c=>c.id),conflicts}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
