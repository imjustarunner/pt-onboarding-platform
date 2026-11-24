import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js',()=>({sendEmailFromIdentity:vi.fn()}));
vi.mock('../../models/EmailSenderIdentity.model.js',()=>({default:{}}));
import {canWorkPlotlineSupport} from '../plotlineSupportAccess.service.js';
import {plotlineSupportEmail} from '../plotlineSupportEmail.service.js';
import {requestLoggingMiddleware} from '../../middleware/requestLogging.middleware.js';
import {redactPrivateBillingUrl} from '../../utils/sanitizeRequest.js';
it('requires a current, active platform grant instead of company membership, hiring permission or ticket ownership',async()=>{
 const db={execute:vi.fn(async()=>[[]])};expect(await canWorkPlotlineSupport(1434,db)).toBe(false);
 expect(db.execute.mock.calls[0][0]).toContain('has_platform_support=1');expect(db.execute.mock.calls[0][0]).toContain('is_active=1');expect(db.execute.mock.calls[0][0]).not.toContain('user_agencies');
 db.execute.mockResolvedValue([[{id:7}]]);expect(await canWorkPlotlineSupport(7,db)).toBe(true);
});
it('brands replies as platform support with Plotline, PlotTwistCo and a clickable public support route',()=>{
 const out=plotlineSupportEmail('A reply <script>\nThanks.');expect(out.html).toContain('plotline-primary-transparent.png');expect(out.html).toContain('plottwistco-mark.png');expect(out.html).toContain('PLATFORM SUPPORT');expect(out.html).toContain('Operated by PlotTwistCo');expect(out.html).not.toContain('<script>');expect(out.text).toContain('https://plotlinepo.com/support');expect(out.html).not.toContain('>PEOPLE OPERATIONS</div>');
});
it('redacts private support messages and reference capabilities from logs',()=>{
 const token='a'.repeat(64);for(const path of [`/api/public/hiring/reference/${token}/support`,'/api/public/agency-support/plotline/platform']){
  const req={path,body:{name:'PRIVATE',email:'private@example.test',message:'PRIVATE'}};requestLoggingMiddleware(req,{},()=>{});expect(req.sanitizedBody).toBe('[PRIVATE PLOTLINE SUPPORT]');
 }
 expect(redactPrivateBillingUrl(`/api/public/hiring/reference/${token}/support?secret=x`)).toBe('/api/public/hiring/reference/[REDACTED]/support');
});


it('does not label queued or uncertain fallback delivery as sent',async()=>{
 const {sendWebsiteTicketReply}=await import('../publicWebsiteTicketReply.service.js');
 const ticket={id:501,agency_id:1,created_by_source_key:'plotline_platform_support',source_channel:'public_web',source_email_from:'qa@example.test'};
 const identities={findByAgencyAndIdentityKey:vi.fn(async()=>({id:22}))};
 for(const result of[{},{queued:true,communicationId:3},{id:'transport',pendingApproval:true},{id:'transport',redirected:true},{skipped:true}]){
  expect((await sendWebsiteTicketReply(ticket,'Reply',{identities,send:async()=>result})).sent).toBe(false);
 }
 expect((await sendWebsiteTicketReply(ticket,'Reply',{identities,send:async()=>({id:'transport'})})).sent).toBe(true);
});
