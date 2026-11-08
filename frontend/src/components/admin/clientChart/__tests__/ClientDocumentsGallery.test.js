import { expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Gallery from '../ClientDocumentsGallery.vue';
import api from '../../../../services/api';

vi.mock('../../../../services/api', () => ({ default: { get: vi.fn() } }));

it('labels session materials and disables unavailable downloads without calling the open endpoint', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/chart-artifacts') ? { artifacts: [
    { id: 'phi-1', kind: 'session_material', kindLabel: 'Session material', title: 'Pending worksheet', viewKey: 'phi-1', available: false },
    { id: 'phi-2', kind: 'session_material', kindLabel: 'Session material', title: 'Released worksheet', viewKey: 'phi-2', available: true }
  ] } : {} }));
  const wrapper = mount(Gallery, { props: { clientId: 42 } });
  await flushPromises();
  const cards = wrapper.findAll('.cdg-card');
  expect(cards[0].text()).toContain('Session material');
  expect(cards[0].text()).not.toContain('Signed form');
  expect(cards[0].find('button').attributes('disabled')).toBeDefined();
  expect(cards[1].find('button').attributes('disabled')).toBeUndefined();
  await cards[0].find('button').trigger('click');
  expect(api.get.mock.calls.every(([url]) => url.endsWith('/chart-artifacts') || url.endsWith('/records-copy-blocks'))).toBe(true);
  wrapper.unmount();
});

it('loads only authorized operational records for support and keeps unchecked paper unavailable',async()=>{
 api.get.mockClear();
 api.get.mockImplementation(async url=>({data:url.endsWith('/enrollment-receipts')?{}:url.endsWith('/school-roi-access')?{school_roi_signing:{completed_documents:[{id:17,signed_at:'2026-11-07'}]}}:url.endsWith('/paper-packet-processing')?{documents:[{id:18,scan_status:'pending'},{id:19,scan_status:'clean'}]}:{}}));
 const wrapper=mount(Gallery,{props:{clientId:42,operationalOnly:true,school:true,paperPacket:true}});await flushPromises();
 expect(api.get.mock.calls.map(([url])=>url)).toEqual(['/phi-documents/clients/42/enrollment-receipts','/clients/42/school-roi-access','/clients/42/paper-packet-processing']);
 const cards=wrapper.findAll('.cdg-card');expect(cards).toHaveLength(3);expect(cards[0].text()).toContain('Signed school ROI');expect(cards[1].find('button').exists()).toBe(false);expect(cards[2].find('button').attributes('disabled')).toBeUndefined();wrapper.unmount();
});
