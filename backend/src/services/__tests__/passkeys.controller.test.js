import {beforeEach,describe,it,expect,vi} from 'vitest';
import jwt from 'jsonwebtoken';
const mocks=vi.hoisted(()=>({finish:vi.fn(),proof:vi.fn(),session:vi.fn(),record:vi.fn(),agencies:vi.fn()}));
vi.mock('../passkeys.service.js',()=>({PASSKEY_COOKIE:'ptPasskeyChallenge',currentPasskeySite:()=>({origin:'https://portal.example.org',rpID:'portal.example.org'}),finishPasskeyAuthentication:mocks.finish,recordPasskeyLoginProof:mocks.proof}));
vi.mock('../sessionSecurity.service.js',()=>({getSessionSecurity:mocks.session}));
vi.mock('../personalSessionHistory.service.js',()=>({recordAccountSession:mocks.record}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:mocks.agencies}}));
vi.mock('../../config/config.js',()=>({default:{jwt:{secret:'synthetic-passkeys-controller-test-secret'},authCookie:{set:()=>({httpOnly:true,secure:true,sameSite:'none'}),clear:()=>({httpOnly:true,secure:true,sameSite:'none'})}}}));
import {loginVerify} from '../../controllers/passkeys.controller.js';
const user={id:1,email:'guardian@example.invalid',role:'client_guardian',status:'ACTIVE_EMPLOYEE'};
const fixture=()=>({req:{method:'POST',get:()=> '1',body:{},auditIdentify:vi.fn()},res:{set:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn(),cookie:vi.fn(),clearCookie:vi.fn()},next:vi.fn()});
beforeEach(()=>{vi.resetAllMocks();mocks.finish.mockResolvedValue({user,credentialId:7});mocks.session.mockResolvedValue({key:'verified-session'});mocks.agencies.mockResolvedValue([{id:2}]);});
describe('passkey cookie session issuance',()=>{
 it('issues a new HttpOnly session with verified passkey provenance and no bearer token in the response',async()=>{const {req,res,next}=fixture();await loginVerify(req,res,next);expect(next).not.toHaveBeenCalled();const [name,token,options]=res.cookie.mock.calls[0];expect(name).toBe('authToken');expect(options).toMatchObject({httpOnly:true,secure:true,maxAge:43200000});const claims=jwt.verify(token,'synthetic-passkeys-controller-test-secret');expect(claims).toMatchObject({id:1,authMethod:'passkey',passkeyId:7});expect(claims.sessionId).toBeTruthy();expect(mocks.proof).toHaveBeenCalledWith(req,7);expect(req.auditIdentify).toHaveBeenCalledWith(claims,'session_issued');expect(res.json.mock.calls[0][0].token).toBeUndefined();});
 it('caps the session at temporary account expiry',async()=>{mocks.finish.mockResolvedValue({user:{...user,status_expires_at:new Date(Date.now()+600000)},credentialId:7});const {req,res,next}=fixture();await loginVerify(req,res,next);expect(res.cookie.mock.calls[0][2].maxAge).toBeLessThanOrEqual(600000);});
 it('never issues a session after failed verification, including a required-SSO rejection',async()=>{mocks.finish.mockRejectedValue(Object.assign(new Error('Use Google'),{code:'SSO_REQUIRED',status:403}));const {req,res,next}=fixture();await loginVerify(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(res.cookie).not.toHaveBeenCalled();expect(mocks.proof).not.toHaveBeenCalled();});
 it('fails closed if the durable session proof cannot be saved',async()=>{mocks.proof.mockRejectedValue(new Error('storage unavailable'));const {req,res,next}=fixture();await loginVerify(req,res,next);expect(next).toHaveBeenCalled();expect(res.cookie).not.toHaveBeenCalled();});
 it('requires the custom anti-CSRF header',async()=>{const {req,res,next}=fixture();req.get=()=>null;await loginVerify(req,res,next);expect(res.status).toHaveBeenCalledWith(403);expect(mocks.finish).not.toHaveBeenCalled();});
});
