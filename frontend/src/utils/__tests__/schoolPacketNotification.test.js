import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),open:vi.fn()}));
vi.mock('../../services/api',()=>({default:{get:m.get}}));
vi.mock('../openPrivateAttachment.js',()=>({openPrivateAttachment:m.open}));
import {openSchoolPacketNotification} from '../schoolPacketNotification.js';
beforeEach(()=>{vi.resetAllMocks();m.open.mockImplementation(async(load,_name,{isCurrent})=>isCurrent()?load({signal:new AbortController().signal}):{cancelled:true});});
it('opens the exact processed source through the existing private reader with its client binding',async()=>{
 const response={data:new Blob(['%PDF fictional']),headers:{'content-type':'application/pdf'}};m.get.mockResolvedValue(response);
 expect(await openSchoolPacketNotification({clientId:2553,documentId:4470})).toBe(response);
 expect(m.get).toHaveBeenCalledWith('/phi-documents/4470/view',expect.objectContaining({params:{clientId:2553},responseType:'blob'}));expect(m.get).toHaveBeenCalledOnce();
});
it('does not fall back to another packet when permission or exact source lookup fails',async()=>{
 m.get.mockRejectedValue({response:{status:403,data:{error:{message:'This ROI level only allows documents you uploaded'}}}});
 await expect(openSchoolPacketNotification({clientId:2553,documentId:4470})).rejects.toMatchObject({response:{status:403}});expect(m.get).toHaveBeenCalledOnce();
});
it.each([{clientId:0,documentId:4470},{clientId:2553,documentId:'latest'},{clientId:2553,documentId:-1}])('refuses an unbound source %j',async item=>{await expect(openSchoolPacketNotification(item)).rejects.toThrow('missing its client or document');expect(m.get).not.toHaveBeenCalled();});
it('does not use stale school or actor context',async()=>{expect(await openSchoolPacketNotification({clientId:2553,documentId:4470},{isCurrent:()=>false})).toEqual({cancelled:true});expect(m.get).not.toHaveBeenCalled();});
it('does not forward app credentials to a legacy signed storage URL',async()=>{
 m.get.mockResolvedValue({data:{url:'https://storage.googleapis.com/fictional-qa/packet.pdf'},headers:{'content-type':'application/json'}});
 const fetcher=vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['%PDF fake']),headers:new Headers({'content-type':'application/pdf'})});vi.stubGlobal('fetch',fetcher);
 try{const result=await openSchoolPacketNotification({clientId:2553,documentId:4470});expect(result.headers['content-type']).toBe('application/pdf');expect(fetcher).toHaveBeenCalledWith('https://storage.googleapis.com/fictional-qa/packet.pdf',expect.objectContaining({credentials:'omit'}));expect(fetcher.mock.calls[0][1].headers).toBeUndefined();}finally{vi.unstubAllGlobals();}
});
