/** Enable the requested leave policy without importing, resetting or fabricating balances. */
import fs from 'node:fs';
import pool from '../config/database.js';
const apply=process.argv.includes('--apply');const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [[agency]]=await db.execute('SELECT pto_policy_json FROM agencies WHERE id=2 FOR UPDATE');
 const [accounts]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=2');
 const current=typeof agency.pto_policy_json==='string'?JSON.parse(agency.pto_policy_json):agency.pto_policy_json||{};
 const policy={...current,sharedLeaveAccrualEnabled:true,trainingPtoEnabled:true,trainingAccrualPer30:.25,trainingMaxBalance:20,trainingForfeitOnTermination:false,schoolSupportEnabled:true,schoolSupportHourlyRate:18,schoolSupportMaxBalance:20,schoolSupportAccrualAfter:'2026-10-09'};
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({current,accounts}),{mode:0o600,flag:'wx'});await db.execute('UPDATE agencies SET pto_policy_json=? WHERE id=2',[JSON.stringify(policy)]);await db.commit();}else await db.rollback();
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',existingAccounts:accounts.length,balancesChanged:0,schoolStarts:'2026-10-10',trainingHandoff:'People Operations confirms ADP balance and through-period date per employee',messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
