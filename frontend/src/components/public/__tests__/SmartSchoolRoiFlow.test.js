import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function mountFlow(extraProps = {}) {
  return mount(SmartSchoolRoiFlow, {
    props: {
      publicKey: 'abc123',
      sessionToken: 'session-token',
      roiContext,
      link: { id: 1, form_type: 'smart_school_roi' },
      boundClient: { id: 11, full_name: 'Test Client', initials: 'TC' },
      ...extraProps
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
  beforeEach(() => { localStorage.clear(); Element.prototype.scrollIntoView = vi.fn(); });
  it('blocks progress when intro fields are missing', async () => {
    const wrapper = mountFlow();

    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('Choose whether this release is for you or your dependent.');
  });

  it('only allows accepting required acknowledgements', async () => {
    const wrapper = mountFlow();

    const intakeChoiceRadios = wrapper.findAll('input[type="radio"]');
    await intakeChoiceRadios[1].setValue();

    await wrapper.get('input[type="date"]').setValue('2016-04-05');
    const textInputs = wrapper.findAll('input[type="text"]');
    await textInputs[0].setValue('Test Client');
    await textInputs[1].setValue('Jamie');
    await textInputs[2].setValue('Parent');
    await textInputs[3].setValue('Mother');
    await wrapper.get('input[type="email"]').setValue('jamie@example.com');
    await wrapper.get('input[type="tel"]').setValue('555-123-4567');
    await wrapper.get('button.btn-primary').trigger('click');
    await wrapper.get('button.btn-primary').trigger('click');

    expect(wrapper.text()).toContain('This acknowledgement is required to continue.');
    expect(wrapper.text()).not.toContain('I do not accept');
    expect(wrapper.findAll('input[type="radio"]').length).toBe(1);
  });
});

async function filledIntro(wrapper) {
  await wrapper.get('#roi-intake-self-no').setValue();
  await wrapper.get('#roi-signer-first-name').setValue('Jamie');
  await wrapper.get('#roi-signer-last-name').setValue('Parent');
  await wrapper.get('#roi-signer-email').setValue('jamie@example.com');
  await wrapper.get('#roi-signer-relationship').setValue('Parent');
  await wrapper.get('button.btn-primary').trigger('click');
}
it('prefills the addressed email without choosing signer authority', () => {
  const wrapper = mountFlow({ prefill: { signerEmail: 'invited@example.com' } });
  expect(wrapper.get('#roi-signer-email').element.value).toBe('invited@example.com');
  expect(wrapper.get('#roi-intake-self-no').element.checked).toBe(false);
  expect(wrapper.get('#roi-intake-self-yes').element.checked).toBe(false);
  wrapper.unmount();
});
it('groups staff on one section, requires each decision, and scrolls on section changes', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const wrapper = mountFlow({ roiContext: { ...roiContext, staffRoster: [...roiContext.staffRoster, { schoolStaffUserId: 100, fullName: 'Second Staff' }] } });
  expect(wrapper.text()).toContain('Section 1 of 9');
  await filledIntro(wrapper);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'instant' });
  await wrapper.get('button.btn-primary').trigger('click');
  await wrapper.get('.choice-card').trigger('click');
  await wrapper.get('button.btn-primary').trigger('click');
  await wrapper.get('.choice-card').trigger('click');
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).toContain('Staff Person'); expect(wrapper.text()).toContain('Second Staff');
  expect(wrapper.findAll('input[type="radio"]:checked')).toHaveLength(0);
  await wrapper.get('input[name="staffDecision_99"][value="roi"]').element.closest('label').click();
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).toContain('Choose ROI All Active');
  await wrapper.get('input[name="staffDecision_100"][value="none"]').element.closest('label').click();
  await wrapper.get('button.btn-primary').trigger('click');
  expect(wrapper.text()).not.toContain('School staff approval');
  await wrapper.findAll('button').find(b => b.text() === 'Back').trigger('click');
  expect(wrapper.get('input[name="staffDecision_99"][value="roi"]').element.checked).toBe(true);
  expect(wrapper.get('input[name="staffDecision_100"][value="none"]').element.checked).toBe(true);
  wrapper.unmount();
});
