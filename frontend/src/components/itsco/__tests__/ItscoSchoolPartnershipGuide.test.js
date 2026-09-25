import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Guide from '../ItscoSchoolPartnershipGuide.vue';

describe('school partnership guide',()=>{
 it('offers the same four-page PDF for viewing and downloading with distinct tracking',()=>{
  const wrapper=mount(Guide);
  const view=wrapper.get('[data-analytics-kind="document_view"]');
  const download=wrapper.get('[data-analytics-kind="document_download"]');
  expect(view.attributes('href')).toBe('/assets/itsco/ITSCO-School-Partnership-Guide.pdf');
  expect(download.attributes('href')).toBe(view.attributes('href'));
  expect(view.attributes('target')).toBe('_blank');expect(view.text()).toContain('opens a new tab');
  expect(download.attributes('download')).toBe('ITSCO-School-Partnership-Guide.pdf');
  expect(wrapper.text()).toContain('4-page PDF');wrapper.unmount();
 });
});
