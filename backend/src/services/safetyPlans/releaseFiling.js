import pool from '../../config/clinicalDatabase.js';
import Client from '../../models/Client.model.js';
import ClientContactAffiliation from '../../models/ClientContactAffiliation.model.js';
import { upsertClientAffiliatedContact } from '../clientContactAffiliation.service.js';
import { maybeDecryptNotePayload } from '../clinicalNoteCrypto.service.js';

const lower = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
const digits = value => String(value || '').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
export function matchReleaseContact(contacts,{recipientName,recipientEmail,recipientPhone}) {
  const name=lower(recipientName),email=lower(recipientEmail),phone=digits(recipientPhone);
  const candidates=contacts.filter(row=>lower(row.contact_full_name)===name||
    (email&&lower(row.contact_email)===email)||(phone&&digits(row.contact_phone)===phone));
  if(!candidates.length)return {state:'new'};
  const [row]=candidates;
  if(candidates.length===1&&Number(row.is_active)&&Number(row.contact_is_active)&&lower(row.contact_full_name)===name&&
      (!email||lower(row.contact_email)===email)&&(!phone||digits(row.contact_phone)===phone))
    return {state:'linked',affiliationId:row.id};
  return {state:'needs_review'};
}

async function fileOne(row) {
  const db=await pool.getConnection();
  const lock='clinical-release-contact:'+row.client_id;
  let locked=false;
  try {
    const [[result]]=await db.execute('SELECT GET_LOCK(?, 0) AS acquired',[lock]);
    if(!(locked=Number(result?.acquired)===1))return;
    const [[saved]]=await db.execute('SELECT state FROM clinical_release_recipient_links WHERE plan_id=? AND version=?',[row.plan_id,row.version]);
    if(saved?.state!=='pending')return;
    const {data}=JSON.parse(maybeDecryptNotePayload(row.payload_encrypted));
    const {recipientName,recipientEmail,recipientPhone,direction}=data;
    let resultLink={state:'not_applicable'};
    if(recipientName&&direction?.some(value=>value!=='Provide a copy to the client')) {
      const client=await Client.findById(row.client_id);
      if(!client||Number(client.agency_id)!==Number(row.agency_id))resultLink={state:'needs_review'};
      else {
        const contacts=await ClientContactAffiliation.listForClient(row.client_id,{includeInactive:true});
        resultLink=matchReleaseContact(contacts,data);
        if(resultLink.state==='new') {
          const {affiliation}=await upsertClientAffiliatedContact({agencyId:row.agency_id,clientId:row.client_id,
            userId:null,fullName:recipientName,email:recipientEmail,phone:recipientPhone,importOnly:true});
          resultLink={state:'linked',affiliationId:affiliation.id};
        }
      }
    }
    await db.execute('UPDATE clinical_release_recipient_links SET state=?,affiliation_id=? WHERE plan_id=? AND version=? AND state=\'pending\'',
      [resultLink.state,resultLink.affiliationId||null,row.plan_id,row.version]);
  } finally {
    try { if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]); } finally { db.release(); }
  }
}

export async function fileSignedReleaseContacts() {
  const [rows]=await pool.execute(`SELECT l.plan_id,l.version,r.client_id,r.agency_id,v.payload_encrypted
    FROM clinical_release_recipient_links l JOIN clinical_form_records r ON r.id=l.plan_id
    JOIN clinical_form_versions v ON v.plan_id=l.plan_id AND v.version=l.version
    WHERE l.state='pending' ORDER BY l.updated_at LIMIT 20`);
  for(const row of rows){
    try {await fileOne(row);}
    catch(error) {
      // Keep the signed authorization available while an infrastructure failure is retried.
      await pool.execute("UPDATE clinical_release_recipient_links SET updated_at=UTC_TIMESTAMP() WHERE plan_id=? AND version=? AND state='pending'",[row.plan_id,row.version]);
      console.warn('[Release contact filing]',error.code||'retry_pending');
    }
  }
}

export async function reviewReleaseContact(actor,planId,input) {
  const {readPlan}=await import('./records.js');
  const {clientAccess}=await import('./access.js');
  const {fail,positiveId}=await import('./template.js');
  const plan=await readPlan(actor,planId,input.version);
  if(plan.documentKey!=='release-of-information'||!plan.releaseContact||plan.revocation||
     !plan.signers.some(signer=>signer.signedAt))fail(400,'Open the signed release to resolve its contact.');
  const client=await clientAccess(actor,plan.clientId,{write:true,documentKey:plan.documentKey});
  if(Number(client.agency_id)!==Number(plan.agencyId))fail(403,'This release is no longer in this agency.');
  const affiliation=await ClientContactAffiliation.findById(positiveId(input.affiliationId));
  if(!affiliation||Number(affiliation.client_id)!==Number(plan.clientId)||Number(affiliation.agency_id)!==Number(plan.agencyId)||
      !Number(affiliation.is_active)||!Number(affiliation.contact_is_active))fail(404,'Choose an active contact on this client record.');
  if(input.confirm!==true)fail(400,'Confirm that this contact is named in the signed release.');
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    const [result]=await db.execute("UPDATE clinical_release_recipient_links SET state='linked',affiliation_id=? WHERE plan_id=? AND version=? AND state='needs_review'",
      [affiliation.id,plan.id,plan.version]);
    if(!result.affectedRows)fail(409,'This release contact no longer needs review.');
    await db.execute('INSERT INTO clinical_form_events(plan_id,version,actor_user_id,action) VALUES(?,?,?,?)',
      [plan.id,plan.version,actor.id,'release_contact_linked']);
    await db.commit();
  } catch(error) { await db.rollback(); throw error; }
  finally { db.release(); }
  return readPlan(actor,plan.id,plan.version);
}
