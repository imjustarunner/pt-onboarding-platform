import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Upload from '../SessionCountImport.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{post:vi.fn(),get:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
it('requires a reviewed preview and sends the same file with its match snapshot, without financial import',async()=>{
 const preview={snapshot:'reviewed',summary:{matchedRows:2,reviewRows:1,excludedRows:0},rows:[{sourceRowNumber:2,clientId:12,providerUserId:9,serviceDate:'2026-07-02',serviceCode:'H0004'}],providers:[{id:9,name:'Test Provider'}],unmatchedProviders:[]};
 api.post.mockResolvedValueOnce({data:preview}).mockResolvedValueOnce({data:{importId:1}});api.get.mockResolvedValue({data:{imports:[{id:1,source_kind:'billing_count_upload',actor_user_id:99}]}});
 const w=mount(Upload,{props:{agencyId:2}});const file=new File(['synthetic'],'report.csv',{type:'text/csv'});Object.defineProperty(w.get('input').element,'files',{value:[file]});await w.get('input').trigger('change');
 expect(w.text()).not.toContain('Import matched count evidence');await w.findAll('button').find(b=>b.text()==='Preview session counts').trigger('click');await flushPromises();expect(w.text()).toContain('2 matched service rows');
 expect(api.post.mock.calls[0][1].get('action')).toBe('preview');await w.findAll('button').find(b=>b.text()==='Import matched count evidence').trigger('click');await flushPromises();expect(api.post.mock.calls[1][0]).toBe('/billing-reports/session-counts');expect(api.post.mock.calls[1][1].get('snapshot')).toBe('reviewed');expect(w.text()).toContain('Count import #1 saved');expect(w.emitted('imported')).toHaveLength(1);w.unmount();
});
