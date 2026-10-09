import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {STAFF_COMMUNICATION_REQUESTS} from '../../../../../backend/src/utils/staffCommunicationChoices.js';
import StaffCommunicationChoices from '../StaffCommunicationChoices.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),put:vi.fn()}}));
const initial={agencyId:2,phone:'+13035550101',disclosureHash:'hash',reviewedAt:null,needsReview:true,activation:[],choices:{notifications:false,messageAlerts:false,polling:false},disclosure:{accessRequests:STAFF_COMMUNICATION_REQUESTS,policyReady:true,brandName:'ITSCO',legalName:'ITSCO, LLC',text:'Optional texts. All choices may be No.',termsUrl:'https://itsco.health/terms',privacyUrl:'https://itsco.health/privacy',programs:[],future:'Forwarding and calling are not available.',choices:[{key:'notifications',label:'Reminders',description:'Meetings and staff updates'},{key:'messageAlerts',label:'Message alerts',description:'Generic alerts'},{key:'polling',label:'Voting',description:'Optional polls'}]}};
async function declineAll(w){for(const radio of w.findAll('input[type=radio][value=false]'))await radio.setValue();}
describe('staff phone choices',()=>{
 it('leaves enrollment off and requires explicit choices plus a signature',()=>{const w=mount(StaffCommunicationChoices,{props:{initial,externalSave:true}});expect(w.findAll('input[type=radio]').filter(x=>x.element.checked).map(x=>x.element.value)).toEqual([]);expect(w.get('button').element.disabled).toBe(true);expect(w.text()).toContain('Enrollment preferences');expect(w.text()).toContain('not available');});
 it('allows all No to complete review without enabling any category',async()=>{const w=mount(StaffCommunicationChoices,{props:{initial,externalSave:true}});await declineAll(w);await w.get('input[autocomplete=name]').setValue('Example Provider');for(const checkbox of w.findAll('input[type=checkbox]'))await checkbox.setValue(true);await w.get('form').trigger('submit.prevent');expect(w.emitted('save')[0][0]).toMatchObject({choices:{notifications:false,messageAlerts:false,polling:false},signerName:'Example Provider',acknowledged:true});});
 it('lets a provider choose alerts separately from reminders and voting',async()=>{const w=mount(StaffCommunicationChoices,{props:{initial,externalSave:true}});await declineAll(w);await w.get('input[autocomplete=name]').setValue('Example Provider');for(const checkbox of w.findAll('input[type=checkbox]'))await checkbox.setValue(true);await w.get('input[name$=messageAlerts][value=true]').setValue();await w.get('form').trigger('submit.prevent');expect(w.emitted('save')[0][0].choices).toEqual({notifications:false,messageAlerts:true,polling:false,exchangeMatches:false});});
 it('makes a pending enrollment visible without claiming delivery is active',()=>{const w=mount(StaffCommunicationChoices,{props:{initial:{...initial,reviewedAt:'2026-10-06T20:00:00Z',activation:[{status:'pending_campaign'}]}}});expect(w.text()).toContain('not active yet');expect(w.text()).not.toContain('categories are enrolled');});
});

it('records forwarding interest separately from SMS consent and disables preview submission',async()=>{const w=mount(StaffCommunicationChoices,{props:{initial,externalSave:true}});await declineAll(w);await w.get('input[autocomplete=name]').setValue('Example Provider');for(const checkbox of w.findAll('input[type=checkbox]'))await checkbox.setValue(true);await w.get('input[name$=personalSmsRelay][value=true]').setValue();await w.get('form').trigger('submit.prevent');expect(w.emitted('save')[0][0]).toMatchObject({accessRequests:{inAppTexting:false,personalSmsRelay:true},choices:{notifications:false,messageAlerts:false,polling:false}});await w.setProps({readonly:true});await w.get('form').trigger('submit.prevent');expect(w.emitted('save')).toHaveLength(1);});

it('does not submit an unsigned communications agreement even when text choices are acknowledged',async()=>{
 const w=mount(StaffCommunicationChoices,{props:{initial,externalSave:true}});
 await declineAll(w);await w.get('input[autocomplete=name]').setValue('Example Provider');
 await w.findAll('input[type=checkbox]')[1].setValue(true);
 await w.get('form').trigger('submit.prevent');expect(w.emitted('save')).toBeUndefined();
 await w.get('[data-testid=usage-ack]').setValue(true);await w.get('form').trigger('submit.prevent');
 expect(w.emitted('save')[0][0].usageAcknowledged).toBe(true);
});
