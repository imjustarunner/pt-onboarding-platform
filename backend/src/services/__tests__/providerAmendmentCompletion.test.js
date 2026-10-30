import {it,expect,vi} from 'vitest';
import {providerAmendmentsComplete,syncProviderAmendmentCompletion} from '../providerAmendmentCompletion.service.js';
it('credits the employee signature without an agency countersignature or extra completion click',async()=>{
 const db={execute:vi.fn()},section={completed:false,status:'not_started'};
 await syncProviderAmendmentCompletion(db,{id:81},section,[{providerCompleted:true,status:'completed'}]);
 expect(section).toMatchObject({completed:true,status:'completed'});
 expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("'$.completionSource','employee_document_signature'"),[81]);
 expect(db.execute.mock.calls[0][0]).not.toContain('UPDATE signed_documents');
});
it('does not accept empty, unsigned or partially signed requirements',()=>{
 expect(providerAmendmentsComplete([])).toBe(false);
 expect(providerAmendmentsComplete([{status:'completed',providerCompleted:false}])).toBe(false);
 expect(providerAmendmentsComplete([{providerCompleted:true},{providerCompleted:false}])).toBe(false);
});
it('preview calculates progress without writing; locked receipts stay unchanged',async()=>{
 const db={execute:vi.fn()},section={completed:false};
 await syncProviderAmendmentCompletion(db,{id:81,previewOnly:true},section,[{providerCompleted:true}]);
 expect(section.completed).toBe(true);expect(db.execute).not.toHaveBeenCalled();
 await syncProviderAmendmentCompletion(db,{id:81,locked_at:'2026-10-29'},section,[]);
 expect(section.completed).toBe(true);expect(db.execute).not.toHaveBeenCalled();
});
