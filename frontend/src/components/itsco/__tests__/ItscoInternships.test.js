import {describe,it,expect,vi,afterEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Internships from '../ItscoInternships.vue';
import {selectInternshipJobs,trainingPeople} from '../itscoInternshipContent';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const data={agency:{id:2},providers:[{id:1,displayName:'Michael Mendez',title:'Director',photoUrl:'/michael.jpg'},{id:3,displayName:'Supervisor Example',title:'Counselor & Supervisor'}],team:[{id:2,displayName:'Rachel Finch',title:'Clinical Director',photoUrl:'/rachel.jpg'}]};
const jobs=[{title:'Mental Health Provider',applicationPublicKey:'provider'},{title:'Mental Health Intern - Colorado Springs',roleType:'Intern',applicationPublicKey:'real-intern-application'}];
const mounts=[];
async function render(section='internships'){const w=mount(Internships,{props:{section,data},global:{stubs:{RouterLink:{props:['to'],template:'<a :href="to"><slot/></a>'},PublicProviderProfileEditor:true}}});mounts.push(w);await flushPromises();return w;}
afterEach(()=>{mounts.splice(0).forEach(w=>w.unmount());vi.clearAllMocks();});
describe('ITSCO internship recruitment',()=>{
 it('links directly to the published internship application and explains supervised phases',async()=>{api.get.mockResolvedValue({data:{jobs}});const w=await render();expect(w.text()).toContain('01 · Practicum');expect(w.text()).toContain('02 · Internship');expect(w.find('a[href$="/intake/real-intern-application"]').text()).toContain('Internship application');expect(w.find('a[href$="/intake/provider"]').exists()).toBe(false);expect(w.text()).toContain('at least once a week');});
 it('uses real founder profiles and the supplied history',async()=>{api.get.mockResolvedValue({data:{jobs}});const w=await render('founders');expect(w.findAll('.intern-person').length).toBe(2);expect(w.find('img[alt="Michael Mendez"]').attributes('src')).toBe('/michael.jpg');expect(w.text()).toContain('Rachel Finch');expect(w.text()).toContain('supervisor and her supervisee');});
 it('shows supervisors from public titles, not all providers',async()=>{api.get.mockResolvedValue({data:{jobs}});const w=await render('supervisors');expect(w.findAll('.intern-person').length).toBe(1);expect(w.text()).toContain('Supervisor Example');});
 it('keeps a clear recovery path if the careers API fails',async()=>{api.get.mockRejectedValue(new Error('offline'));const w=await render();expect(w.text()).toContain('We couldn’t load');expect(w.find('a[href="/careers/itsco"]').exists()).toBe(true);expect(w.find('a[href*="/intake/"]').exists()).toBe(false);});
 it('does not invent an application when no internship is published',async()=>{api.get.mockResolvedValue({data:{jobs:[]}});const w=await render();expect(w.text()).toContain('isn’t a published internship application');});
 it('fair QR opens the mobile internship page, and can be downloaded',async()=>{api.get.mockResolvedValue({data:{jobs}});const w=await render('internship-fair');expect(w.find('.intern-qr-card a').attributes('href')).toBe('https://www.itsco.health/internships');expect(w.find('a[download]').attributes('href')).toBe('/assets/itsco/internships-qr.svg');expect(w.text()).toContain('Full-screen display');});
 it('selects practicum and internship jobs and deduplicates real people',()=>{expect(selectInternshipJobs([...jobs,{title:'Practicum',applicationPublicKey:'p'},{title:'Intern no form'}])).toHaveLength(2);expect(trainingPeople({providers:[{id:1}],team:[{id:1,title:'updated'}]})).toEqual([{id:1,title:'updated'}]);});
});
