import { decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import pool from '../config/database.js';

const json = (value, fallback={}) => {try{return typeof value==='string'?JSON.parse(value):value || fallback;}catch{return fallback;}};
export const emailBodyText = value => String(value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
  .replace(/<\s*br\s*\/?\s*>|<\/(p|div|tr|h[1-6])>/gi,'\n').replace(/<[^>]*>/g,'')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/g,"'")
  .replace(/\n[ \t]*\n[ \t]*\n/g,'\n\n').trim();
export function matchOnboardingReply(delivery, reply) {
  const id=json(delivery.metadata).internetMessageId;
  if (!id || !/^<[^<>\s]+@[^<>\s]+>$/.test(id)) return false;
  return reply.in_reply_to===id || (String(reply.references_header || '').match(/<[^<>\s]+@[^<>\s]+>/g) || []).includes(id);
}
export async function loadOnboardingEmailHistory(rows,{database=pool}={}) {
  if(!rows?.length)return [];
  const [history]=await database.execute(`SELECT d.*,c.subject,c.body,c.metadata,i.agency_id
    FROM school_onboarding_email_deliveries d JOIN school_onboarding_invites i ON i.id=d.invite_id
    LEFT JOIN user_communications c ON c.id=d.communication_id AND c.agency_id=i.agency_id
    WHERE d.invite_id IN (${rows.map(()=>'?').join(',')}) ORDER BY d.id`,rows.map(r=>r.id));
  const result=[];
  for(const row of history) {
    const delivery={...row};
    result.push(delivery);
    const metadata=json(delivery.metadata);
    delivery.from_email=metadata.fromEmail || null;
    delivery.reply_to=metadata.replyTo || null;
    delivery.cc=metadata.cc || null;
    delivery.body_text=emailBodyText(delivery.body);
    delivery.replies=[];
    const id=metadata.internetMessageId;
    if (delivery.delivery_status==='sent' && /^<[^<>\s]+@[^<>\s]+>$/.test(id || '')) {
      // Match the exact delivered RFC Message-ID in the same tenant's Schools
      // inbox. Subjects and contact addresses alone never link private messages.
      const [replies]=await database.execute(`SELECT m.id,m.internet_message_id,m.subject,m.body_text,m.body_html,m.from_json,m.sent_at,m.created_at,m.in_reply_to,m.references_header
        FROM communication_messages m JOIN communication_conversations v ON v.id=m.conversation_id
        JOIN communication_inboxes box ON box.id=v.inbox_id AND box.agency_id=v.agency_id
        WHERE v.agency_id=? AND LOWER(box.from_email)=LOWER(?) AND m.direction='inbound'
          AND m.is_internal_note=0 AND COALESCE(m.is_auto_reply,0)=0
          AND (m.in_reply_to=? OR LOCATE(?,m.references_header)>0) ORDER BY m.id`,
        [delivery.agency_id,delivery.reply_to || delivery.from_email || '',id,id]);
      delivery.replies=replies.filter(r=>matchOnboardingReply(delivery,r)).map(r=>({id:`inbox:${r.id}`,messageId:r.internet_message_id,subject:r.subject,
        bodyText:r.body_text || emailBodyText(r.body_html),from:json(r.from_json).email || null,at:r.sent_at || r.created_at}));
      // Schools replies use the canonical support-ticket transport. Read that
      // existing encrypted message too; do not create a second inbox or reply.
      const [ticketReplies]=await database.execute(`SELECT e.id email_id,e.subject,e.from_email,e.sent_at,e.internet_message_id,e.in_reply_to,e.references_header,m.*
        FROM support_ticket_email_messages e JOIN support_ticket_messages m ON m.id=e.ticket_message_id AND m.ticket_id=e.ticket_id
        WHERE e.agency_id=? AND e.direction='inbound' AND e.send_status='received'
          AND COALESCE(m.is_internal,0)=0 AND COALESCE(m.is_deleted,0)=0
          AND (e.in_reply_to=? OR LOCATE(?,e.references_header)>0) ORDER BY e.id`,[delivery.agency_id,id,id]);
      for(const reply of ticketReplies.filter(r=>matchOnboardingReply(delivery,r))) {
        if(delivery.replies.some(r=>r.messageId && r.messageId===reply.internet_message_id))continue;
        delivery.replies.push({id:`ticket:${reply.email_id}`,messageId:reply.internet_message_id,subject:reply.subject,
          bodyText:decryptTicketMessageRow(reply).body,from:reply.from_email,at:reply.sent_at || reply.created_at});
      }
    }
    delete delivery.body;delete delivery.metadata;
  }
  return result;
}
