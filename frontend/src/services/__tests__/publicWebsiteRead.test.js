import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../api',()=>({default:{get:vi.fn()}}));
let api,readPublicWebsite;
beforeEach(async()=>{vi.resetModules();sessionStorage.clear();api=(await import('../api')).default;api.get.mockReset();readPublicWebsite=(await import('../publicWebsiteRead')).readPublicWebsite;});
describe('public website reads',()=>{
 const url='/public/marketing-pages/itsco/website-data';
 it('deduplicates simultaneous reads and reuses recent public data across navigations',async()=>{
  api.get.mockResolvedValue({data:{providers:[]}});await Promise.all([readPublicWebsite(url),readPublicWebsite(url)]);await readPublicWebsite(url);expect(api.get).toHaveBeenCalledTimes(1);
  await readPublicWebsite(url,{force:true});expect(api.get).toHaveBeenCalledTimes(2);
 });
 it('does not cache errors or allow private endpoints',async()=>{
  api.get.mockRejectedValueOnce({response:{status:429}}).mockResolvedValueOnce({data:{providers:[]}});
  await expect(readPublicWebsite(url)).rejects.toMatchObject({response:{status:429}});await readPublicWebsite(url);expect(api.get).toHaveBeenCalledTimes(2);
  expect(()=>readPublicWebsite('/users/1')).toThrow('Unsupported');
 });
 it('expires session data and respects forced refresh after edits',async()=>{
  sessionStorage.setItem('public-website-v1:'+url,JSON.stringify({at:Date.now()-61000,data:{old:true}}));api.get.mockResolvedValue({data:{updated:true}});
  expect((await readPublicWebsite(url)).data).toEqual({updated:true});
 });
});
