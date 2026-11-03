import { afterEach, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import IntakeQuestionField from '../../digital-form/IntakeQuestionField.vue';
import OfficeSkipNowSplash from '../OfficeSkipNowSplash.vue';
import ChooseProviderDirectory from '../../public/ChooseProviderDirectory.vue';
import SecureCardSetup from '../../billing/SecureCardSetup.vue';
import { lookupStructuredIntakeTranslation as es } from '../../../constants/structuredIntakeStepSpanish.js';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get, post } }));
vi.mock('../../../services/api.js', () => ({ default: { get, post } }));
const wrappers = [];
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.clearAllMocks(); });
function mountEs(component, props = {}, extra = {}) {
  const locale = ref('es');
  const wrapper = mount(component, { props, global: { provide: {
    intakeLocale: locale, intakeStringTranslations: ref({}), enrollmentTranslate: text => locale.value === 'es' ? es(text) : text
  }, stubs: { Teleport: true, ...extra } } });
  wrappers.push(wrapper);
  return { wrapper, locale };
}
it('shows the field validation message in Spanish and follows a locale change', async () => {
  const { wrapper, locale } = mountEs(IntakeQuestionField, { field: { key: 'legal_first_name', label: 'Legal first name', type: 'text' }, label: 'Legal first name', error: true, required: true });
  expect(wrapper.get('.df-field-error').text()).toBe('Obligatorio');
  locale.value = 'en'; await flushPromises();
  expect(wrapper.get('.df-field-error').text()).toBe('Required');
});
it('keeps Spanish skip choices visible without English text embedded in artwork', async () => {
  const { wrapper } = mountEs(OfficeSkipNowSplash, { language: 'es', supportText: 'Puede omitir las preguntas opcionales.', skipLabel: 'Omitir ahora', skipHint: 'Mostrar solo lo obligatorio', continueLabel: 'Continuar normalmente' });
  expect(wrapper.find('img').exists()).toBe(false);
  expect(wrapper.text()).toContain('Omitir ahora');
  await wrapper.get('.office-skip-splash__continue').trigger('click');
  expect(wrapper.emitted('continue-normal')).toHaveLength(1);
});
it('translates provider chooser controls and retains selection values', async () => {
  const { wrapper } = mountEs(ChooseProviderDirectory, { mode: 'intake', providers: [{ id: 42, displayName: 'DEMO Clinician', availability: {status: 'accepting'}, acceptingNewClients: true, modality: 'VIRTUAL' }], selectedIds: [] }, { EnrollmentProviderDetailsDialog: true });
  expect(wrapper.text()).toContain('Elija hasta tres profesionales');
  expect(wrapper.text()).toContain('Mejor coincidencia');
  expect(wrapper.text()).toContain('Ver perfil');
  expect(wrapper.text()).not.toContain('Skip provider choice');
  await wrapper.get('.cpd-select-provider').trigger('click');
  expect(wrapper.emitted('update:selectedIds')[0][0]).toEqual(['42']);
});
it('explains unavailable secure payment in Spanish without requesting setup or a charge', async () => {
  get.mockResolvedValue({ data: {} });
  const { wrapper } = mountEs(SecureCardSetup, { publicKey: 'office-demo', submissionId: 1 });
  await flushPromises();
  expect(wrapper.text()).toContain('El registro de tarjetas aún no está disponible');
  expect(wrapper.text()).toContain('Reintentar la configuración segura de tarjeta');
  expect(post).not.toHaveBeenCalled();
});
