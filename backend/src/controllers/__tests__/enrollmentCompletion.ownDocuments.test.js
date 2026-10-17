import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: vi.fn() } }));
vi.mock('../../services/guardianWaivers.service.js', () => ({ isClientAdultLockedForGuardian: vi.fn() }));
vi.mock('../../services/storage.service.js', () => ({ default: { getSignedUrl: vi.fn() } }));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import StorageService from '../../services/storage.service.js';
import { isClientAdultLockedForGuardian } from '../../services/guardianWaivers.service.js';
import { getMyClientIntakeSignedDocumentDownloadUrl, listMyClientIntakeSignedDocuments } from '../guardianPortal.controller.js';
let req,res,next;
beforeEach(() => {
  vi.clearAllMocks();
  req = { user:{id:12},params:{clientId:'4',documentId:'9'} };
  res = {status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();
  ClientGuardian.getLink.mockResolvedValue({access_enabled:1,permissions_json:{canViewDocs:true}});
  isClientAdultLockedForGuardian.mockResolvedValue(false);
  StorageService.getSignedUrl.mockResolvedValue('https://storage.example.test/own-signed.pdf');
  pool.execute.mockImplementation(async sql => {
    if(sql.includes('SELECT guardian_user_id'))return [[{guardian_user_id:12}]];
    if(sql.includes('WHERE id = ? LIMIT 1'))return [[{id:9,client_id:4,intake_submission_id:20,signed_pdf_path:'own.pdf'}]];
    return [[]];
  });
});
it('allows a guardian to retrieve their own signed enrollment without requiring general clinical chart access',async()=>{
  await getMyClientIntakeSignedDocumentDownloadUrl(req,res,next);
  expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({filename:'own.pdf'}));
});
it('denies another parent’s submission even when the same child is linked to both',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('SELECT guardian_user_id')?[[{guardian_user_id:99}]]:[[{id:9,client_id:4,intake_submission_id:20,signed_pdf_path:'other.pdf'}]]);
  await getMyClientIntakeSignedDocumentDownloadUrl(req,res,next);
  expect(res.status).toHaveBeenCalledWith(403);expect(StorageService.getSignedUrl).not.toHaveBeenCalled();
});
it('preserves revoked relationship and explicit document restrictions',async()=>{
  for(const link of [{access_enabled:0},{access_enabled:1,permissions_json:{noView:true}},{access_enabled:1,permissions_json:{canViewDocs:false}}]){
    ClientGuardian.getLink.mockResolvedValue(link);
    await getMyClientIntakeSignedDocumentDownloadUrl(req,res,next);
    expect(res.status).toHaveBeenCalledWith(403);
  }
  expect(StorageService.getSignedUrl).not.toHaveBeenCalled();
});
it('includes generated agreements with no template ID in the own-submission listing',async()=>{
  pool.execute.mockImplementation(async sql=>sql.includes('SELECT 1')?[[{ok:1}]]:sql.includes('FROM intake_submission_documents')?[[{id:9,document_template_id:null,document_template_name:'Signed enrollment agreement'}]]:[[]]);
  await listMyClientIntakeSignedDocuments(req,res,next);
  expect(res.json).toHaveBeenCalledWith({documents:[expect.objectContaining({id:9,document_template_id:null})]});
  const [query,params]=pool.execute.mock.calls.find(([sql])=>sql.includes('FROM intake_submission_documents'));
  expect(query).toContain('LEFT JOIN document_templates');expect(query).toContain('s.guardian_user_id = ?');expect(params).toEqual([4,12]);
});
