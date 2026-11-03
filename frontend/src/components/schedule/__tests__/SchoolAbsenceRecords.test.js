import {describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
import Records from '../SchoolAbsenceRecords.vue';
describe('school soft-schedule and medical-file cancellation evidence',()=>{
 it('distinguishes upcoming, accepted email, and missing-contact occurrences using text and color',()=>{
  const w=mount(Records,{props:{schedule:true,records:[
   {key:'a',date:'2026-11-16',clientName:'One',schoolName:'School',canceled:false,explanation:'This session is displaying due to SCHOOL soft schedule.'},
   {key:'b',date:'2026-11-16',clientName:'Two',schoolName:'School',canceled:true,delivery:{sent:1,deliveries:[{status:'sent',recipient_name:'Parent',recipient_address:'parent@example.com',sent_at:'2026-11-02 19:00:00'}]}},
   {key:'c',date:'2026-11-16',clientName:'Three',schoolName:'School',canceled:true,delivery:{sent:0,skipped:1,deliveries:[{status:'skipped',recipient_address:'',error_message:'No family email on file'}]}}
  ]}});
  expect(w.findAll('section>details')).toHaveLength(3);expect(w.findAll('.attention')).toHaveLength(1);expect(w.findAll('.sent')).toHaveLength(1);
  expect(w.text()).toContain('inbox receipt unconfirmed');expect(w.text()).toContain('Parent · parent@example.com');expect(w.text()).toContain('No email on file');expect(w.text()).toContain('SCHOOL soft schedule');
 });
 it('loads the same retained evidence through the authorized client history endpoint',async()=>{
  m.get.mockResolvedValue({data:{records:[{id:1,date:'2026-11-16',clientName:'Client',schoolName:'School',delivery:{held:1,reason:'Delivery uncertain'}}]}});
  const w=mount(Records,{props:{clientId:2337}});await flushPromises();expect(m.get).toHaveBeenCalledWith('/clients/2337/school-absence-history',expect.any(Object));expect(w.text()).toContain('Delivery uncertain');
 });
});

it('shows explicit recipient confirmation separately from transport acceptance',()=>{
 const w=mount(Records,{props:{records:[{id:1,date:'2026-11-16',clientName:'Child',schoolName:'School',delivery:{sent:1,deliveries:[{status:'sent',recipient_address:'parent@example.test',receiptRequired:true,receiptConfirmedAt:'2026-11-02 21:00:00'}]}}]}});
 expect(w.text()).toContain('Receipt confirmed 2026-11-02 21:00:00');expect(w.find('summary').text()).toContain('receipt confirmed');w.unmount();
});
