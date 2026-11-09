import {it,expect,vi,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:m}));
import Notice from '../SchoolClosureDashboardNotice.vue';
const time=Date.now();
const item={eventId:313,revision:'abc',title:'No school',district:'D11',startsAt:new Date(time-60000).toISOString(),endsAt:new Date(time+60000).toISOString(),timeZone:'America/Denver',schools:[{id:430,name:'Keller'}],splashDismissed:false};
const mounted=[];afterEach(()=>{mounted.splice(0).forEach(w=>w.unmount());document.body.innerHTML='';vi.restoreAllMocks();});
async function open(closure=item){m.get.mockResolvedValue({data:{closures:[{...closure}]}});m.post.mockResolvedValue({data:{dismissed:true}});const w=mount(Notice,{attachTo:document.body,global:{stubs:{Teleport:true}}});mounted.push(w);await flushPromises();return w;}
it('shows the banner and splash with district, schools and duration',async()=>{const w=await open();expect(w.text()).toContain('D11');expect(w.text()).toContain('Keller');expect(w.find('[role="dialog"]').exists()).toBe(true);expect(w.text()).toContain('America/Denver');});
it('dismisses the splash through the server and leaves the banner',async()=>{const w=await open();await w.findAll('button').find(b=>b.text()==='I understand').trigger('click');await flushPromises();expect(m.post).toHaveBeenCalledWith('/dashboard/school-closures/313/dismiss',{revision:'abc'});expect(w.find('[role="dialog"]').exists()).toBe(false);expect(w.find('[role="status"]').exists()).toBe(true);});
it('a saved acknowledgement does not reopen automatically but permits reviewing details',async()=>{const w=await open({...item,splashDismissed:true});expect(w.find('[role="dialog"]').exists()).toBe(false);await w.findAll('button').find(b=>b.text()==='Review closure details').trigger('click');expect(w.find('[role="dialog"]').exists()).toBe(true);});
it('ends the banner and splash when the calendar duration has passed',async()=>{const w=await open({...item,endsAt:new Date(time-1000).toISOString()});expect(w.find('[role="status"]').exists()).toBe(false);expect(w.find('[role="dialog"]').exists()).toBe(false);});
