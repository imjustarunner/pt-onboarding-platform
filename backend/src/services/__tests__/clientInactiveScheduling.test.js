import { describe,expect,it,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {assertClientNotTerminated} from '../clientSchedulingGuard.service.js';
describe('inactive enrollment cannot be booked',()=>{
 it.each([{client_status_key:'inactive'},{client_status_key:'archived'},{status:'ARCHIVED'},{client_status_key:'terminated'},{client_status_key:'dead'}])('blocks closed client %j',client=>{
  expect(()=>assertClientNotTerminated(client)).toThrow(expect.objectContaining({status:409,code:'CLIENT_TERMINATED'}));
 });
 it('allows an active enrollment',()=>expect(()=>assertClientNotTerminated({status:'ACTIVE',client_status_key:'being_seen'})).not.toThrow());
});
