import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { computed, defineComponent, h, nextTick } from 'vue';
import { provideFamilyLocale, useFamilyLocale } from '../useFamilyLocale';
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
