import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
import {resolveProviderDisplayRole} from '../providerDisplayRole.service.js';
it('keeps job title separate and adds Candidate only for prelicensed staff',()=>{
 expect(resolveProviderDisplayRole({credential:'MA, LPCC',title:'Program Support Coordinator',display_label:'Counselor'})).toMatchObject({label:'Counselor',candidate:true,fixed:false});
 expect(resolveProviderDisplayRole({credential:'LPC-A'}).candidate).toBe(true);
 expect(resolveProviderDisplayRole({credential:'LPC',supervision_is_prelicensed:1}).candidate).toBe(false);
 expect(resolveProviderDisplayRole({credential:'Unlicensed Masters',supervision_is_prelicensed:1})).toMatchObject({label:'Unlicensed Masters',fixed:true,candidate:false});
 expect(resolveProviderDisplayRole({role:'facilitator',credential:'LPCC'})).toMatchObject({label:'Facilitator',fixed:true,candidate:false});
});
