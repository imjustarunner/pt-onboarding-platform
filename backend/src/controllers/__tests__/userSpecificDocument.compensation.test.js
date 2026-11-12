import {beforeEach, describe, expect, it, vi} from 'vitest';

const m = vi.hoisted(() => ({execute:vi.fn(), find:vi.fn(), create:vi.fn(), update:vi.fn(), remove:vi.fn(), saveFile:vi.fn(), deleteFile:vi.fn()}));
vi.mock('../../config/database.js', () => ({default:{execute:m.execute}}));
vi.mock('../../models/UserSpecificDocument.model.js', () => ({default:{findById:m.find, create:m.create, update:m.update, delete:m.remove}}));
vi.mock('../../services/storage.service.js', () => ({default:{saveUserSpecificDocument:m.saveFile, deleteUserSpecificDocument:m.deleteFile}}));
import {createUserSpecificDocument, updateUserSpecificDocument, deleteUserSpecificDocument} from '../userSpecificDocument.controller.js';

let req, res, next;
beforeEach(() => {
  vi.clearAllMocks();
  req = {user:{id:1435,role:'admin'}, params:{id:'501'}, body:{userId:'1771',taskId:'601',name:'QA agreement',htmlContent:'<p>Changed terms</p>'}};
  res = {status:vi.fn().mockReturnThis(),json:vi.fn()}; next=vi.fn();
  m.find.mockResolvedValue({id:501,task_id:601,user_id:1771,template_type:'html',html_content:'<p>Released terms</p>',file_path:'synthetic/original.pdf'});
  m.execute.mockResolvedValue([[{id:701}]]);
  m.update.mockResolvedValue({id:501}); m.create.mockResolvedValue({id:502});
  m.saveFile.mockResolvedValue({relativePath:'synthetic/replacement.pdf'});
});

describe('issued compensation sources stay immutable through generic document APIs', () => {
  it('rejects HTML replacement of an issued agreement regardless of its signature stage', async () => {
    await updateUserSpecificDocument(req,res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
    expect(m.update).not.toHaveBeenCalled(); expect(m.saveFile).not.toHaveBeenCalled(); expect(m.deleteFile).not.toHaveBeenCalled();
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('cg.user_specific_document_id=? OR cg.task_id=?'),[501,601,601]);
  });
  it('rejects a PDF replacement before uploading or deleting the prior source',async () => {
    req.file={buffer:Buffer.from('synthetic'),originalname:'qa.pdf'};
    await updateUserSpecificDocument(req,res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
    expect(m.saveFile).not.toHaveBeenCalled(); expect(m.deleteFile).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it('rejects deletion without removing the retained file or document',async () => {
    await deleteUserSpecificDocument(req,res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
    expect(m.deleteFile).not.toHaveBeenCalled();expect(m.remove).not.toHaveBeenCalled();
  });
  it('rejects a second generic source for an already issued compensation task',async () => {
    await createUserSpecificDocument(req,res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
    expect(m.create).not.toHaveBeenCalled();expect(m.saveFile).not.toHaveBeenCalled();
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining("document_action_type='countersignature'"),[null,601,601]);
  });
  it('does not bypass the normal administrator permission check',async () => {
    req.user.role='staff'; await updateUserSpecificDocument(req,res,next);
    expect(res.status).toHaveBeenCalledWith(403);expect(m.execute).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
  });
  it('fails closed when compensation provenance cannot be checked',async () => {
    m.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await deleteUserSpecificDocument(req,res,next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'database unavailable'}));expect(m.remove).not.toHaveBeenCalled();expect(m.deleteFile).not.toHaveBeenCalled();
  });
  it('keeps ordinary unrelated document editing available',async () => {
    m.execute.mockResolvedValueOnce([[]]);await updateUserSpecificDocument(req,res,next);
    expect(next).not.toHaveBeenCalled();expect(m.update).toHaveBeenCalledWith('501',expect.objectContaining({htmlContent:'<p>Changed terms</p>',templateType:'html'}));
  });
  it('keeps ordinary unrelated document creation available',async () => {
    m.execute.mockResolvedValueOnce([[]]);await createUserSpecificDocument(req,res,next);
    expect(next).not.toHaveBeenCalled();expect(m.create).toHaveBeenCalledOnce();expect(res.status).toHaveBeenCalledWith(201);
  });
});
