// Explicit rollout tool: node src/scripts/configureRecordsManagers.js --apply < reviewed-plan.json
// The plan contains numeric agency/user IDs, never credentials or patient data.
import fs from 'node:fs';
import pool from '../config/database.js';
import { transaction } from '../services/recordsRequests/service.js';
import { encryptFamilyBilling as seal, assertFamilyBillingEncryption } from '../services/familyBillingEncryption.service.js';
const plan=JSON.parse(fs.readFileSync(0,'utf8'));
try {
  if(!Array.isArray(plan.agencies)||!plan.agencies.length||!Array.isArray(plan.managerIds)||!plan.managerIds.length||new Set(plan.managerIds).size!==plan.managerIds.length||![plan.actorUserId,...plan.managerIds,...plan.agencies.map(a=>a.id)].every(id=>Number.isSafeInteger(id)&&id>0))throw new Error('Supply reviewed agency IDs, primary/backup user IDs, and the authorizing administrator.');
  const [[actor]]=await pool.execute("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND is_archived=0 AND status='ACTIVE_EMPLOYEE'",[plan.actorUserId]);if(!actor)throw new Error('An active superadmin must authorize this rollout.');
  const resolved=[];
  for(const id of plan.managerIds){const [[u]]=await pool.execute("SELECT id,first_name,last_name FROM users WHERE id=? AND is_active=1 AND is_archived=0 AND status='ACTIVE_EMPLOYEE' AND role IN ('super_admin','admin','support','staff','clinical_practice_assistant','agency_admin','backoffice_admin')",[id]);if(!u)throw new Error(`Staff account ${id} is unavailable.`);resolved.push(u);}
  for(const a of plan.agencies){const [[p]]=await pool.execute("SELECT id,slug FROM agencies WHERE id=? AND is_active=1 AND COALESCE(organization_type,'agency') IN ('agency','clinical')",[a.id]);if(!p||p.slug!==a.slug)throw new Error(`Review practice ${a.id} again.`);}
  console.log(JSON.stringify({agencies:plan.agencies,recordsManagers:resolved,apply:process.argv.includes('--apply')}));
  if(process.argv.includes('--apply')){
    assertFamilyBillingEncryption();
    await transaction(async db=>{
      for(const a of plan.agencies){
        await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[a.id]);
        const [existing]=await db.execute('SELECT user_id FROM auricwell_records_managers WHERE agency_id=? ORDER BY assignment_order',[a.id]);
        if(existing.length&&JSON.stringify(existing.map(x=>x.user_id))!==JSON.stringify(plan.managerIds))throw new Error(`Practice ${a.id} already has a different team; review in the app.`);
        await db.execute('INSERT INTO auricwell_records_settings (agency_id,enabled,follow_up_days) VALUES (?,?,7) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),revision=revision+1',[a.id,a.publicRequests===true?1:0]);
        await db.execute('DELETE FROM auricwell_records_managers WHERE agency_id=?',[a.id]);
        for(let i=0;i<plan.managerIds.length;i++)await db.execute('INSERT INTO auricwell_records_managers (agency_id,user_id,assignment_order) VALUES (?,?,?)',[a.id,plan.managerIds[i],i]);
        await db.execute("INSERT INTO auricwell_records_audit (agency_id,actor_user_id,action,details) VALUES (?,?,'managers_configured',?)",[a.id,plan.actorUserId,seal({managerIds:plan.managerIds,source:'user_authorized_rollout'},`auricwell:records-audit:${a.id}`)]);
      }
    });
    console.log('Records Manager assignments saved.');
  }
}finally{await pool.end();}
