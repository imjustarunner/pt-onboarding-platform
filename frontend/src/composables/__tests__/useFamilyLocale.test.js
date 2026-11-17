import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick } from 'vue';
import { provideFamilyLocale, useFamilyLocale, useActiveFamilyLocale, familyTranslator } from '../useFamilyLocale';
import FamilyDashboard from '../../components/guardian/FamilyDashboard.vue';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));
const Child = defineComponent({
  setup() { const { ft } = useFamilyLocale(); return () => h('p', ft('Session price: {amount}', {amount:'$120.00'})); }
});
const Host = defineComponent({
  props: ['userId', 'enrollmentLocale'],
  setup(props) {
    const context = provideFamilyLocale({userId:computed(() => props.userId), enrollmentLocale:computed(() => props.enrollmentLocale)});
    return () => h('section', [h('button', {onClick:() => context.setLocale('en')}, 'English'), h(Child), h(FamilyDashboard, {preview:true})]);
  }
});
beforeEach(() => { localStorage.clear(); document.documentElement.lang='en'; });
it('translates the selected-updates navigation in the family language', () => {
  expect(familyTranslator('es')('Selected updates')).toBe('Actualizaciones seleccionadas');
  expect(familyTranslator('en')('Selected updates')).toBe('Selected updates');
});
it('uses the enrollment language for the actual family dashboard and dynamic amounts', async () => {
  localStorage.setItem('publicLocale', 'en');
  const w=mount(Host, {props:{userId:1450,enrollmentLocale:'es'}});
  await flushPromises();
  expect(document.documentElement.lang).toBe('es');
  expect(w.text()).toContain('Su saldo asignado');
  expect(w.text()).toContain('Próximas citas');
  expect(w.text()).toContain('Precio de la sesión: $120.00');
  expect(w.text()).not.toContain('Your assigned balance');
  w.unmount(); expect(document.documentElement.lang).toBe('en');
});
it('keeps explicit language choices per person instead of carrying them into another account', async () => {
  const w=mount(Host, {props:{userId:1450,enrollmentLocale:'es'}});
  await w.get('button').trigger('click'); await nextTick();
  expect(w.text()).toContain('Your assigned balance');
  await w.setProps({userId:1452}); expect(w.text()).toContain('Su saldo asignado');
  await w.setProps({userId:1450}); expect(w.text()).toContain('Your assigned balance');
  w.unmount();
});

it('keeps shared toolbar language scoped to the mounted account and surviving newer view',async()=>{const first=mount(Host,{props:{userId:1450,enrollmentLocale:'es'}}),same=useActiveFamilyLocale(1450),other=useActiveFamilyLocale(1452);expect(same.value).toBe('es');expect(other.value).toBe('en');const second=mount(Host,{props:{userId:1452,enrollmentLocale:'es'}});expect(other.value).toBe('es');first.unmount();expect(other.value).toBe('es');expect(document.documentElement.lang).toBe('es');second.unmount();expect(other.value).toBe('en');expect(document.documentElement.lang).toBe('en');});
