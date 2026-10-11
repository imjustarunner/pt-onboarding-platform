import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
const mocks=vi.hoisted(()=>({ read:vi.fn(), unlock:vi.fn(), revoke:vi.fn() }));
vi.mock('../../services/officeKioskAccess.service.js',()=>({readOfficeDevice:mocks.read,unlockOffice:mocks.unlock,revokeToken:mocks.revoke,kioskCookieName:()=> 'office-device',kioskCookieOptions:()=>({httpOnly:true,sameSite:'strict',path:'/'})}));
vi.mock('../auth.middleware.js',()=>({authenticate:(req,res,next)=>req.get('X-Test-Staff')==='yes'?next():res.status(401).json({error:'staff login required'}),requireKioskUser:(_req,_res,next)=>next()}));
vi.mock('../../controllers/officeSettings.controller.js',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../routes/officeSettings.routes.js',import.meta.url),'utf8');
  const names=source.match(/import \{([^{}]+)\} from '\.\.\/controllers\/officeSettings.controller.js';/)[1].split(',').map(n=>n.trim()).filter(Boolean);
  return Object.fromEntries(names.map(name=>[name,(_req,res)=>res.json({handler:name})]));
});
vi.mock('../../controllers/officeRoomPhotos.controller.js',()=>({listRoomPhotos:vi.fn(),uploadRoomPhoto:vi.fn(),deleteRoomPhoto:vi.fn(),setPrimaryRoomPhoto:vi.fn(),roomPhotoUpload:{single:()=>vi.fn()}}));
vi.mock('../../controllers/kiosk.controller.js',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../../routes/kiosk.routes.js',import.meta.url),'utf8');
  const names=source.match(/import \{([^{}]+)\} from '\.\.\/controllers\/kiosk.controller.js';/)[1].replace(/\/\/[^\n]*/g,'').split(',').map(n=>n.trim()).filter(Boolean);
  return Object.fromEntries(names.map(name=>[name,(_req,res)=>res.json({handler:name})]));
});
vi.mock('../../controllers/officeClientSubmissions.controller.js',()=>Object.fromEntries(['completeForms','listSubmissions','submissionClients','submissionSessions','attachSubmission','attachSeries','clientFeedback','clientFeedbackSummaries','submissionResponses'].map(name=>[name,(_req,res)=>res.json({handler:name})])));
vi.mock('../../services/officeLobby.service.js',()=>({lobbyLocation:async id=>({id}),officePeople:async()=>({people:[]}),lobbyProviderProfile:async()=>({profile:{}})}));
vi.mock('../../services/officeKioskSupport.service.js',()=>({submitOfficeSupport:async()=>({ok:true}),readOfficeSupport:async()=>({})}));
vi.mock('../rateLimiter.middleware.js',()=>({publicAgencySupportTicketLimiter:(_req,_res,next)=>next()}));
import kiosk from '../../routes/kiosk.routes.js';
import lobby from '../../routes/officeLobby.routes.js';
import access from '../../routes/officeKioskAccess.routes.js';
import offices from '../../routes/officeSettings.routes.js';
let server,base;
beforeAll(async()=>{const app=express();app.use(express.json(),cookieParser());app.use('/api/kiosk',kiosk);app.use('/api/public/office-lobby',lobby);app.use('/api/public/office-kiosk',access);app.use('/api/offices',offices);server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;});
afterAll(()=>new Promise(resolve=>server.close(resolve)));
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockImplementation(async token=>token==='valid'?{locationId:6}:null);mocks.unlock.mockResolvedValue({token:'a'.repeat(64),session:{locationId:6,locationName:'Denver'}});});
afterEach(()=>vi.unstubAllEnvs());
const routes=[['GET','/api/kiosk/6/providers-today'],['GET','/api/kiosk/6/office-directory'],['GET','/api/kiosk/6/providers/7/slots-today'],['GET','/api/kiosk/6/available-rooms'],['POST','/api/kiosk/6/reserve-by-pin'],['POST','/api/kiosk/6/checkin'],['POST','/api/kiosk/6/checkin/forms'],['GET','/api/public/office-lobby/6/people'],['GET','/api/public/office-lobby/6/providers/7'],['POST','/api/public/office-lobby/6/support']];
describe('real Express office route boundaries',()=>{
  it.each(['/api/kiosk/6/PROVIDERS-TODAY/','/api/KIOSK/6/OFFICE-DIRECTORY/','/api/public/office-lobby/6/PEOPLE/'])('does not bypass access checks with alternate route casing: %s',async path=>{expect((await fetch(base+path)).status).toBe(401);});
  it.each(routes)('blocks anonymous %s %s',async(method,path)=>{expect((await fetch(base+path,{method})).status).toBe(401);});
  it.each(routes)('allows scoped %s %s, but rejects another building',async(method,path)=>{
    const headers={Cookie:'office-device=valid'};
    expect((await fetch(base+path,{method,headers})).status).toBeLessThan(300);
    expect((await fetch(base+path.replace('/6/','/1/'),{method,headers})).status).toBe(403);
  });
  it.each(['/api/kiosk/client-checkins','/api/kiosk/client-feedback/1','/api/kiosk/6/checkins','/api/kiosk/me/context'])('does not turn a device into a staff session for %s',async path=>{
    expect((await fetch(base+path,{headers:{Cookie:'office-device=valid'}})).status).toBe(401);
  });
  it('ignores spoofed forwarding headers when the proxy is unverified',async()=>{
    vi.stubEnv('AUDIT_PROXY_MODE','unverified');
    const res=await fetch(base+'/api/public/office-kiosk/unlock',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.9'},body:JSON.stringify({code:'123456'})});
    expect(res.status).toBe(200);expect(mocks.unlock).toHaveBeenCalledWith('123456','127.0.0.1');
    expect(await res.json()).toEqual({locationId:6,locationName:'Denver'});
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');expect(res.headers.get('Set-Cookie')).toContain('SameSite=Strict');
  });
  it('uses the verified Google client IP rather than a caller-supplied prefix',async()=>{
    vi.stubEnv('AUDIT_PROXY_MODE','google_lb');vi.stubEnv('AUDIT_GOOGLE_LB_IPS','192.0.2.20');
    await fetch(base+'/api/public/office-kiosk/unlock',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.99, 203.0.113.7, 192.0.2.20'},body:JSON.stringify({code:'123456'})});
    expect(mocks.unlock).toHaveBeenCalledWith('123456','203.0.113.7');
  });
  it('rejects cross-origin setup before verifying a code',async()=>{
    const res=await fetch(base+'/api/public/office-kiosk/unlock',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({code:'123456'})});
    expect(res.status).toBe(403);expect(mocks.unlock).not.toHaveBeenCalled();
  });
  it.each([['POST','/api/offices/6/kiosk-access/rotate'],['DELETE','/api/offices/6/kiosk-access/devices/example']])('requires staff login and same-origin administration for %s %s',async(method,path)=>{
    expect((await fetch(base+path,{method})).status).toBe(401);
    expect((await fetch(base+path,{method,headers:{'X-Test-Staff':'yes',Origin:'https://evil.example'}})).status).toBe(403);
    expect((await fetch(base+path,{method,headers:{'X-Test-Staff':'yes',Origin:base}})).status).toBe(200);
  });
});
