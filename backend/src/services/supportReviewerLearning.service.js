import crypto from 'node:crypto';
import {decryptChatText} from './chatEncryption.service.js';
import {currentSupportEmailText} from '../utils/supportEmailDraft.shared.js';
import {RACHEL_SUPPORT_STANDARDS} from '../content/supportReviewerStandards.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const historicalText=value=>currentSupportEmailText(value).replace(/https?:\/\/[^\s<>]+/gi,'[historical link omitted]').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[historical email omitted]').replace(/\b(?:pin|password|access code)\s*[:=]\s*\S+/gi,'[historical credential omitted]');
const bodyKey=value=>currentSupportEmailText(value).toLowerCase().replace(/\s+/g,' ').trim();
const noReply=text=>/\b(?:no need to (?:reply|respond)|(?:do not|don't|we do not|we don't) (?:need to )?(?:reply|respond)|(?:junk|scam) (?:e?mail|email))\b/i.test(text);
const uncertain=text=>/\b(?:not sure|might work|seems like|could be|i believe|i think)\b/i.test(text);
const stop=new Set('this that with from your have would could please thank thanks hello morning email school client student family there about need just know information'.split(' '));
const tokens=text=>new Set((String(text||'').toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!stop.has(w)));

export function buildReviewerLearning(context,rows,{decrypt=decryptChatText}={}) {
 const records=[];
 for(const row of rows){
  if(Number(row.agency_id)!==Number(context.agencyId)||Number(row.updated_by_user_id)!==Number(row.reviewer_user_id)||!row.feedback_encrypted)continue;
  try{const feedback=JSON.parse(decrypt(parse(row.feedback_encrypted)));const evidence=JSON.parse(decrypt(parse(row.evidence_encrypted)));
   if(!feedback.notes?.trim()&&!feedback.preferredReply?.trim()&&!row.actual_rating&&!row.draft_rating)continue;
   records.push({row,feedback,evidence});
  }catch{/* An unreadable example must never become evidence. */}
 }
 const words=tokens(`${context.original.subject} ${context.latestInbound.body}`);
 const related=records.map(record=>{const source=record.evidence.originalReceived;
  const sameSource=Number(record.row.ticket_id)===Number(context.ticketId)&&bodyKey(source?.body)===bodyKey(context.latestInbound.body)
   &&(!context.latestInbound.id||String(source?.sourceMessageId)===String(context.latestInbound.id));
  const vocabulary=tokens(`${record.evidence.subject} ${source?.body}`);const score=[...words].filter(w=>vocabulary.has(w)).length;
  return {...record,sameSource,score};
 }).filter(r=>r.sameSource || r.score>=3 && (!r.row.school_organization_id || !context.schoolOrganizationId || Number(r.row.school_organization_id)===Number(context.schoolOrganizationId))).sort((a,b)=>Number(b.sameSource)-Number(a.sameSource)||b.score-a.score||Number(b.row.id)-Number(a.row.id));
 const decision=related.find(r=>r.sameSource&&noReply(`${r.feedback.notes}\n${r.feedback.preferredReply}`));
 const examples=related.filter(r=>!uncertain(r.feedback.notes||'')&&!noReply(r.feedback.notes||''))
  .filter(r=>r.feedback.preferredReply?.trim()||r.feedback.notes?.trim()||r.row.draft_rating==='good'||r.row.actual_rating==='good').slice(0,4)
  .map(({row,feedback,evidence})=>({reviewEntryId:row.id,actualRating:row.actual_rating,draftRating:row.draft_rating,
   // Historical text is a writing comparison, never current client facts.
   previousQuestion:historicalText(evidence.originalReceived?.body).slice(0,1400),
   preferredReply:historicalText(feedback.preferredReply).slice(0,2200),
   reviewerNotes:historicalText(feedback.notes).slice(0,1600),
   approvedExample:row.draft_rating==='good'?historicalText(evidence.comparison?.generatedDraft).slice(0,1600)
    :row.actual_rating==='good'&&!feedback.preferredReply?historicalText(evidence.deliveries?.[0]?.body).slice(0,1600):null}));
 const sourceIds=new Set(records.map(r=>Number(r.row.id)));
 const standards=Number(context.agencyId)===2?RACHEL_SUPPORT_STANDARDS.filter(rule=>rule.entries.some(id=>sourceIds.has(id))):[];
 return {version:'rachel-review-v1',fingerprint:hash(records.map(({row,feedback})=>[row.id,row.revision,row.actual_rating,row.draft_rating,feedback])),
  savedFeedbackCount:records.length,standards,examples,
  decision:decision?{action:'no_reply',reason:'reviewer_marked_no_reply',entryId:decision.row.id,sourceMessageId:decision.evidence.originalReceived?.sourceMessageId}:null};
}
export async function lookupSupportReviewerLearning(context,{database:injectedDb}={}) {
 const database=injectedDb||(await import('../config/database.js')).default;
 const [rows]=await database.execute(`SELECT e.*,b.reviewer_user_id,t.school_organization_id FROM support_reply_review_entries e
  JOIN support_tickets t ON t.id=e.ticket_id AND t.agency_id=e.agency_id
  JOIN support_reply_review_batches b ON b.id=e.batch_id AND b.agency_id=e.agency_id
  JOIN support_reply_pilot_config c ON c.agency_id=e.agency_id AND c.reviewer_user_id=b.reviewer_user_id
  WHERE e.agency_id=? AND e.feedback_encrypted IS NOT NULL AND e.updated_by_user_id=b.reviewer_user_id
  ORDER BY e.updated_at DESC,e.id DESC LIMIT 240`,[context.agencyId]);
 return buildReviewerLearning(context,rows);
}
export async function lookupSupportCorrespondence(context,{database:injectedDb}={}) {
 const database=injectedDb||(await import('../config/database.js')).default;
 const [emails]=await database.execute(`SELECT e.* FROM support_ticket_email_messages e WHERE e.agency_id=? AND e.ticket_id=? AND e.direction='inbound'
  AND (? IS NULL OR e.ticket_message_id=?) ORDER BY COALESCE(e.sent_at,e.created_at) DESC,e.id DESC LIMIT 1`,[context.agencyId,context.ticketId,context.latestInbound.id||null,context.latestInbound.id||null]);
 const email=emails[0];if(!email)return null;
 const [people]=await database.execute(`SELECT u.role,u.email,u.work_email,u.personal_email FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE u.is_active=1 AND u.role IN ('provider','provider_plus','support','admin','super_admin')`,[context.agencyId]);
 const [schools]=await database.execute(`SELECT sp.itsco_email FROM school_profiles sp JOIN organization_affiliations oa ON oa.organization_id=sp.school_organization_id AND oa.agency_id=? AND oa.is_active=1`,[context.agencyId]);
 const addresses=value=>{const v=parse(value||'[]');return(Array.isArray(v)?v:[]).map(x=>String(x.email||x).toLowerCase());};
 const to=addresses(email.to_json),cc=addresses(email.cc_json),from=String(email.from_email||'').toLowerCase();
 const owned=p=>[p.email,p.work_email,p.personal_email].filter(Boolean).map(s=>s.toLowerCase());
 const sender=people.find(p=>owned(p).includes(from));
 const supportEmails=new Set(people.filter(p=>['support','admin','super_admin'].includes(p.role)).flatMap(owned));
 return {verified:true,senderRole:sender?.role||'external',schoolGroupInTo:schools.some(s=>to.includes(String(s.itsco_email||'').toLowerCase())),
  supportDirectlyAddressed:to.some(e=>supportEmails.has(e)||/^(?:support|schools)@/i.test(e)),
  providerCopied:people.some(p=>['provider','provider_plus'].includes(p.role)&&owned(p).some(e=>[...to,...cc].includes(e))),
  to,cc,sourceMessageId:email.ticket_message_id};
}
