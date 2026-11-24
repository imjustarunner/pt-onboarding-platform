// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ReferenceAnswers from '../ReferenceAnswers.vue';
it.each([['manager','Direct supervisor'],['coworker','Colleague or coworker'],['direct_report','I reported to them'],['other','Former project mentor']])('uses the same readable relationship label for review and staff results: %s', (type,label)=>{
 const wrapper=mount(ReferenceAnswers,{props:{answers:{questionnaireVersion:3,referenceName:'QA Reference',relationshipType:type,relationshipOther:type==='other'?'Former project mentor':''},questionnaire:{traits:[]}}});
 expect(wrapper.get('dd').text()).toBe('QA Reference · '+label);wrapper.unmount();
});
