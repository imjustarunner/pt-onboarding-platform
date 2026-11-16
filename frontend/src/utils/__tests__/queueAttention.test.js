import { beforeEach,expect,it,vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { newQueueItems } from '../queueAttention';
beforeEach(()=>{localStorage.clear();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('TextEncoder',TextEncoder);});
it('quietly baselines an existing queue and alerts only new identities, including a same-count replacement',async()=>{
 const key='queue:user1:agency2:payroll';
 expect(await newQueueItems(localStorage,key,[{key:'pto:1'},{key:'pto:2'}])).toEqual([]);
 expect(await newQueueItems(localStorage,key,[{key:'pto:1'},{key:'pto:2'}])).toEqual([]);
 expect(await newQueueItems(localStorage,key,[{key:'pto:2'},{key:'pto:3'}])).toEqual([{key:'pto:3'}]);
 expect(await newQueueItems(localStorage,key,[{key:'pto:2'},{key:'pto:3'}])).toEqual([]);
});
it('keeps names and raw identifiers out of persistent browser storage and isolates accounts and agencies',async()=>{
 await newQueueItems(localStorage,'one',[{key:'application:123',name:'Private Candidate'}]);
 expect(localStorage.getItem('one')).not.toContain('Private');expect(localStorage.getItem('one')).not.toContain('123');
 expect(await newQueueItems(localStorage,'two',[{key:'application:999'}])).toEqual([]);
});
