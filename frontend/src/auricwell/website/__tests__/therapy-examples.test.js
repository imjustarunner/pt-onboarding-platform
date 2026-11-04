import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { officeFeedbackForms, scoreOfficeFeedback } from '../../../../../backend/src/services/officeFeedbackForms.js';
import fixture from '../kiosk-feedback.json';
import { scoreExampleFeedback } from '../kiosk-feedback.js';
import { conversaFeature } from '../../../conversa/website/feature.mjs';
import { renderWebsite } from '../render.mjs';
import KioskShowcase from '../KioskShowcase.vue';
import ConversaShowcase from '../ConversaShowcase.vue';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from '../../../services/api';

describe('public therapy examples reuse current workflows', () => {
  it('publishes one materials example per page and replaces every shared lab-results preview',()=>{
    for(const page of ['', 'product']){const doc=new DOMParser().parseFromString(renderWebsite(page),'text/html');expect(doc.querySelectorAll('#session-materials')).toHaveLength(1);expect(doc.querySelectorAll('[data-actual-example=\"session-materials\"]')).toHaveLength(1);}
    for(const product of ['auricwell','ptco','hq']){const html=conversaFeature({product});expect(html).toContain('conversa-therapy-preview-20261103.png');expect(html).not.toContain('conversa-interface-preview.svg');expect(html).not.toMatch(/lab results/i);}
  });
  it.each(['adult_self','youth_self','caregiver'])('keeps all six questions identical to the canonical %s forms', type => {
    expect(fixture.forms[type]).toEqual(officeFeedbackForms(type, 'counseling'));
    expect(fixture.forms[type].map(form => form.fields.length)).toEqual([3,3]);
    const answers=Object.fromEntries(fixture.forms[type].map(form=>[form.id,Object.fromEntries(form.fields.map((field,index)=>[field.id,String(7+index)]))]));
    const server=scoreOfficeFeedback(fixture.forms[type],answers);
    expect(scoreExampleFeedback(fixture.forms[type],answers)).toEqual({connection:server.connection,progress:server.progress});
    expect(scoreExampleFeedback(fixture.forms[type],answers,[fixture.forms[type][0].id]).connection).toBeNull();
    expect(scoreExampleFeedback(fixture.forms[type],{})).toEqual({connection:null,progress:null});
  });
  it('lets a caregiver answer both questionnaires, reverses distress, and clears answers on reset without API calls', async () => {
    vi.clearAllMocks();
    const w=mount(KioskShowcase);
    await w.find('.kiosk-provider .choose').trigger('click');
    await w.get('input[value="caregiver"]').setValue();
    await w.find('.kiosk-content .primary-action').trigger('click');
    expect(w.find('.kiosk-feedback-example').attributes('data-analytics-ignore')).toBeDefined();
    expect(w.text()).toContain('your concerns about your dependent');
    expect(w.findAll('.kiosk-feedback-example .question')).toHaveLength(3);
    for(const value of ['8','8','8']){
      const group=w.findAll('.kiosk-feedback-example .rating').find(g=>!g.find('[aria-pressed="true"]').exists());
      await group.findAll('button').find(b=>b.text()===value).trigger('click');
    }
    expect(w.text()).toContain('Challenges and wellbeing today');
    expect(w.findAll('.kiosk-feedback-example .question')).toHaveLength(3);
    for(const value of ['6','2','7']){
      const group=w.findAll('.kiosk-feedback-example .rating').find(g=>!g.find('[aria-pressed="true"]').exists());
      await group.findAll('button').find(b=>b.text()===value).trigger('click');
    }
    expect(w.text()).toContain('Review your feedback');
    await w.find('.kiosk-feedback-example form').trigger('submit');
    expect(w.find('.kiosk-content').text()).toContain('You’re checked in.');
    expect(w.find('.arrival-scores').text()).toContain('8.0');
    expect(w.find('.arrival-scores').text()).toContain('7.0');
    await w.find('.showcase-caption button').trigger('click');
    expect(w.find('.kiosk-content').text()).toContain('Make yourself');
    expect(w.find('.kiosk-feedback-example').exists()).toBe(false);
    expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();w.unmount();
  });
  it('keeps skipped questionnaires unscored', async()=>{
    const w=mount(KioskShowcase);await w.find('.kiosk-provider .choose').trigger('click');await w.get('input[value="adult"]').setValue();await w.find('.kiosk-content .primary-action').trigger('click');
    await w.findAll('.kiosk-feedback-example button').find(b=>b.text()==='Skip questionnaires & finish').trigger('click');
    expect(w.findAll('.score-circle').map(e=>e.text())).toEqual(['—out of 10','—out of 10']);w.unmount();
  });
  it('shows therapy messaging and searches locally, with no lab-results content or real send', async()=>{
    vi.clearAllMocks();const w=mount(ConversaShowcase);
    expect(w.text()).toContain('Your between-session worksheet');expect(w.text()).not.toMatch(/lab results/i);
    expect(w.findComponent({name:'SecureMessageBanner'}).exists()).toBe(true);
    await w.findAll('.conversation-channels button').find(b=>b.text()==='SMS').trigger('click');
    expect(w.find('.conversation-reader').text()).toContain('Reply Y to confirm');
    await w.find('.conversation-reply button').trigger('click');expect(w.text()).toContain('No message, notification or appointment update was sent');
    await w.find('.conversation-header>button').trigger('click');await w.find('input[type="search"]').setValue('co-sign');await flushPromises();
    expect(w.findAll('.conversation-list>button')).toHaveLength(1);expect(w.find('.conversation-reader').text()).toContain('Co-sign review');
    expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();expect(api.put).not.toHaveBeenCalled();w.unmount();
  });
});
