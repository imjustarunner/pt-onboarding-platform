import {beforeEach,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../chatEncryption.service.js',()=>({decryptChatText:vi.fn(e=>e.cipher)}));
import pool from '../../config/database.js';
import {listMyCommunicationAgreements,getMyCommunicationAgreement,communicationAgreementPdf} from '../staffCommunicationAgreementCopies.service.js';
import {staffCommunicationAgreement} from '../../utils/staffCommunicationAgreement.js';
const reference='staff_communications:11111111-1111-4111-8111-111111111111';
let signed;
beforeEach(()=>{
 vi.clearAllMocks();
 const disclosure={version:'signed-version',brandName:'ITSCO',legalName:'ITSCO, LLC',text:'Signed wording',future:'Not active',choices:[{key:'notifications',label:'Reminders',description:'Optional'}],agreement:staffCommunicationAgreement('ITSCO')};
 signed={disclosure,disclosureHash:createHash('sha256').update(JSON.stringify(disclosure)).digest('hex'),reviewedAt:'2026-10-08T12:00:00Z',signerName:'Example Staff',choices:{notifications:false},usageAcknowledged:true};
 pool.execute.mockImplementation(async(sql,args)=>[args[0]===7?[{details:JSON.stringify({reference,agencyId:2,envelope:{cipher:JSON.stringify(signed)}})}]:[]]);
});
it('preserves exact signed versions and requires authenticated ownership',async()=>{
 const copy=await getMyCommunicationAgreement(7,reference);expect(copy.disclosure.version).toBe('signed-version');
 expect(copy.disclosure.text).toBe('Signed wording');
 expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'),[7,reference]);
 await expect(getMyCommunicationAgreement(8,reference)).rejects.toMatchObject({status:404});
 expect((await listMyCommunicationAgreements(7))[0]).toMatchObject({reference,signerName:'Example Staff'});
 expect(await listMyCommunicationAgreements(8)).toEqual([]);
});
it('rejects malformed references and altered signed disclosures',async()=>{
 await expect(getMyCommunicationAgreement(7,'anything')).rejects.toMatchObject({status:404});expect(pool.execute).not.toHaveBeenCalled();
 signed.disclosure.text='Changed';await expect(getMyCommunicationAgreement(7,reference)).rejects.toMatchObject({status:503});
});
it('produces a readable multipage signed PDF and supports earlier choice-only signatures',async()=>{
 const bytes=await communicationAgreementPdf({...signed,reference});
 const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThan(1);
 delete signed.disclosure.agreement;
 expect((await PDFDocument.load(await communicationAgreementPdf({...signed,reference}))).getPageCount()).toBeGreaterThan(0);
});
