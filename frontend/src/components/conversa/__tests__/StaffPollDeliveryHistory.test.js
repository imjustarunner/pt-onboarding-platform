import {it,expect} from 'vitest';import{mount}from'@vue/test-utils';import History from '../StaffPollDeliveryHistory.vue';
it('shows every selected recipient, actual receipt times and distinct follow-ups',()=>{
 const w=mount(History,{props:{history:{title:'Dinner date',recipients:[{userId:1,name:'Paige',status:'answered',explanation:'Already answered in the app; no additional invitation was needed.',answeredAt:'2026-11-09T18:40:22Z',responseSource:'in_app',lastViewedAt:null}],logs:[{id:2,name:'Rachel',channel:'sms',dispatchType:'poll_followup',occurrenceKey:'manual:abc',status:'delivered',sentAt:'2026-11-09T19:48:20Z',deliveredAt:'2026-11-09T19:48:23Z'}]}}});
 expect(w.text()).toContain('Paige');expect(w.text()).toContain('no additional invitation');expect(w.text()).toContain('Manual follow-up');expect(w.text()).toContain('Delivered');expect(w.text()).toContain('Not recorded');expect(w.text()).toContain('not that the person read it');w.unmount();
});
