import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NoteAidStartPage from '../NoteAidStartPage.vue';

const mountStart = props => mount(NoteAidStartPage, { props, global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });

describe('Note Workspace temporary generator entry', () => {
  it('places the prominent central generator link before the existing workspace actions', () => {
    const wrapper = mountStart({ therapyNotesGeneratorPath: '/nlu/therapy-notes-generator' });
    const entry = wrapper.find('.na-start-generator');
    expect(entry.attributes('href')).toBe('/nlu/therapy-notes-generator');
    expect(entry.text()).toContain('THERAPY NOTES AI NOTE GENERATOR');
    expect(wrapper.html().indexOf('na-start-generator')).toBeLessThan(wrapper.html().indexOf('na-start-actions'));
    expect(wrapper.findAll('.na-start-actions button')).toHaveLength(3);
    expect(wrapper.text()).toContain('Create New Note');
    wrapper.unmount();
  });

  it('removes only the temporary link when it is disabled', () => {
    const wrapper = mountStart({ therapyNotesGeneratorPath: '' });
    expect(wrapper.find('.na-start-generator').exists()).toBe(false);
    expect(wrapper.findAll('.na-start-actions button')).toHaveLength(3);
    wrapper.unmount();
  });
});
