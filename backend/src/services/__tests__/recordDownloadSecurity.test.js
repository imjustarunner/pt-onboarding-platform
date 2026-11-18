import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/UserActivityLog.model.js',()=>({default:{logActivity:vi.fn()}}));
import UserActivityLog from '../../models/UserActivityLog.model.js';
import { logAuditEvent } from '../auditEvent.service.js';
import { isolatePrivatePdfPage } from '../privatePdfRendering.js';
beforeEach(()=>vi.clearAllMocks());
it('records the authenticated actor, client, scope and notice without record text',async()=>{
 UserActivityLog.logActivity.mockResolvedValue({id:10});
 await logAuditEvent({user:{id:44,sessionId:'test-session'},headers:{'user-agent':'test-browser'}},{required:true,agencyId:2,actionType:'clinical_note_pdf_exported',metadata:{clientId:11,noteId:12,noticeVersion:'record-download-2026-11-18'}});
 expect(UserActivityLog.logActivity).toHaveBeenCalledWith(expect.objectContaining({userId:44,agencyId:2,metadata:expect.objectContaining({clientId:11,noteId:12})}));
});
it('blocks release when a required audit insert fails or returns no retained event',async()=>{
 UserActivityLog.logActivity.mockRejectedValue(new Error('Synthetic database error'));
 await expect(logAuditEvent({user:{id:44}},{required:true,actionType:'clinical_note_pdf_exported'})).rejects.toMatchObject({status:503,code:'DOWNLOAD_AUDIT_UNAVAILABLE'});
 UserActivityLog.logActivity.mockResolvedValue(null);
 await expect(logAuditEvent({user:{id:44}},{required:true,actionType:'clinical_note_pdf_exported'})).rejects.toMatchObject({status:503});
});
it('disables scripts and rejects remote, local-file and websocket requests while allowing embedded images',async()=>{
 let handler;const page={setJavaScriptEnabled:vi.fn(),setRequestInterception:vi.fn(),on:vi.fn((event,callback)=>handler=callback)};
 await isolatePrivatePdfPage(page);expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);expect(page.setRequestInterception).toHaveBeenCalledWith(true);
 for(const url of ['https://tracker.invalid/a','http://localhost/a','file:///private/a','ws://localhost']){const request={url:()=>url,continue:vi.fn(),abort:vi.fn()};handler(request);expect(request.abort).toHaveBeenCalledOnce();expect(request.continue).not.toHaveBeenCalled();}
 const embedded={url:()=> 'data:image/png;base64,c2FtcGxl',continue:vi.fn(),abort:vi.fn()};handler(embedded);expect(embedded.continue).toHaveBeenCalledOnce();
});
