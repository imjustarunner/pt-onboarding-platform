import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {getStaffSignaturePreview} from '../staffHtmlEmailSignature.service.js';
it('does not return a staff signature, work email, or staff branding for a guardian account',async()=>{
 const result=await getStaffSignaturePreview({userId:20},{resolveContext:async()=>({eligible:false,email:'fabricated@agency.example',displayName:'Parent'})});
 expect(result).toEqual({eligible:false,enabled:false,html:null,text:null,fields:null});expect(JSON.stringify(result)).not.toContain('fabricated');
});
