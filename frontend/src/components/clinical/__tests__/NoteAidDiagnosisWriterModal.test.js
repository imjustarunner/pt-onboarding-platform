import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Writer from '../NoteAidDiagnosisWriterModal.vue';
import api from '../../../services/api.js';
import { parseNoteSections } from '../../../../../backend/src/services/clinicalNoteSections.service.js';

vi.mock('../../../services/api.js', () => ({ default: { post: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../store/auth.js', () => ({
  useAuthStore: () => ({ user: { first_name: 'Test', last_name: 'Clinician', credentials: 'LPC' } })
}));

const sourceText = 'Synthetic intake findings for clinician review.';
const diagnosisText = 'Diagnosis: Synthetic diagnostic formulation.\nDiagnostic Justification: Synthetic supporting findings.';
let wrapper;

async function click(label) {
  await wrapper.findAll('button').find((button) => button.text() === label).trigger('click');
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  api.post.mockImplementation(async (url) => {
    if (url === '/clinical-notes/generate') {
      // Match generateClinicalNote: parsed sections and metadata are nested in outputJson.
      return { data: { draftId: 42, outputJson: {
        sections: parseNoteSections(diagnosisText), meta: { toolId: 'clinical_diagnosis_writer' }
      } } };
    }
    if (url === '/clinical-notes/drafts') return { data: { draft: { id: 43 } } };
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  api.patch.mockResolvedValue({ data: {} });
  wrapper = mount(Writer, { props: { open: true, agencyId: 7 }, global: { stubs: { teleport: true } } });
});

afterEach(() => wrapper.unmount());

it('displays the real generation response for editing and saves the reviewed diagnosis', async () => {
  await wrapper.find('textarea').setValue(sourceText);
  await click('Draft diagnosis & justification');

  expect(wrapper.find('.na-dx-error').exists()).toBe(false);
  const fields = wrapper.findAll('textarea');
  expect(fields).toHaveLength(2);
  expect(fields[0].element.value).toBe(sourceText);
  expect(fields[1].element.value).toContain('Diagnosis:\nSynthetic diagnostic formulation.');
  expect(fields[1].element.value).toContain('Diagnostic Justification:\nSynthetic supporting findings.');
  expect(fields[1].element.value).toContain('Draft for review by Test Clinician · LPC');
  expect(fields[1].element.value).not.toContain('clinical_diagnosis_writer');
  const [, body] = api.post.mock.calls[0];
  expect(body.get('toolId')).toBe('clinical_diagnosis_writer');
  expect(body.get('agencyId')).toBe('7');
  expect(body.get('inputText')).toContain(sourceText);

  const reviewedText = `${fields[1].element.value}\nClinician correction.`;
  await fields[1].setValue(reviewedText);
  await click('Save to In Progress');
  expect(api.post).toHaveBeenLastCalledWith('/clinical-notes/drafts', expect.objectContaining({
    agencyId: 7, clientId: null, unlinkClient: true, inputText: sourceText
  }), expect.any(Object));
  const [url, patch] = api.patch.mock.calls[0];
  expect(url).toBe('/clinical-notes/drafts/43');
  expect(JSON.parse(patch.outputJson)).toMatchObject({
    sections: { 'Diagnosis and Justification': reviewedText },
    meta: { toolId: 'clinical_diagnosis_writer', professionalReviewRequired: true }
  });
  expect(wrapper.emitted('saved')[0][0].id).toBe(43);
});

it('displays the server fallback Output section when no named headings are present', async () => {
  api.post.mockResolvedValueOnce({ data: { outputJson: { sections: { Output: 'Synthetic draft to review.' } } } });
  await wrapper.find('textarea').setValue(sourceText);
  await click('Draft diagnosis & justification');
  expect(wrapper.find('.na-dx-error').exists()).toBe(false);
  expect(wrapper.findAll('textarea')[1].element.value).toContain('Synthetic draft to review.');
});

it.each([{}, { sections: {} }, { sections: { Diagnosis: '  ', 'Diagnostic Justification': null } }])(
  'keeps input and disables saving when the response has no draft content: %j', async (outputJson) => {
    api.post.mockResolvedValueOnce({ data: { outputJson } });
    await wrapper.find('textarea').setValue(sourceText);
    await click('Draft diagnosis & justification');
    expect(wrapper.find('.na-dx-error').text()).toBe('No diagnosis draft returned.');
    expect(wrapper.findAll('textarea')).toHaveLength(1);
    expect(wrapper.find('textarea').element.value).toBe(sourceText);
    expect(wrapper.findAll('button').find((button) => button.text() === 'Save to In Progress').element.disabled).toBe(true);
    expect(api.patch).not.toHaveBeenCalled();
  }
);

it('preserves the source and shows the service message when generation fails', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Generation unavailable. Please retry.' } } } });
  await wrapper.find('textarea').setValue(sourceText);
  await click('Draft diagnosis & justification');
  expect(wrapper.find('.na-dx-error').text()).toBe('Generation unavailable. Please retry.');
  expect(wrapper.find('textarea').element.value).toBe(sourceText);
  expect(wrapper.findAll('button').find((button) => button.text() === 'Draft diagnosis & justification').element.disabled).toBe(false);
});
