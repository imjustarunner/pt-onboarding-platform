import pool from '../config/database.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {transaction} from './familyLedger/policy.js';
import {auditBilling,billingError} from './familyBillingPolicy.service.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
export async function familyAccount(userId,db=pool){
 const [[row]]=await db.execute('SELECT first_name,last_name,email,username,COALESCE(NULLIF(phone_number,\'\'),personal_phone) phone,timezone,profile_date_of_birth dateOfBirth FROM users WHERE id=?',[userId]);
 if(!row)throw billingError(404,'Account not found');
 if(!row.dateOfBirth){const links=await ClientGuardian.listClientsForGuardian({guardianUserId:userId});row.dateOfBirth=links.find(c=>c.relationship_type==='self')?.date_of_birth||null;}
 return row;
}
export async function updateFamilyAccount({userId,agencyId,input}){
 const phone=String(input?.phone||'').trim();const normalized=phone?normalizeSmsPhone(phone):null;
 if(phone&&!normalized)throw billingError(400,'Enter a valid phone number, including the area code.');
 const timeZone=String(input?.timezone||'America/Denver');try{new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw billingError(400,'Choose a valid time zone.');}
 const first=String(input?.firstName||'').trim(),last=String(input?.lastName||'').trim();if(!first||!last||first.length>100||last.length>100)throw billingError(400,'Enter your first and last name.');
 const links=await ClientGuardian.listClientsForGuardian({guardianUserId:userId});if(!links.some(c=>Number(c.agency_id)===Number(agencyId)))throw billingError(403,'This agency is not linked to your account.');
 return transaction(async db=>{
  await db.execute('UPDATE users SET first_name=?,last_name=?,phone_number=?,personal_phone=?,timezone=? WHERE id=?',[first,last,normalized,normalized,timeZone,userId]);
  // Changing a phone never carries consent from the old number to the new one.
  // Delivery gates require consent for the current, normalized number.
  await auditBilling({agencyId,userId,action:'family_account_contact_updated'},db);
  return {saved:true};
 });
}
