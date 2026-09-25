import pool from '../../config/database.js';
import {financeScope,transaction,fail,id,audit,staff} from './policy.js';
export async function settings(scope,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');const [access]=await db.execute('SELECT f.user_id,f.role,u.first_name,u.last_name FROM finance_access f JOIN users u ON u.id=f.user_id WHERE f.agency_id=?',[scope.agencyId]);return {organization:scope.org,access};}
export async function saveSettings(scope,input,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');return transaction(scope,async conn=>{
 const [[org]]=await conn.execute('SELECT * FROM finance_organizations WHERE agency_id=?',[scope.agencyId]);if(org.revision!==Number(input.revision))throw fail(409,'Settings changed; refresh first');
 const month=Number(input.fiscalStartMonth);if(!Number.isInteger(month)||month<1||month>12)throw fail(400,'Select a fiscal-year starting month');
 if(input.bankEnabled&&!input.bankConsentConfirmed)throw fail(400,'Confirm this organization has opted into broader transaction access for financial operations');
 if(org.is_demo&&input.bankEnabled)throw fail(409,'Demo organizations cannot connect real banks');
 await conn.execute('UPDATE finance_organizations SET fiscal_start_month=?,bank_enabled=?,revision=revision+1 WHERE agency_id=?',[month,input.bankEnabled===true,scope.agencyId]);
 if(!input.bankEnabled)await conn.execute("UPDATE bank_feed_accounts SET sync_enabled=0,status='paused' WHERE agency_id=? AND purpose='finance_operations'",[scope.agencyId]);
 await audit(conn,scope,'settings_updated','organization',scope.agencyId,{bankEnabled:input.bankEnabled===true,fiscalStartMonth:month});return {saved:true};
 },db);}
export async function setAccess(scope,input,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');return transaction(scope,async conn=>{
 const userId=await staff(conn,input.userId,scope.agencyId);if(!userId)throw fail(400,'Select an organization member');if(userId===scope.userId)throw fail(409,'Ask another manager to change your access');
 if(input.role==='none')await conn.execute('DELETE FROM finance_access WHERE agency_id=? AND user_id=?',[scope.agencyId,userId]);
 else {if(!['manager','requester','viewer'].includes(input.role))throw fail(400,'Choose a finance role');await conn.execute('INSERT INTO finance_access (agency_id,user_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)',[scope.agencyId,userId,input.role]);}
 await audit(conn,scope,'access_changed','user',userId,{role:input.role});return {saved:true};
 },db);}
