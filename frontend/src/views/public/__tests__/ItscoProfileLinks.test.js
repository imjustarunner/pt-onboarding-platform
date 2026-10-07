import {it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Website from '../ItscoPublicWebsite.vue';

vi.mock('vue-router',()=>({useRoute:()=>({params:{},query:{},fullPath:'/p/itsco'})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async()=>({data:{providers:[]}}))}}));
vi.mock('../../../services/publicWebsiteRead',()=>({
 getCachedPublicWebsite:()=>null,
 readPublicWebsite:vi.fn(async()=>({data:{agency:{id:2},districts:[],team:[],insurances:[],offices:[],metrics:{},providers:[
  {id:465,displayName:'Aunya Albinana',credential:'MA, LPCC',photoUrl:'/public-photo.jpg',specialties:[],bio:'Example biography'},
  {id:466,displayName:'Another Provider',specialties:[],bio:'Example biography'}
 ]}}))
}));

it('links featured provider photos, names, and buttons to public profiles, including initials without a photo',async()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));
 const w=mount(Website,{global:{stubs:{RouterLink:{template:'<a><slot/></a>'},PublicResourcesMenu:true,ItscoCareFinder:true,ItscoServiceMap:true}}});
 try{
  await flushPromises();const cards=w.findAll('.its-featured-card');expect(cards).toHaveLength(2);
  for(const [i,slug] of ['aunya-albinana-465','another-provider-466'].entries()){
   const links=cards[i].findAll('a[data-analytics-kind="profile_open"]');expect(links).toHaveLength(3);
   for(const link of links)expect(link.attributes('href')).toBe(`https://www.itsco.health/providers/${slug}`);
  }
  expect(cards[0].find('.its-featured-photo img').exists()).toBe(true);
  expect(cards[1].find('.its-featured-photo .its-avatar').exists()).toBe(true);
 }finally{w.unmount();vi.unstubAllGlobals();}
});
