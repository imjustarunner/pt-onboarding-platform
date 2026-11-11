import {expect,it,vi} from 'vitest';
import {createMobileCommentTransport} from '../sessionCommentTransport.js';
import {mobileLinkTarget,familySessionCommentQuery} from '../mobileLinks.js';
it('uses current primary device session for scoped requests, without credential/config overrides',async()=>{
 const http={get:vi.fn().mockResolvedValue({data:{}}),post:vi.fn().mockResolvedValue({data:{}})};let token='first';
 const api=createMobileCommentTransport({base:'/api/quick-view',http,headers:()=>({'X-Quick-View-Session':token})});
 await api.get('/secure-session-comments/today',{params:{timeZone:'America/Denver'},headers:{authorization:'untrusted'},withCredentials:false});
 expect(http.get).toHaveBeenCalledWith('/api/quick-view/secure-session-comments/today',expect.objectContaining({headers:{'X-Quick-View-Session':'first'},withCredentials:true}));
 token='second';await api.post('/secure-family-sharing-notice/ack',{agencyId:450});expect(http.post.mock.calls.at(-1)[2].headers['X-Quick-View-Session']).toBe('second');
 await api.get('/chat/threads/15/meta');expect(http.get.mock.calls.at(-1)[0]).toBe('/api/quick-view/chat/threads/15/meta');
 for(const path of ['/admin/users','https://outside.test','/chat/threads/15/messages','/secure-session-comments?agencyId=1','/chat/threads/15/meta#leak'])expect(()=>api.get(path)).toThrow();
 expect(()=>api.post('/chat/threads/15/meta',{})).toThrow();
});
it('forwards only closed409 acknowledgment metadata, never the rejected draft or session',async()=>{
 const listener=vi.fn();window.addEventListener('auricwell:family-sharing-notice-required',listener);
 const failure={response:{status:409,data:{error:{code:'FAMILY_SHARING_ACK_REQUIRED',agencyId:450,version:'2026-11-11',body:'PRIVATE'}}}};
 const api=createMobileCommentTransport({base:'/api/quick-view',http:{post:vi.fn().mockRejectedValue(failure)},headers:()=>({})});
 await expect(api.post('/secure-session-comments/appointments/15',{body:'PRIVATE'})).rejects.toBe(failure);
 expect(listener).toHaveBeenCalledTimes(1);expect(listener.mock.calls[0][0].detail).toEqual({agencyId:450,version:'2026-11-11'});window.removeEventListener('auricwell:family-sharing-notice-required',listener);
});
it('keeps morning and per-session links inside the mobile calendar and rejects other origins',()=>{
 const options={workspaceLoginUrl:'https://app.itsco.health/login'};
 expect(mobileLinkTarget('https://app.itsco.health/my-schedule?secureSessionComments=today',options)).toMatchObject({path:'/mobile/workspace',query:{view:'calendar',secureSessionComments:'today'}});
 expect(mobileLinkTarget('https://auricwell.com/mobile/workspace?view=calendar&secureCommentAppointmentId=15&secureCommentClientId=11',options)).toMatchObject({query:{view:'calendar',secureCommentAppointmentId:'15',secureCommentClientId:'11'}});
 expect(mobileLinkTarget('https://other.test/my-schedule?secureSessionComments=today',options)).toBeNull();
 expect(mobileLinkTarget('https://app.itsco.health/appointments?secureCommentAppointmentId=-1',options).query.secureCommentAppointmentId).toBeUndefined();
});

it('retains only authorized destination metadata across family authentication',()=>{
 expect(familySessionCommentQuery({secureCommentAppointmentId:'101',secureCommentClientId:'10',token:'SECRET',redirect:'https://outside.test'})).toEqual({panel:'appointments',secureCommentAppointmentId:'101',secureCommentClientId:'10',childId:'10'});
 expect(familySessionCommentQuery({secureCommentAppointmentId:'wrong',panel:'admin'})).toEqual({panel:'family'});
 expect(mobileLinkTarget('https://auricwell.com/my-portal?secureCommentAppointmentId=101&secureCommentClientId=10')).toMatchObject({query:{view:'calendar',secureCommentAppointmentId:'101',secureCommentClientId:'10'}});
});
