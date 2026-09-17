import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
export async function sendWebsiteTicketReply(ticket,body,{identities=EmailSenderIdentity,send=sendEmailFromIdentity}={}) {
 if(ticket.source_channel!=='public_web'||!ticket.source_email_from)return {sent:false,reason:'No visitor email is available.'};
 let identity;
 for(const key of ['support','schoolreply','general','info']){identity=await identities.findByAgencyAndIdentityKey(ticket.agency_id,key);if(identity)break;}
 if(!identity)return {sent:false,reason:'No support sender is configured for this organization. The reply is saved on the ticket.'};
 try{const result=await send({senderIdentityId:identity.id,to:ticket.source_email_from,subject:`Re: ${ticket.subject||'Your website inquiry'} [#${ticket.id}]`,text:`${body}\n\nPlease do not send protected health information by email. Community Standards & communication privacy: https://plottwisthq.com/community-standards`,source:'manual'});
 return {sent:!result?.skipped,reason:result?.skipped?'Email delivery was skipped. The reply is saved on the ticket.':null};
 }catch{return {sent:false,reason:'Email could not be delivered. The reply is saved on the ticket.'};}
}
