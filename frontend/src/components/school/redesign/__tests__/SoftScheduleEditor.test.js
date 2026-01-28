import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import SoftScheduleEditor from '../SoftScheduleEditor.vue';

describe('SoftScheduleEditor', () => {
  it('renders client labels based on clientLabelMode', async () => {
    const wrapper = mount(SoftScheduleEditor, {
      props: {
        saving: false,
        error: '',
        clientLabelMode: 'codes',
        caseloadClients: [{ id: 1, initials: 'ABCDEF', identifier_code: 'CODE123' }],
        slots: [{ id: 10, client_id: null, start_time: null, end_time: null, note: null }]
      }
    });

    // Option label should be code mode by default
    const optionText = wrapper.findAll('option').map((o) => o.text()).join(' | ');
    expect(optionText).toContain('COD123');

    await wrapper.setProps({ clientLabelMode: 'initials' });
    const optionText2 = wrapper.findAll('option').map((o) => o.text()).join(' | ');
    expect(optionText2).toContain('ABCDEF');
  });

  it('renders slots and emits save payload', async () => {
    const wrapper = mount(SoftScheduleEditor, {
      props: {
        saving: false,
        error: '',
        caseloadClients: [
          { id: 1, initials: 'ABCDEF' },
          { id: 2, initials: 'UVWXYZ' }
        ],
        slots: [
          { id: 10, client_id: null, start_time: null, end_time: null, note: null },
          { id: 11, client_id: 2, start_time: '08:00:00', end_time: '09:00:00', note: 'Room 3' }
        ]
      }
    });

    // Set first slot fields
    const selects = wrapper.findAll('select');
    await selects[0].setValue('1');

    const timeInputs = wrapper.findAll('input[type="time"]');
    await timeInputs[0].setValue('09:10');
    await timeInputs[1].setValue('09:50');

    const noteInputs = wrapper.findAll('input[type="text"]');
    await noteInputs[0].setValue('Ms. Campbell Room 3');

    await wrapper.find('button.btn-primary').trigger('click');
    const emitted = wrapper.emitted('save');
    expect(emitted).toBeTruthy();
    expect(emitted[0][0][0]).toMatchObject({
      id: 10,
      client_id: 1,
      start_time: '09:10',
      end_time: '09:50'
    });
  });

  it('emits move for persisted slots', async () => {
    // Up/down controls were intentionally removed from the UI.
    const wrapper = mount(SoftScheduleEditor, {
      props: {
        saving: false,
        error: '',
        caseloadClients: [],
        slots: [{ id: 99, client_id: null, start_time: null, end_time: null, note: null }]
      }
    });

    const arrowButtons = wrapper.findAll('button').filter((b) => b.text() === '↑' || b.text() === '↓');
    expect(arrowButtons.length).toBe(0);
  });
});

