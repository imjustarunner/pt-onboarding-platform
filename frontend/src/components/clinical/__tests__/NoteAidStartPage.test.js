import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NoteAidStartPage from '../NoteAidStartPage.vue';

describe('Note Workspace start page', () => {
  it('keeps session documentation and the two queue actions available', async () => {
    const wrapper = mount(NoteAidStartPage, { props: { hasNextInProgress: true, hasNextInQueue: true } });
    try {
      const [create, inProgress, queued] = wrapper.findAll('.na-start-actions button');
      expect(create.text()).toContain('Choose a session to document');
      await create.trigger('click');
      await inProgress.trigger('click');
      await queued.trigger('click');
      expect(wrapper.emitted('create')).toHaveLength(1);
      expect(wrapper.emitted('next-in-progress')).toHaveLength(1);
      expect(wrapper.emitted('next-in-queue')).toHaveLength(1);
    } finally { wrapper.unmount(); }
  });
});
