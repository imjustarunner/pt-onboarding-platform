import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Narriva from '../NarrivaShowcase.vue';
import Reviews from '../NarrivaReviewExamples.vue';
import Summary from '../../../components/clinical/NarrivaNoteSummary.vue';
import {renderWebsite} from '../render.mjs';
import {NARRIVA_CHECKS} from '../../../config/narrivaBrand.js';
import {exampleNarrivaReview,exampleTreatmentHistory,narrivaExamples} from '../../demo/narriva.js';
import {demoResponse,practice} from '../../demo/fixtures.js';
import {demoAnalyticsMetadata} from '../analytics.js';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),put:vi.fn(),delete:vi.fn()}}));
import api from '../../../services/api';
let wrapper;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{wrapper?.unmount();wrapper=null;document.body.innerHTML='';vi.useRealTimers();});
const button=(text)=>wrapper.findAll('button').find(item=>item.text()===text);
async function finishChecks(){await button('Run example note check').trigger('click');expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);await vi.advanceTimersByTimeAsync(1700);await flushPromises();}
describe('scripted Narriva walkthrough',()=>{
 it('reuses the three real writing methods, fictional drafts and staff portraits',async()=>{
  wrapper=mount(Narriva);expect(wrapper.findAll('.narriva-modes__options button').map(item=>item.text())).toEqual(expect.arrayContaining([expect.stringContaining('Manual writer'),expect.stringContaining('Narriva'),expect.stringContaining('Smart Notes')]));expect(wrapper.findAll('.nd-drafts button')).toHaveLength(3);expect(wrapper.get('.nd-disclosure').text()).toContain('No AI check runs');await wrapper.get('[data-analytics-id="narriva-generate"]').trigger('click');expect(wrapper.get('.nd-guide').text()).toContain('No generation request was sent');
  await wrapper.findAll('.nd-drafts button')[1].trigger('click');expect(wrapper.get('.nd-note-header').text()).toContain('Jamie Stone');expect(wrapper.get('.nd-output').text()).toContain('evening routine');
 });
 it('shows the five checks in motion, then requires explicit review and attestation for both simulated signatures',async()=>{
  wrapper=mount(Narriva,{attachTo:document.body});await finishChecks();expect(wrapper.findAll('.narriva-check--passed')).toHaveLength(5);expect(wrapper.get('.narriva-score__summary').text()).toContain('92%');await button('Review and sign (demo)').trigger('click');expect(button('Simulate provider signature').element.disabled).toBe(true);await wrapper.get('.nd-attest input').setValue(true);await button('Simulate provider signature').trigger('click');expect(wrapper.get('.nd-note-header').text()).toContain('Provider signature simulated');
  await wrapper.get('.nra-quick-sign').trigger('click');expect(wrapper.get('.nd-person').text()).toContain('Dr. Tessa Brooks');expect(button('Simulate Quick Sign').element.disabled).toBe(true);await wrapper.get('.nd-attest input').setValue(true);await button('Simulate Quick Sign').trigger('click');expect(wrapper.get('.nd-guide').text()).toContain('No actual note was co-signed');expect(wrapper.find('.nra-quick-sign').exists()).toBe(false);
  expect(api.post).not.toHaveBeenCalled();expect(api.patch).not.toHaveBeenCalled();expect(api.get).not.toHaveBeenCalled();
 });
 it('keeps a failed result blocked until the source-supported correction is rechecked',async()=>{
  wrapper=mount(Narriva,{props:{initialView:'check'}});await button('Missing follow-up plan').trigger('click');await finishChecks();expect(wrapper.findAll('.narriva-check--action_required')).toHaveLength(1);expect(wrapper.get('.narriva-score__summary').text()).toContain('Blocked');expect(button('Review and sign (demo)')).toBeUndefined();
  await button('Edit note content').trigger('click');expect(wrapper.text()).toContain('prior result is stale');expect(wrapper.text()).toContain('run checks again');expect(wrapper.find('[alt="Narriva Quick Sign Approved"]').exists()).toBe(false);await finishChecks();expect(wrapper.findAll('.narriva-check--passed')).toHaveLength(5);expect(button('Review and sign (demo)')).toBeDefined();
 });
 it('does not grant Quick Sign from a preview and uses the supplied in-memory insights for hover/tap review',async()=>{
  wrapper=mount(Narriva,{props:{initialView:'work'},attachTo:document.body});expect(wrapper.find('.nra-quick-sign').exists()).toBe(false);await wrapper.get('.nra-summary').trigger('click');await flushPromises();expect(document.querySelector('.nra-popup').textContent).toContain('Cognitive reframing');expect(api.get).not.toHaveBeenCalled();document.querySelector('[aria-label="Close review details"]').click();await flushPromises();await wrapper.get('.nra-history').trigger('click');await flushPromises();expect(document.querySelector('.nra-popup').textContent).toContain('5 of up to 5');
 });
 it('cancels a running illustration on reset and keeps separate instances isolated',async()=>{
  wrapper=mount(Narriva);await button('Run example note check').trigger('click');await wrapper.get('[data-analytics-id="narriva-reset"]').trigger('click');await vi.advanceTimersByTimeAsync(2000);expect(wrapper.find('.narriva-compliance').exists()).toBe(false);expect(wrapper.get('.nd-note-header').text()).toContain('Draft example');
  const second=mount(Narriva,{props:{initialView:'work'}});expect(second.find('.nra-quick-sign').exists()).toBe(false);second.unmount();
 });
});
describe('shared review presentation and public copy',()=>{
 it('shows source summaries, artifacts, comparable five-session history and explicit trend labels',async()=>{
  wrapper=mount(Reviews);expect(wrapper.findAll('.nh-graph circle')).toHaveLength(5);expect(wrapper.text()).toContain('Clinician rating');expect(wrapper.text()).toContain('Client report');await button('Regression').trigger('click');expect(wrapper.get('.nh-trend').text()).toContain('Regression');expect(wrapper.text()).toContain('no change is made automatically');await button('Stagnation').trigger('click');expect(wrapper.get('.nh-trend').text()).toContain('Stagnation');await button('View summary').trigger('click');expect(wrapper.get('.narriva-note-summary').text()).toContain('CBT grounding worksheet');
 });
 it('escapes saved content and retains unavailable artifact wording in the reused summary',()=>{
  wrapper=mount(Summary,{props:{quickLook:{sections:[{key:'source',label:'Source',text:'<img src=x onerror=alert(1)>'}],artifactsStatus:'unavailable'},sourceRevision:{id:'example'}}});expect(wrapper.find('.nra-sections img').exists()).toBe(false);expect(wrapper.text()).toContain('<img');expect(wrapper.text()).toContain('Supporting materials could not be checked');expect(wrapper.text()).toContain('Signing validates the current version again');
 });
 it('retains the public review component’s safe empty display for explicitly null preview data',()=>{wrapper=mount(Summary,{props:{quickLook:null,sourceRevision:null}});expect(wrapper.text()).toContain('No saved narrative sections are available');expect(wrapper.text()).toContain('No artifacts listed');});
 it('links Narriva features and the guided journey into the existing demo, preserving kiosk navigation',()=>{
  const doc=new DOMParser().parseFromString(renderWebsite('product'),'text/html');expect(doc.querySelectorAll('#narriva-compliance')).toHaveLength(1);expect(doc.querySelectorAll('#narriva-review')).toHaveLength(1);expect(doc.querySelectorAll('[data-actual-example="narriva-compliance"]')).toHaveLength(1);expect(doc.querySelector('[href="/auricwell/examples/note-editor.png"]')).toBeNull();expect([...doc.querySelectorAll('a')].some(link=>link.getAttribute('href').includes('demo#/meadowbrook/documentation?narriva=1'))).toBe(true);expect(doc.querySelector('.feature-menu-panel a:not(.all-features)').textContent).toContain('Kiosk');expect(doc.querySelector('#narriva-compliance').textContent).toContain('not an insurer audit approval');expect(doc.querySelector('#documentation').textContent).toContain('Manual writer');expect(doc.querySelector('#documentation').textContent).toContain('Smart Notes');
  const home=renderWebsite('');expect(home).toContain('Narriva Compliance');expect(home).toContain('Narriva built into documentation');
 });
 it('uses real check labels, reproducible fictional scores and the same rating scale across the five examples',()=>{
  expect(exampleNarrivaReview().checks.map(check=>check.label)).toEqual(NARRIVA_CHECKS.map(check=>check.label));expect(exampleNarrivaReview({passed:false}).quickSignEligible).toBe(false);for(const example of narrivaExamples){const history=exampleTreatmentHistory({example});expect(history.sessions).toHaveLength(5);expect(history.objectives[0].goal).toBe(example.focus);expect(history.objectives[0].points.every(point=>point.target===8&&point.scaleMin===0&&point.scaleMax===10)).toBe(true);}
 });
 it('keeps demo insights scoped to retained synthetic notes and rejects every clinical mutation',()=>{
  const queue=demoResponse('/me/notes-to-sign').notes;expect(queue[0].narriva).toMatchObject({exampleOnly:true,quickSignEligible:true});expect(queue[1].narriva.quickSignEligible).toBe(false);const result=demoResponse('/narriva/notes/990181/review-insights',{params:{agencyId:practice.id}});expect(result.insights.noteId).toBe(990181);expect(result.insights.quickLook.artifacts).toEqual([]);expect(result.insights.quickLook.sections.length).toBeGreaterThan(0);expect(()=>demoResponse('/narriva/notes/1/review-insights')).toThrow(/outside/);expect(()=>demoResponse('/narriva/notes/990181/review-insights',{params:{agencyId:2}})).toThrow(/outside/);expect(()=>demoResponse('/narriva/reviews',{method:'post'})).toThrow(/nothing was saved/);expect(()=>demoResponse('/medical-billing/notes/990181/cosign',{method:'post'})).toThrow(/nothing was saved/);
 });
 it('tracks fixed Narriva actions without names, IDs, narrative or checkbox values',()=>{
  const el=document.createElement('button');el.dataset.analyticsId='narriva-sign';el.textContent='PRIVATE CLIENT TEXT';expect(demoAnalyticsMetadata(el).label).toBe('Simulate a Narriva signature');expect(demoAnalyticsMetadata(el).key).not.toContain('PRIVATE');
 });
});
