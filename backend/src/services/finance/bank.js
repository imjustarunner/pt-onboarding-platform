import crypto from 'node:crypto';
import pool from '../../config/database.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {fail,id,related,audit,transaction} from './policy.js';
const context=(agencyId,accountId)=>`finance-bank:${agencyId}:${accountId}`;
export async function financeBankCanSync(db,agencyId){const [[org]]=await db.execute('SELECT enabled,bank_enabled,is_demo FROM finance_organizations WHERE agency_id=?',[agencyId]);return !!(org?.enabled&&org.bank_enabled&&!org.is_demo);}
export async function storeFinanceBankEntry(db,account,value){
 if(value.account!==account.external_id||value.livemode!==!!account.livemode||!value.id?.startsWith('fctxn_')||!Number.isSafeInteger(value.amount)||!Number.isSafeInteger(value.updated)||!Number.isSafeInteger(value.transacted_at)||!['pending','posted','void'].includes(value.status)||!/^[a-z]{3}$/.test(value.currency))throw fail(502,'Bank transaction identity could not be verified');
 const evidence={reference:value.id,amountCents:value.amount,currency:value.currency,description:String(value.description||'').slice(0,2000),status:value.status,transactedAt:value.transacted_at,postedAt:value.status_transitions?.posted_at||null,updated:value.updated};
 const hash=crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
 const [[old]]=await db.execute('SELECT * FROM finance_bank_entries WHERE agency_id=? AND account_id=? AND external_id=? FOR UPDATE',[account.agency_id,account.id,value.id]);
 if(old&&(Number(old.vendor_updated)>value.updated||old.evidence_hash===hash))return false;
 const encrypted=encryptFamilyBilling(evidence,context(account.agency_id,account.id));let entryId=old?.id;
 if(old)await db.execute("UPDATE finance_bank_entries SET vendor_updated=?,evidence_encrypted=?,evidence_hash=?,review_status=IF(expense_id IS NULL,'unreviewed','needs_review') WHERE id=? AND agency_id=?",[value.updated,encrypted,hash,entryId,account.agency_id]);
 else {const [r]=await db.execute('INSERT INTO finance_bank_entries (agency_id,account_id,external_id,vendor_updated,evidence_encrypted,evidence_hash) VALUES (?,?,?,?,?,?)',[account.agency_id,account.id,value.id,value.updated,encrypted,hash]);entryId=r.insertId;}
 await db.execute('INSERT INTO finance_bank_history (agency_id,entry_id,evidence_encrypted,evidence_hash) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE evidence_hash=VALUES(evidence_hash)',[account.agency_id,entryId,encrypted,hash]);return true;
}
export async function financeBankOverview(scope,after=0,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');
 const [accounts]=await db.execute("SELECT * FROM bank_feed_accounts WHERE agency_id=? AND purpose='finance_operations' ORDER BY id",[scope.agencyId]);
 const [rows]=await db.execute('SELECT * FROM finance_bank_entries WHERE agency_id=? AND id>? ORDER BY id LIMIT 101',[scope.agencyId,after]);
 return {enabled:process.env.BANK_FEEDS_ENABLED==='true'&&!!scope.org.bank_enabled&&!scope.org.is_demo,consentEnabled:!!scope.org.bank_enabled,accounts:accounts.map(a=>({id:a.id,status:a.status,syncEnabled:!!a.sync_enabled,lastError:a.last_error,lastSyncedAt:a.last_synced_at,...decryptFamilyBilling(a.details_encrypted,`bank-account:${scope.agencyId}:${a.external_id}`)})),entries:rows.slice(0,100).map(r=>({id:r.id,accountId:r.account_id,expenseId:r.expense_id,reviewStatus:r.review_status,...decryptFamilyBilling(r.evidence_encrypted,context(scope.agencyId,r.account_id))})),nextAfter:rows.length>100?rows[99].id:null};
}
export async function reconcileBankExpense(scope,entryId,input,db=pool){if(scope.role!=='manager')throw fail(403,'Finance manager access required');return transaction(scope,async conn=>{
 const [[entry]]=await conn.execute('SELECT * FROM finance_bank_entries WHERE id=? AND agency_id=? FOR UPDATE',[id(entryId),scope.agencyId]);if(!entry)throw fail(404,'Bank entry not found');const expense=await related(conn,'finance_expenses',input.expenseId,scope.agencyId),evidence=decryptFamilyBilling(entry.evidence_encrypted,context(scope.agencyId,entry.account_id));
 if(entry.expense_id&&entry.expense_id!==expense.id)throw fail(409,'This transaction already has an expense match');
 if(expense.status!=='paid'||evidence.status!=='posted'||evidence.currency!=='usd'||-evidence.amountCents!==Number(expense.amount_cents))throw fail(409,'Match a posted debit to an already recorded paid expense of the exact amount');
 if(input.confirmed!==true)throw fail(400,'Confirm the payment reference, payee and amount');
 await conn.execute("UPDATE finance_bank_entries SET expense_id=?,review_status='matched' WHERE id=? AND agency_id=?",[expense.id,entry.id,scope.agencyId]);await audit(conn,scope,'bank_expense_matched','bank_entry',entry.id,{expenseId:expense.id});return {matched:true,moneyMoved:false};
 },db);}
