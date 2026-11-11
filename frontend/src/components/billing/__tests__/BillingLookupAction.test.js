import {mount} from '@vue/test-utils';
import {it,expect} from 'vitest';
import BillingLookupAction from '../BillingLookupAction.vue';

it('shows help on hover and keyboard focus without starting the lookup',async()=>{
  const w=mount(BillingLookupAction,{props:{kind:'discovery'},slots:{default:'Find insurance'},attachTo:document.body});
  expect(w.find('[role=tooltip]').isVisible()).toBe(false);
  await w.trigger('mouseenter');expect(w.find('[role=tooltip]').isVisible()).toBe(true);
  await w.trigger('mouseleave');expect(w.find('[role=tooltip]').isVisible()).toBe(false);
  await w.find('button').trigger('focusin');expect(w.find('[role=tooltip]').isVisible()).toBe(true);
  expect(w.emitted('open')).toBeUndefined();
  await w.find('button').trigger('click');expect(w.emitted('open')).toHaveLength(1);w.unmount();
});

it('supports tapping help while the action is disabled and keeps help pinned until dismissed',async()=>{
  const w=mount(BillingLookupAction,{props:{kind:'cob',disabled:true}});
  const help=w.find('.lookup-help-button');
  expect(w.find('button').element.disabled).toBe(true);expect(help.element.disabled).toBe(false);
  await help.trigger('click');await w.trigger('mouseleave');expect(help.attributes('aria-expanded')).toBe('true');
  await help.trigger('click');expect(w.find('[role=tooltip]').isVisible()).toBe(false);
  expect(w.emitted('open')).toBeUndefined();w.unmount();
});

it('dismisses visible help with Escape before allowing the enclosing dialog to close',async()=>{
  const w=mount(BillingLookupAction,{props:{kind:'cob'},attachTo:document.body});
  let escaped=0;const listener=()=>escaped++;document.body.addEventListener('keydown',listener);
  await w.trigger('mouseenter');await w.find('button').trigger('keydown',{key:'Escape'});
  expect(w.find('[role=tooltip]').isVisible()).toBe(false);expect(escaped).toBe(0);
  await w.find('button').trigger('keydown',{key:'Escape'});expect(escaped).toBe(1);
  document.body.removeEventListener('keydown',listener);w.unmount();
});
