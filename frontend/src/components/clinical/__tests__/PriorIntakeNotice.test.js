import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import Notice from '../PriorIntakeNotice.vue';
it('warns about earlier signed intakes for this client without blocking a new assessment', async () => {
  const w=mount(Notice,{props:{clientId:2272,clinicalSessionId:192,sessions:[
    {noteId:74,clientId:2272,clinicalSessionId:123,serviceCode:'90791',dateOfService:'2026-10-27'},
    {noteId:91,clientId:2272,clinicalSessionId:192,serviceCode:'90791'},
    {noteId:80,clientId:2273,clinicalSessionId:180,serviceCode:'90791'},
    {noteId:81,clientId:2272,clinicalSessionId:181,serviceCode:'90837'}
  ]}});
  expect(w.text()).toContain('Note #74');expect(w.text()).toContain('2026-10-27');expect(w.text()).toContain('Continue when a new assessment is appropriate');
  expect(w.text()).not.toMatch(/#91|#80|#81/);expect(w.find('button').exists()).toBe(false);
  await w.setProps({clientId:999});expect(w.find('aside').exists()).toBe(false);w.unmount();
});
