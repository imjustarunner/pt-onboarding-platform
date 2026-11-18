import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
import api from '../../../services/api';
import Downloads from '../ClinicalRecordDownloads.vue';
import { RECORD_DOWNLOAD_NOTICE_VERSION } from '../../../utils/recordDownloadNotice';
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(false);});
afterEach(()=>vi.restoreAllMocks());
it('shows the confidentiality warning before any record request and honors cancellation',async()=>{
 const wrapper=mount(Downloads,{props:{agencyId:2,noteId:3,clientId:4}});await wrapper.findAll('button')[0].trigger('click');
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('outside the platform’s access controls'));expect(api.get).not.toHaveBeenCalled();
});
it('adds the notice version when the user confirms and keeps the record scope',async()=>{
 window.confirm.mockReturnValue(true);api.get.mockRejectedValue(new Error('Synthetic transport failure'));
 const wrapper=mount(Downloads,{props:{agencyId:2,noteId:3,clientId:4}});await wrapper.findAll('button')[0].trigger('click');await flushPromises();
 expect(api.get).toHaveBeenCalledWith('/medical-billing/notes/3/pdf',expect.objectContaining({responseType:'blob',headers:{'X-Record-Download-Notice':RECORD_DOWNLOAD_NOTICE_VERSION},params:expect.objectContaining({agencyId:2})}));
 expect(wrapper.get('[role=alert]').text()).toContain('could not be prepared');
});
