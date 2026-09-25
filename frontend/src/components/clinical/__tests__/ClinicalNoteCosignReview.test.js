import { mount,flushPromises } from '@vue/test-utils';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import ClinicalNoteCosignReview from '../ClinicalNoteCosignReview.vue';
import api from '../../../services/api.js';
vi.mock('../../../services/api.js',()=>({default:{get:vi.fn(),post:vi.fn()}}));
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{content:'Signed note and amendment',contentHash:'version-2'}});api.post.mockResolvedValue({data:{ok:true}});});
describe('amendment cosign review',()=>{
  it('requires opening and attesting to the exact version before signing',async()=>{
    const w=mount(ClinicalNoteCosignReview,{props:{noteId:4,agencyId:1,providerId:7}});
    await w.find('button').trigger('click');await flushPromises();
    expect(w.text()).toContain('Signed note and amendment');
    const sign=w.findAll('button').find(b=>b.text()==='Sign off');expect(sign.element.disabled).toBe(true);
    await w.find('input').setValue(true);await sign.trigger('click');await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/medical-billing/notes/4/cosign',{agencyId:1,contentHash:'version-2',reviewedAndApproved:true});expect(w.emitted('signed')).toHaveLength(1);w.unmount();
  });
  it('does not claim success when another amendment invalidates the version',async()=>{
    api.post.mockRejectedValue({response:{status:409,data:{error:{message:'Read the current note and addenda before cosigning.'}}}});
    const w=mount(ClinicalNoteCosignReview,{props:{noteId:4,agencyId:1,providerId:7}});
    await w.find('button').trigger('click');await flushPromises();await w.find('input').setValue(true);await w.findAll('button').find(b=>b.text()==='Sign off').trigger('click');await flushPromises();
    expect(w.find('[role=alert]').text()).toContain('Read the current');expect(w.emitted('signed')).toBeUndefined();expect(w.find('input').element.checked).toBe(false);w.unmount();
  });
});
