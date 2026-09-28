import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import OpenSlotPlusOfficeRequestBody from '../OpenSlotPlusOfficeRequestBody.vue';

describe('published appointment formats', () => {
  it('allows virtual availability without an office and requires a reservation for in-person', () => {
    const wrapper = mount(OpenSlotPlusOfficeRequestBody);
    const [virtual, inPerson] = wrapper.findAll('fieldset input');
    expect(virtual.element.checked).toBe(true);
    expect(inPerson.element.disabled).toBe(true);
    expect(wrapper.text()).toContain('Reserve an office first');
  });
  it('lets staff select either or both formats on an office reservation', async () => {
    const wrapper = mount(OpenSlotPlusOfficeRequestBody, { props: { canLinkOffice: true } });
    const [virtual, inPerson] = wrapper.findAll('fieldset input');
    await inPerson.setValue(true);
    await virtual.setValue(false);
    expect(wrapper.emitted('update:inPersonEnabled')).toEqual([[true]]);
    expect(wrapper.emitted('update:virtualEnabled')).toEqual([[false]]);
  });
});
