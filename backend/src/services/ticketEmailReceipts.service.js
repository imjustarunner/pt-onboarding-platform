import pool from '../config/database.js';
const json=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
/** Stored evidence only. Viewing never fetches images, sends mail, or marks an email opened. */
export async function listTicketEmailReceipts(ticket,db=pool) {
 const [rows]=await db.execute(`SELECT e.id,e.ticket_message_id,e.direction,e.send_status,e.from_email,e.from_name,
  e.to_json,e.cc_json,e.subject,e.sent_at,e.created_at,e.error_code,e.error_message,e.communication_id,
  c.delivery_status,c.delivered_at,c.opened_at,c.first_clicked_at,c.metadata,
  (c.body IS NOT NULL) AS has_preview
  FROM support_ticket_email_messages e LEFT JOIN user_communications c ON c.id=e.communication_id
  WHERE e.ticket_id=? ORDER BY COALESCE(e.sent_at,e.created_at),e.id`,[ticket.id]);
 const mapped=rows.map(row=>({...row,to:json(row.to_json),cc:json(row.cc_json),replyTo:json(row.metadata).replyTo||row.from_email,
  metadata:undefined,has_preview:!!row.has_preview,source:row.communication_id?'app':'imported_email'}));
 if(ticket.source_channel==='public_web'){
  // Earlier website replies logged a transport receipt without attaching it to
  // the ticket message. Display the explicitly numbered receipt without inventing a link.
  const [legacy]=await db.execute(`SELECT c.id AS communication_id,c.subject,c.recipient_address,c.delivery_status,
    c.sent_at,c.delivered_at,c.opened_at,c.first_clicked_at,c.error_message,c.metadata,(c.body IS NOT NULL) AS has_preview
    FROM user_communications c WHERE c.agency_id=? AND c.channel='email' AND c.subject LIKE ?
      AND NOT EXISTS (SELECT 1 FROM support_ticket_email_messages e WHERE e.communication_id=c.id)
    ORDER BY c.id`,[ticket.agency_id,`%[#${Number(ticket.id)}]%`]);
  for(const row of legacy){const meta=json(row.metadata);mapped.push({...row,id:`communication-${row.communication_id}`,direction:'outbound',send_status:row.delivery_status,
   from_email:meta.fromEmail,from_name:meta.fromDisplayName,replyTo:meta.replyTo,to:[row.recipient_address],cc:meta.cc||[],source:'legacy_website_receipt',has_preview:!!row.has_preview,metadata:undefined});}
 }
 return mapped;
}
export async function ticketEmailPreview(ticket,communicationId,db=pool){
 const receipts=await listTicketEmailReceipts(ticket,db);
 if(!receipts.some(r=>Number(r.communication_id)===Number(communicationId)))throw Object.assign(Error('Email receipt not found'),{status:404});
 const [[row]]=await db.execute('SELECT subject,body FROM user_communications WHERE id=?',[communicationId]);
 if(!row)throw Object.assign(Error('Email preview unavailable'),{status:404});
 return {subject:row.subject,body_html:/<\/?[a-z][\s\S]*>/i.test(row.body||'')?row.body:null,body_text:/<\/?[a-z][\s\S]*>/i.test(row.body||'')?null:row.body};
}

export async function previewTicketReply({ticket,actorUserId,senderIdentityId,senderMode='staff',body},dependencies={}){
 if(!String(body||'').trim()||String(body).length>60000)throw Object.assign(Error('Enter a reply to preview'),{status:400});
 if(!['staff','team'].includes(senderMode))throw Object.assign(Error('Choose a signature'),{status:400});
 const options=await (dependencies.senderOptions || (await import('./supportTicketEmail.service.js')).listSupportTicketSenderOptions)({ticket,actorUserId});
 const selected=options.find(option=>Number(option.id)===Number(senderIdentityId));
 if(!selected)throw Object.assign(Error('Choose an authorized sender'),{status:403});
 if(selected.senderKind==='staff'&&senderMode==='team')throw Object.assign(Error('Use your staff signature for a personal address'),{status:400});
 const identity=await (dependencies.findIdentity || (await import('../models/EmailSenderIdentity.model.js')).default.findById)(selected.id);
 const name=senderMode==='team'?selected.teamDisplayName:selected.staffDisplayName;
 const finish=dependencies.finalize || (await import('./unifiedEmail/unifiedEmailSender.service.js')).finalizeOutboundContent;
 const content=await finish({identity:{...identity,display_name:name},text:body,to:ticket.source_email_from,agencyId:identity.agency_id,
  generatedByUserId:actorUserId,source:'manual',templateType:senderMode==='team'?'support_ticket_reply_team':'support_ticket_reply',previewOnly:true});
 return {body_html:content.html,body_text:content.text,fromEmail:selected.fromEmail,fromName:name,replyTo:selected.replyToEmail||selected.fromEmail,previewOnly:true};
}
