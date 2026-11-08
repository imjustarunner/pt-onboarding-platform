import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/IntakeSubmissionDocument.model.js', () => ({ default: { listSignedForClient: vi.fn() } }));
vi.mock('../../services/storage.service.js', () => ({ default: { getSignedUrl: vi.fn() } }));
vi.mock('../../services/auditEvent.service.js', () => ({ logAuditEvent: vi.fn() }));
import Client from '../../models/Client.model.js';
import User from '../../models/User.model.js';
import Documents from '../../models/IntakeSubmissionDocument.model.js';
import Storage from '../../services/storage.service.js';
import { logAuditEvent } from '../../services/auditEvent.service.js';
import { viewClientSignedSchoolRoi, listClientSchoolRoiAccess } from '../clientSchoolRoiAccess.controller.js';
vi.mock('../../models/ClientSchoolStaffRoiAccess.model.js',()=>({default:{listSchoolStaffRosterForClient:vi.fn(async()=>[])},getEffectiveSchoolStaffRoiState:vi.fn(),isRoiExpired:vi.fn(()=>false)}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn(async()=>[{guardian_user_id:21,email:'second@example.test'}])}}));
vi.mock('../../models/IntakeLink.model.js',()=>({default:{findByScope:vi.fn(async()=>[{id:10,is_active:1,form_type:'smart_school_roi'}])}}));
vi.mock('../../models/SchoolRoiIntakeLinkConfig.model.js',()=>({default:{findBySchoolOrganizationId:vi.fn(async()=>null)}}));
vi.mock('../../models/ClientSchoolRoiSigningLink.model.js',()=>({default:{findForClient:vi.fn(async()=>null)}}));
vi.mock('../../services/paperPacketVision.service.js',()=>({getLatestPaperPacketVisionEval:vi.fn(async()=>null)}));
import pool from '../../config/database.js';
let req, res, next;
beforeEach(() => {
  vi.resetAllMocks();
  req = { params: { id: '4', documentId: '9' }, user: { id: 8, role: 'support' } };
  res = { status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
  Client.findById.mockResolvedValue({ id: 4, agency_id: 2, client_type: 'school' });
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  Documents.listSignedForClient.mockResolvedValue([{ id: 9, client_id: 4, signed_at: '2026-11-08T05:21:49Z', signed_pdf_path: 'roi.pdf', audit_trail: { smartSchoolRoi: true } }]);
  Storage.getSignedUrl.mockResolvedValue('https://storage.example.test/scoped-roi');
});
it('lets authorized support view the stored signed ROI without issuing a signing request', async () => {
  await viewClientSignedSchoolRoi(req, res, next);
  expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ url: 'https://storage.example.test/scoped-roi' });
  expect(Documents.listSignedForClient).toHaveBeenCalledWith(4);
  expect(logAuditEvent).toHaveBeenCalledWith(req, expect.objectContaining({ actionType: 'school_roi_document_viewed' }));
});
it.each(['school_staff', 'client_guardian', 'provider'])('does not expose the support document route to %s', async role => {
  req.user.role = role;await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);expect(Storage.getSignedUrl).not.toHaveBeenCalled();
});
it('rejects another agency before reading its signed documents', async () => {
  User.getAgencies.mockResolvedValue([{ id: 3 }]);await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(403);expect(Documents.listSignedForClient).not.toHaveBeenCalled();
});
it.each([
  { rows: [] }, { rows: [{ id: 9, signed_at: '2026-11-08', signed_pdf_path: 'clinical.pdf', document_template_name: 'Assessment' }] },
  { rows: [{ id: 9, signed_pdf_path: 'unsigned.pdf', audit_trail: { smartSchoolRoi: true } }] }
])('rejects missing, clinical and unsigned documents', async ({ rows }) => {
  Documents.listSignedForClient.mockResolvedValue(rows);await viewClientSignedSchoolRoi(req, res, next);
  expect(res.status).toHaveBeenCalledWith(404);expect(Storage.getSignedUrl).not.toHaveBeenCalled();
});

it('returns signed evidence and the second guardian’s pending response through the complete status endpoint',async()=>{
 Client.findById.mockResolvedValue({id:4,agency_id:2,organization_id:3,client_type:'school'});
 pool.execute.mockResolvedValue([[{invited_email:'second@example.test',status:'pending',expires_at:'2099-01-01T00:00:00Z'}]]);
 await listClientSchoolRoiAccess(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('co_guardian_invites'),[4,2]);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({guardian_emails:[expect.objectContaining({guardian_user_id:21,enrollment_status:'pending'})],school_roi_signing:expect.objectContaining({completed_documents:[expect.objectContaining({id:9})]})}));
});
