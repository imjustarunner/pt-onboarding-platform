import pool from '../config/database.js';
import { schoolEmailContext, listSchoolEmails, getSchoolEmail, markSchoolEmailRead, sendSchoolEmail } from '../services/schoolPortalEmail.service.js';
import { readCommunicationAttachment } from '../services/communicationAttachments.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';

export function createSchoolPortalEmailHandlers(checkAccess) {
  const run = action => async (req,res,next) => {
    try {
      const ctx = await schoolEmailContext({organizationId:req.params.organizationId,user:req.user,checkAccess});
      res.set('Cache-Control','private, no-store');
      await action(req,res,ctx);
    } catch(e) { next(e); }
  };
  return {
    list: run(async (req,res,ctx) => res.json(await listSchoolEmails(ctx,{offset:req.query.offset,unreadOnly:req.query.unread==='true'}))),
    detail: run(async (req,res,ctx) => {
      const message=await getSchoolEmail(ctx,req.params.messageId);
      await logAuditEvent(req,{actionType:'school_portal_email_viewed',agencyId:ctx.agencyId,metadata:{schoolOrganizationId:ctx.orgId,messageId:message.id}});
      res.json(message);
    }),
    read: run(async (req,res,ctx) => {await markSchoolEmailRead(ctx,req.params.messageId);res.json({ok:true});}),
    send: run(async (req,res,ctx) => {
      const result=await sendSchoolEmail(ctx,req.body);
      await logAuditEvent(req,{actionType:'school_portal_email_sent',agencyId:ctx.agencyId,metadata:{schoolOrganizationId:ctx.orgId,messageId:result.messageId}});
      res.json(result);
    }),
    attachment: run(async (req,res,ctx) => {
      await getSchoolEmail(ctx,req.params.messageId);
      const [[row]]=await pool.execute('SELECT * FROM communication_attachments WHERE id=? AND message_id=?',[req.params.attachmentId,req.params.messageId]);
      if(!row) return res.status(404).json({error:{message:'Attachment not found.'}});
      const buffer=await readCommunicationAttachment(row);
      res.set('X-Content-Type-Options','nosniff');
      res.attachment(String(row.filename||'attachment').replace(/[\r\n/\\\x00-\x1f]/g,'_').slice(0,180));
      res.type('application/octet-stream').send(buffer);
    })
  };
}
