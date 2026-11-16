import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn(),byId:vi.fn(),byPath:vi.fn(),create:vi.fn(),read:vi.fn(),bucket:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn(),configured:vi.fn(),scan:vi.fn(),queue:vi.fn(),audit:vi.fn(),save:vi.fn(),remove:vi.fn(),execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/ClientPhiDocument.model.js',()=>({default:{findByClientId:m.list,findById:m.byId,findByStoragePath:m.byPath,create:m.create}}));
vi.mock('../../models/PhiDocumentAuditLog.model.js',()=>({default:{create:m.audit}}));
vi.mock('../storage.service.js',()=>({default:{readObject:m.read,getGCSBucket:m.bucket,sanitizeFilename:value=>value}}));
vi.mock('../documentEncryption.service.js',()=>({default:{isConfigured:m.configured,encryptBuffer:m.encrypt,decryptPhiDocumentBuffer:m.decrypt,medicalHistoryAad:value=>JSON.stringify(value)}}));
vi.mock('../sessionMaterialScan.service.js',()=>({scanSessionMaterial:m.scan}));
vi.mock('../privatePacketScanJob.service.js',()=>({queuePrivatePacketScan:m.queue}));
vi.mock('../ehrHistoricalImportLock.service.js',()=>({withHistoricalImportLock:(_a,_c,_k,work)=>work()}));
vi.mock('pdf-lib',()=>({PDFDocument:{load:async()=>({getPageCount:()=>3})}}));
import {HISTORY_TYPE,listChartHistory,uploadChartHistory,viewChartHistory,scanPrivateChartHistory} from '../clientChartHistory.service';
const scope={agencyId:2,clientId:12},req={user:{id:10},body:{identityConfirmed:'true',documentTitle:'Synthetic history'},ip:'127.0.0.1'};
const doc=()=>({id:9,client_id:12,agency_id:2,document_type:HISTORY_TYPE,is_encrypted:1,storage_path:'private-chart-history/2/12/opaque.enc',scan_status:'clean',quarantine_path:null});
beforeEach(()=>{vi.resetAllMocks();m.configured.mockReturnValue(true);m.list.mockResolvedValue([doc()]);m.byId.mockResolvedValue(doc());m.encrypt.mockResolvedValue({encryptedBuffer:Buffer.from('ciphertext')});m.decrypt.mockResolvedValue(Buffer.from('%PDF-private'));m.read.mockResolvedValue(Buffer.from('ciphertext'));m.scan.mockResolvedValue({status:'pending'});m.create.mockResolvedValue({...doc(),scan_status:'pending'});m.bucket.mockResolvedValue({file:()=>({save:m.save,delete:m.remove})});});
it('returns only private archive metadata without storage locations or encryption keys',async()=>{const docs=await listChartHistory(scope);expect(docs).toHaveLength(1);expect(JSON.stringify(docs)).not.toContain('storage_path');expect(JSON.stringify(docs)).not.toContain('opaque.enc');});
it('saves ciphertext only and queues a private scan without making a pending file viewable',async()=>{
 const file={buffer:Buffer.from('%PDF-private bytes'),mimetype:'application/pdf',originalname:'history.pdf'};
 await uploadChartHistory(req,scope,file);expect(m.save).toHaveBeenCalledWith(Buffer.from('ciphertext'),expect.objectContaining({contentType:'application/octet-stream'}));expect(m.create).toHaveBeenCalledWith(expect.objectContaining({isEncrypted:true,documentType:HISTORY_TYPE,scanStatus:'pending',uploadedByUserId:10,schoolOrganizationId:null}));expect(m.queue).toHaveBeenCalledWith(expect.objectContaining({kind:'chart_history',clientId:12,actorId:10}));
 m.byId.mockResolvedValue({...doc(),scan_status:'pending'});await expect(viewChartHistory(req,scope,9)).rejects.toMatchObject({status:423});expect(m.read).not.toHaveBeenCalled();
});
it('fails closed if encryption is unavailable or the PDF identity is not confirmed',async()=>{
 m.configured.mockReturnValue(false);await expect(uploadChartHistory(req,scope,{buffer:Buffer.from('%PDF-test'),mimetype:'application/pdf'})).rejects.toMatchObject({status:503});expect(m.save).not.toHaveBeenCalled();
});
it.each([{client_id:99},{agency_id:3},{document_type:'school_staff_attachment'},{is_encrypted:0},{storage_path:'uploads/public.pdf'}])('blocks changed document scope before reading bytes %j',async change=>{m.byId.mockResolvedValue({...doc(),...change});await expect(viewChartHistory(req,scope,9)).rejects.toMatchObject({status:404});expect(m.read).not.toHaveBeenCalled();});
it('does not return decrypted PHI when durable access auditing fails',async()=>{m.audit.mockRejectedValue(Error('audit unavailable'));await expect(viewChartHistory(req,scope,9)).rejects.toThrow('audit unavailable');});
it('checks the private scanner lease and atomically clears quarantine only after a clean result',async()=>{
 const marker='private_scan_queued:1000000:abcd';m.byId.mockResolvedValue({...doc(),scan_status:'pending',scan_result:marker,quarantine_path:doc().storage_path});m.execute.mockResolvedValue([{affectedRows:1}]);const scan=vi.fn().mockResolvedValue({status:'clean'});
 expect(await scanPrivateChartHistory({clientId:12,documentId:9,marker},{scan})).toEqual({status:'clean'});expect(scan).toHaveBeenCalledWith(Buffer.from('%PDF-private'));expect(m.execute.mock.calls[0][1][3]).toBeNull();expect(m.execute.mock.calls[0][0]).toContain("scan_status='pending' AND scan_result=? AND storage_path=?");
});
it('refuses a stale scan lease before reading or decrypting a history file',async()=>{const scan=vi.fn();expect(await scanPrivateChartHistory({clientId:12,documentId:9,marker:'private_scan_queued:1000000:abcd'},{scan})).toEqual({status:'skipped'});expect(m.read).not.toHaveBeenCalled();});
