import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Book from '../../handbook/WorkplaceHandbookBook.vue';
import source from '../../../../../backend/src/content/group-therapy-sop/shared.json';
describe('group psychotherapy resource reader', () => {
  it('searches the SOP and links sections without training or download controls', async () => {
    window.history.replaceState({}, '', '/itsco/library'); Element.prototype.scrollIntoView = vi.fn();
    const wrapper = mount(Book, { props: { handbook: { metadata: { ...source, sections: undefined }, sections: source.sections, version: { id: 99, version_number: 1 } }, answerQuestion: vi.fn() } });
    expect(wrapper.findAll('.outline-link')).toHaveLength(12);
    expect(wrapper.get('.handbook-assistant summary').text()).toContain('Ask the group psychotherapy SOP');
    await wrapper.get('input[type=search]').setValue('one person');
    const link = wrapper.findAll('.outline-link').find(b => b.text().includes('Attendance'));
    expect(link).toBeDefined(); await link.trigger('click');
    expect(window.location.hash).toBe('#group-psychotherapy-sop-attendance-and-scheduling');
    expect(wrapper.find('a[download]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Take quiz'); wrapper.unmount();
  });
});
