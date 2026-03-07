import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import SmartSchoolRoiFlow from '../SmartSchoolRoiFlow.vue';

vi.mock('../../../services/api', () => ({
  default: {
    post: vi.fn()
  }
}));

const roiContext = {
  client: {
    id: 11,
    fullName: 'Test Client',
    dateOfBirth: '2016-04-05',
    initials: 'TC'
  },
  school: {
    id: 9,
    name: 'Test School'
  },
  purposes: ['Support care planning'],
  requiredAcknowledgements: [
    {
      id: 'esign_consent',
      title: 'Electronic consent',
      body: 'Accept electronic signature.'
    }
  ],
  waiverItems: [
    {
      id: 'communication_and_care_planning',
      title: 'Care planning',
      body: 'Authorize communication.'
    }
  ],
  staffRoster: [
    {
      schoolStaffUserId: 99,
      fullName: 'Staff Person',
      email: 'staff@example.com'
    }
  ]
};

function mountFlow() {
  return mount(SmartSchoolRoiFlow, {
    props: {
      publicKey: 'abc123',
      sessionToken: 'session-token',
      roiContext,
      link: { id: 1, form_type: 'smart_school_roi' },
      boundClient: { id: 11, full_name: 'Test Client', initials: 'TC' }
    },
    global: {
      stubs: {
        SignaturePad: {
          template: '<button type="button" class="signature-stub" @click="$emit(\'signed\', \'data:image/png;base64,test\')">Sign</button>'
        }
      }
    }
  });
}

describe('SmartSchoolRoiFlow', () => {
  it('blocks progress when intro fields are missing', async () => {
    const wrapper = mountFlow();

    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('Complete the client and responsible party details before continuing.');
  });

  it('requires required acknowledgements to be accepted', async () => {
    const wrapper = mountFlow();

    await wrapper.get('input[type="date"]').setValue('2016-04-05');
    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Jamie');
    await textInputs[1].setValue('Parent');
    await textInputs[2].setValue('Mother');
    await wrapper.get('input[type="email"]').setValue('jamie@example.com');
    await wrapper.get('input[type="tel"]').setValue('555-123-4567');
    await wrapper.get('button.btn-primary').trigger('click');

    const declineRadio = wrapper.findAll('input[type="radio"]')[1];
    await declineRadio.setValue();
    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('This acknowledgement must be accepted to continue.');
  });
});
