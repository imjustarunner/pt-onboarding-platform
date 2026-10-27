import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{getLink:vi.fn()}}));
vi.mock('../storage.service.js',()=>({default:{readObject:vi.fn()}}));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import StorageService from '../storage.service.js';
import { listEnrollmentCopies, downloadEnrollmentCopy } from '../guardianEnrollmentCopies.service.js';
const input={userId:10,clientId:20,agencyId:450};
beforeEach(()=>{vi.clearAllMocks();ClientGuardian.getLink.mockResolvedValue({access_enabled:1,relationship_type:'guardian',permissions_json:{}});pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT date')?[[{date_of_birth:'2020-01-01'}]]:[[{id:30,client_id:20,language_code:'en',bundle_pdf_path:'child.pdf',combined_pdf_path:'all.pdf',child_count:2}]]);StorageService.readObject.mockResolvedValue(Buffer.from('%PDF-synthetic'));});
it('lists the complete copy without exposing storage paths and downloads only the signer’s child-specific bundle',async()=>{
  const docs=await listEnrollmentCopies(input);expect(docs[0]).toMatchObject({submissionId:30,kind:'enrollment_copy',document_template_name:'Complete signed enrollment copy'});expect(JSON.stringify(docs)).not.toContain('child.pdf');
  expect((await downloadEnrollmentCopy({...input,submissionId:30})).body.toString()).toBe('%PDF-synthetic');
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('s.guardian_user_id=?'),[20,10,450,450,450]);
});
it('never substitutes the combined sibling bundle or a different submission',async()=>{
  pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT date')?[[{date_of_birth:'2020-01-01'}]]:[[{id:30,bundle_pdf_path:'all.pdf',combined_pdf_path:'all.pdf',child_count:2}]]);
  expect(await listEnrollmentCopies(input)).toEqual([]);await expect(downloadEnrollmentCopy({...input,submissionId:31})).rejects.toMatchObject({status:404});expect(StorageService.readObject).not.toHaveBeenCalled();
});
it.each([{access_enabled:0},{access_enabled:1,permissions_json:{canViewDocs:false}},{access_enabled:1,permissions_json:{noView:true}}])('checks document relationship permission before looking up copies',async link=>{ClientGuardian.getLink.mockResolvedValue(link);await expect(listEnrollmentCopies(input)).rejects.toMatchObject({status:403});expect(pool.execute).not.toHaveBeenCalled();});
it('does not disclose an adult child’s old enrollment to a guardian',async()=>{pool.execute.mockResolvedValueOnce([[{date_of_birth:'1990-01-01'}]]);await expect(listEnrollmentCopies(input)).rejects.toMatchObject({status:403});expect(StorageService.readObject).not.toHaveBeenCalled();});
