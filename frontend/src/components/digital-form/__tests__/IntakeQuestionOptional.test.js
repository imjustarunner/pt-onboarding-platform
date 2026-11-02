import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import IntakeQuestionField from '../IntakeQuestionField.vue';
import DigitalFormField from '../DigitalFormField.vue';
import { translateJoinEnrollment } from '../../../utils/joinEnrollmentCopy.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn() } }));

const wrappers = [];
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()));

function render(type, locale = 'en', props = {}) {
  const options = ['radio', 'checkbox_group', 'select'].includes(type)
    ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]
    : [];
  const field = { key: 'therapy_details', label: 'Tell us more', type, options, ...props.field };
  const wrapper = mount(IntakeQuestionField, {
    props: { showOptional: true, ...props, field },
    global: { provide: { enrollmentTranslate: text => translateJoinEnrollment(text, locale) } }
  });
  wrappers.push(wrapper);
  return wrapper;
}

describe.each(['en', 'es'])('office question status in %s', locale => {
  it.each(['text', 'textarea', 'select', 'radio', 'checkbox_group', 'checkbox'])(
    'identifies an unmarked optional %s question without requiring an answer', type => {
      const wrapper = render(type, locale);
      expect(wrapper.findAll('.df-field-optional')).toHaveLength(1);
      expect(wrapper.get('.df-field-optional').text()).toBe(locale === 'es' ? 'opcional' : 'optional');
      expect(wrapper.find('.df-field-required').exists()).toBe(false);
      expect(wrapper.find('[required]').exists()).toBe(false);
    }
  );

  it.each(['text', 'textarea', 'select', 'radio', 'checkbox_group', 'checkbox'])(
    'shows required, never optional, for a required %s with conflicting metadata', type => {
      const wrapper = render(type, locale, {
        required: true,
        help: locale === 'es' ? 'Opcional' : 'Optional',
        field: { optional: true, required: false }
      });
      expect(wrapper.findAll('.df-field-required')).toHaveLength(1);
      expect(wrapper.find('.df-field-optional').exists()).toBe(false);
      expect(wrapper.find('.df-field-help').exists()).toBe(false);
    }
  );

  it('does not add new status labels to an unmarked non-office question', () => {
    const wrapper = render('text', locale, { showOptional: false });
    expect(wrapper.find('.df-field-optional').exists()).toBe(false);
    expect(wrapper.find('.df-field-required').exists()).toBe(false);
  });

  it('preserves existing conditional optional labels outside office enrollment', () => {
    const wrapper = render('radio', locale, {
      showOptional: false,
      field: { showIf: { fieldKey: 'prior_therapy', equals: 'yes' } }
    });
    expect(wrapper.get('.df-field-optional').text()).toBe(locale === 'es' ? 'opcional' : 'optional');
  });
});

it.each(['Optional', 'Opcional'])('suppresses duplicate %s helper text', help => {
  const wrapper = render('checkbox', 'es', { help });
  expect(wrapper.findAll('.df-field-optional')).toHaveLength(1);
  expect(wrapper.find('.df-field-help').exists()).toBe(false);
});

it('keeps substantive help and checkbox answers while displaying an optional badge', async () => {
  const wrapper = render('checkbox', 'en', { help: 'You may discuss this at your first appointment.' });
  expect(wrapper.get('.df-field-help').text()).toBe('You may discuss this at your first appointment.');
  await wrapper.get('input[type="checkbox"]').setValue(true);
  expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
});

it('updates a choice badge when the enrollment language changes', async () => {
  const locale = ref('en');
  const wrapper = mount(IntakeQuestionField, {
    props: { showOptional: true, field: { key: 'choice', label: 'Choice', type: 'radio', options: ['Yes', 'No'] } },
    global: { provide: { enrollmentTranslate: text => translateJoinEnrollment(text, locale.value) } }
  });
  wrappers.push(wrapper);
  expect(wrapper.get('.df-field-optional').text()).toBe('optional');
  locale.value = 'es';
  await wrapper.vm.$nextTick();
  expect(wrapper.get('.df-field-optional').text()).toBe('opcional');
});

it('localizes a direct checkbox badge and suppresses its optional-only helper', () => {
  const wrapper = mount(DigitalFormField, {
    props: { type: 'checkbox', label: 'Choice', optionalBadge: true, help: 'Opcional' },
    global: { provide: { enrollmentTranslate: text => translateJoinEnrollment(text, 'es') } }
  });
  wrappers.push(wrapper);
  expect(wrapper.get('.df-field-optional').text()).toBe('opcional');
  expect(wrapper.find('.df-field-help').exists()).toBe(false);
});
