import {mount} from '@vue/test-utils';
import {describe,it,expect} from 'vitest';
import ClinicalReviewContent from '../ClinicalReviewContent.vue';
describe('clinical review document display',()=>{
  it('shows all narrative sections and additions without raw JSON or executable markup',()=>{
    const content=JSON.stringify({note:{sections:{'Presenting Problem':'Needs support <img src=x onerror=alert(1)>',riskAssessment:{denied:false}}},addenda:[{id:2,body:'Additional context',created_by_user_id:9,author_signed_at:'2026-11-01T19:20:00Z'}]});
    const w=mount(ClinicalReviewContent,{props:{content}});
    for(const text of ['Presenting Problem','Needs support <img','Risk Assessment','No','Additional context','Created by user id','9','2026-11-01T19:20:00Z'])expect(w.text()).toContain(text);
    expect(w.find('img').exists()).toBe(false);expect(w.find('pre').exists()).toBe(false);expect(w.text()).not.toContain('{');
  });
  it('keeps ordinary text and nested narrative JSON literal',()=>{
    const w=mount(ClinicalReviewContent,{props:{content:JSON.stringify({note:'{"reported":"by client"}'})}});
    expect(w.text()).toContain('{"reported":"by client"}');
    expect(mount(ClinicalReviewContent,{props:{content:'Plain signed note'}}).text()).toBe('Plain signed note');
  });
});
