import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/config.js',()=>({default:{jwt:{secret:'unit-test-secret-that-is-not-used-outside-tests'}}}));
import jwt from 'jsonwebtoken';
import config from '../../config/config.js';
import {createRehearsalAccess,verifyRehearsalAccess,requireRehearsalAccess} from '../rehearsalAccess.service.js';
describe('private rehearsal capability',()=>{
 it('scopes a private link to one agency for 24 hours',()=>{const token=createRehearsalAccess(2,7),data=verifyRehearsalAccess(token);expect(data.agencyId).toBe(2);expect(data.scope).toBe('read-rehearsal');expect(data.exp-data.iat).toBe(86400);expect(()=>jwt.verify(token,config.jwt.secret)).toThrow();});
 it('rejects expired, tampered and normal login tokens',()=>{const token=createRehearsalAccess(2,7);expect(()=>verifyRehearsalAccess(token.slice(0,-8)+'tampered')).toThrow();expect(()=>verifyRehearsalAccess(jwt.sign({id:7,role:'super_admin'},config.jwt.secret))).toThrow();vi.useFakeTimers();vi.setSystemTime(Date.now()+86401*1000);expect(()=>verifyRehearsalAccess(token)).toThrow();vi.useRealTimers();});
 it('uses only the header and ignores agency claims in the body/query',()=>{const req={headers:{authorization:`Bearer ${createRehearsalAccess(2,7)}`},body:{agencyId:99},query:{agencyId:88}};const res={set:vi.fn()},next=vi.fn();requireRehearsalAccess(req,res,next);expect(req.rehearsalAccess.agencyId).toBe(2);expect(next).toHaveBeenCalledWith();});
 it('does not accept a token in a URL',()=>{const next=vi.fn();requireRehearsalAccess({headers:{},query:{token:createRehearsalAccess(2,7)}},{set:vi.fn()},next);expect(next.mock.calls[0][0].status).toBe(401);});
});
