import pool from '../config/database.js';
import Directory from './googleWorkspaceDirectory.service.js';
const email=value=>String(value||'').trim().toLowerCase().replace(/\+[^@]+(?=@)/,'');
const parse=value=>typeof value==='string'?JSON.parse(value):value||[];
/** Check the entire thread. A single group/Bcc/multi-recipient message makes
 * personal delivery notification-only, even if its most recent reply is direct. */
export async function personalThreadCanReply({conversationId,inbox}) {
  const [rows]=await pool.execute('SELECT m.*,c.channel AS conversation_channel FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id WHERE m.conversation_id=? AND COALESCE(m.is_internal_note,0)=0 ORDER BY m.id',[conversationId]);
  if(!rows.length)return false;
  const own=new Set([email(inbox.from_email)]), others=new Set();
  const [identities]=await pool.execute("SELECT from_email,inbound_addresses_json FROM email_sender_identities WHERE agency_id=? AND identity_key IN (?,'messages','messages_at_tenant') AND is_active=1",[inbox.agency_id,`personal_${inbox.owner_user_id}`]);
  for(const identity of identities){own.add(email(identity.from_email));for(const a of parse(identity.inbound_addresses_json))own.add(email(a?.email||a));}
  for(const row of rows){
    if(row.conversation_channel!=='email'||row.channel!=='email'||Number(row.is_group_email)||parse(row.bcc_json).length)return false;
    const from=parse(row.from_json);
    if(row.direction==='inbound' && ![...parse(row.to_json),...parse(row.cc_json)].some(r=>own.has(email(r.email))))return false;
    const targets=[from?.email,from?.replyTo,...parse(row.to_json).map(r=>r.email),...parse(row.cc_json).map(r=>r.email)].map(email).filter(Boolean);
    for(const address of targets)if(!own.has(address))others.add(address);
    if(others.size>1)return false;
  }
  if(others.size!==1)return false;
  const [recipient]=others;
  const [groups]=await pool.execute('SELECT id FROM managed_workspace_groups WHERE LOWER(email)=? LIMIT 1',[recipient]);
  if(groups.length)return false;
  // A distribution group may be represented by a single address. For managed
  // domains, positively distinguish users and private app mailboxes from groups.
  const [domains]=await pool.execute('SELECT DISTINCT SUBSTRING_INDEX(from_email,\'@\',-1) domain FROM email_sender_identities WHERE is_active=1');
  if(domains.some(d=>String(d.domain).toLowerCase()===recipient.split('@')[1])){
    const [personal]=await pool.execute("SELECT id FROM communication_inboxes WHERE LOWER(from_email)=? AND kind='personal' AND is_active=1",[recipient]);
    if(!personal.length){
      if(!Directory.isConfigured())return false;
      try{const user=await Directory.getUser({primaryEmail:recipient});if(!user)return false;}
      catch{return false;}
    }
  }
  return true;
}

/** A non-SSO person's private mailbox is itself a Google Group. Its own list
 * headers do not turn a direct email into a staff distribution conversation. */
export function isDistributionMail(headers=[],personalAddress=null) {
  const own=email(personalAddress), ownList=own.replace('@','.');
  const lists=headers.filter(h=>/^list-id$/i.test(h.name));
  const belongsToOwn=lists.length>0 && lists.every(h=>{
    const id=(/<([^>]+)>/.exec(h.value)?.[1]||h.value).trim().toLowerCase();
    return own && [own,ownList].includes(id);
  });
  if(lists.length&&!belongsToOwn)return true;
  for(const h of headers.filter(h=>/^list-post$/i.test(h.name))){
    const target=/mailto:([^>\s?]+)/i.exec(h.value)?.[1];
    if(!own||!target||email(target)!==own)return true;
  }
  return !belongsToOwn && headers.some(h=>/^precedence$/i.test(h.name)&&/list|bulk/i.test(h.value));
}
