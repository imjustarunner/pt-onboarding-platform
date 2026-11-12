import {readFileSync} from 'node:fs';
import{expect,it,vi}from'vitest';vi.mock('../../config/database.js',()=>({default:{}}));import{schoolPaperProcessingNotificationFeed}from'../schoolPaperProcessingNotificationFeed.service.js';
it('exposes one stable processed-source notice from stored evidence without reprocessing or messaging',async()=>{const execute=vi.fn(async()=>[[{client_id:2483,document_id:4312,initials:'MikQap',original_name:'Fictional packet.pdf',processed_at:'2026-11-11T09:45:44Z',privateGuardian:'must-not-return'}]]);const first=await schoolPaperProcessingNotificationFeed({schoolOrganizationId:451,clientIds:[2483]},{execute}),second=await schoolPaperProcessingNotificationFeed({schoolOrganizationId:451,clientIds:[2483]},{execute});expect(first).toEqual(second);expect(first[0]).toMatchObject({id:'paper-processed:2483:4312',kind:'doc',client_id:2483,title:'Paper packet processed'});expect(first[0]).not.toHaveProperty('privateGuardian');const[sql,args]=execute.mock.calls[0];expect(sql).toContain('p.client_id=c.id AND p.agency_id=c.agency_id');expect(sql).toContain('p.removed_at IS NULL');expect(args).toEqual([451,2483]);expect(sql).not.toMatch(/UPDATE|INSERT/);});
it('does not query beyond an empty authorized school scope',async()=>{const execute=vi.fn();expect(await schoolPaperProcessingNotificationFeed({schoolOrganizationId:451,clientIds:[]},{execute})).toEqual([]);expect(execute).not.toHaveBeenCalled();});

it('honors the school document category before the actual controller queries processed packets',async()=>{
 const source=readFileSync(new URL('../../controllers/schoolPortal.controller.js',import.meta.url),'utf8');
 const start=source.indexOf('let paperPacketProcessed=[];'),end=source.indexOf('    const all = [',start);expect(start).toBeGreaterThan(0);expect(end).toBeGreaterThan(start);
 const dispatch=new (Object.getPrototypeOf(async function(){}).constructor)('allowDocsLinks','canQueryScopedClients','schoolPaperProcessingNotificationFeed','orgId','hasScopedRole','scopedClientIds',source.slice(start,end)+'return paperPacketProcessed;');
 const feed=vi.fn(async()=>[{id:'paper-processed:2483:4312'}]);
 expect(await dispatch(false,true,feed,451,false,[])).toEqual([]);expect(feed).not.toHaveBeenCalled();
 expect(await dispatch(true,false,feed,451,true,[])).toEqual([]);expect(feed).not.toHaveBeenCalled();
 expect(await dispatch(true,true,feed,451,true,[2483])).toEqual([{id:'paper-processed:2483:4312'}]);expect(feed).toHaveBeenCalledWith({schoolOrganizationId:451,clientIds:[2483]});
});
