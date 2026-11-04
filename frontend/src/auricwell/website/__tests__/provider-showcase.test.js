import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Showcase from '../ProviderShowcase.vue';
let w;
beforeEach(()=>{vi.stubGlobal('innerWidth',1440);});
afterEach(()=>{w?.unmount();vi.unstubAllGlobals();});
describe('website provider profile and availability',()=>{
 it('opens the full profile with practice, clients and specialties rather than a calendar',async()=>{
  w=mount(Showcase);const profile=w.find('[aria-label="Example provider profile"]');expect(profile.exists()).toBe(true);expect(profile.text()).toContain('About Avery');expect(profile.text()).toContain('Meadowbrook Therapy');expect(profile.text()).toContain('Online care in Colorado');expect(profile.text()).toContain('Populations served');expect(profile.text()).toContain('Cognitive behavioral therapy');expect(profile.text()).toContain('Getting started');expect(w.find('.opening-calendar').exists()).toBe(false);
  await w.findAll('.provider-card')[1].find('.card-actions .btn-outline').trigger('click');await flushPromises();expect(w.find('.showcase-detail h3').text()).toBe('Jordan Reed');expect(w.find('.showcase-full-profile').text()).toContain('Sample Denver office');expect(w.find('.showcase-full-profile').text()).toContain('older adults');expect(w.find('.opening-calendar').exists()).toBe(false);
 });
 it('keeps availability and profile actions distinct and clears an old sample time when changing providers',async()=>{
  w=mount(Showcase);await w.findAll('.provider-card')[0].find('.btn-book').trigger('click');expect(w.find('[aria-label="Example provider availability"]').exists()).toBe(true);expect(w.find('.showcase-full-profile').exists()).toBe(false);await w.find('.opening-day button').trigger('click');expect(w.find('[role="status"]').text()).toContain('Avery Lane');expect(w.find('[role="status"]').text()).toContain('no hold or appointment was created');
  await w.findAll('.provider-card')[1].find('.btn-book').trigger('click');expect(w.find('.showcase-detail h3').text()).toBe('Jordan Reed');expect(w.find('[role="status"]').text()).not.toContain('Avery');expect(w.find('.showcase-facts').text()).toContain('In-person');
  await w.find('.showcase-read-profile').trigger('click');expect(w.find('.showcase-full-profile').text()).toContain('About Jordan');expect(w.find('.opening-calendar').exists()).toBe(false);await w.find('.showcase-profile-action').trigger('click');expect(w.find('.opening-calendar').exists()).toBe(true);expect(w.find('[role="status"]').text()).toContain('Select a sample opening');
 });
 it('supports switching back to a full profile from the detail controls without creating a booking',async()=>{
  w=mount(Showcase);await w.findAll('.showcase-view-switch button')[1].trigger('click');await w.find('.opening-day button').trigger('click');await w.findAll('.showcase-view-switch button')[0].trigger('click');expect(w.findAll('.showcase-view-switch button')[0].attributes('aria-pressed')).toBe('true');expect(w.find('.showcase-full-profile').exists()).toBe(true);expect(w.find('.opening-calendar').exists()).toBe(false);expect(w.emitted('book')).toBeUndefined();
 });
});
