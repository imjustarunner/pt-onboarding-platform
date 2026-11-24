import{shallowMount}from'@vue/test-utils';import{it,expect,vi}from'vitest';vi.mock('../../../../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:{}})}}));import Hub from'../ClientOverviewHub.vue';
it('emits a dedicated secure-composer action rather than the contact documentation/history route',async()=>{const w=shallowMount(Hub,{props:{clientId:2542,canSendSecureMessage:true}});await w.findAll('button').find(b=>b.text()==='Send secure message').trigger('click');expect(w.emitted('secure-message')).toHaveLength(1);expect(w.emitted('navigate')).toBeUndefined();w.unmount();});
it('does not offer secure family composition without an eligible chart action',()=>{const w=shallowMount(Hub,{props:{clientId:2542,canSendSecureMessage:false}});expect(w.findAll('button').some(b=>b.text()==='Send secure message')).toBe(false);w.unmount();});

it('shows both linked guardian accounts with their own canonical contact channels even without an intake profile',async()=>{
 const w=shallowMount(Hub,{props:{clientId:8,guardianName:'Fallback first parent',linkedGuardians:[
  {guardian_user_id:20,relationship_type:'guardian',first_name:'First',last_name:'Parent',email:'first@example.test',phone:'303-555-0100',relationship_title:'Father',is_active:1},
  {guardian_user_id:21,relationship_type:'guardian',first_name:'Second',last_name:'Parent',email:'second@example.test',phone_number:'303-555-0101',relationship_title:'Mother',is_active:1},
  {guardian_user_id:22,relationship_type:'guardian',first_name:'Revoked',email:'revoked@example.test',permissions_json:'{"relationshipRevoked":true}'},
  {guardian_user_id:23,relationship_type:'self',first_name:'Child',email:'child@example.test'}
 ]}});
 const cards=w.findAll('.cc-contact');expect(cards).toHaveLength(2);
 expect(cards[0].text()).toContain('Parent / Guardian 1');expect(cards[0].text()).toContain('First Parent');expect(cards[0].get('a[href="mailto:first@example.test"]').exists()).toBe(true);expect(cards[0].get('a[href="tel:3035550100"]').exists()).toBe(true);
 expect(cards[1].text()).toContain('Parent / Guardian 2');expect(cards[1].text()).toContain('Second Parent');expect(cards[1].get('a[href="mailto:second@example.test"]').exists()).toBe(true);expect(cards[1].get('a[href="tel:3035550101"]').exists()).toBe(true);
 expect(w.text()).not.toContain('No phone on file');expect(w.text()).not.toContain('Revoked');
 await w.setProps({clientId:9,guardianName:'Next chart contact',linkedGuardians:[]});expect(w.text()).toContain('Next chart contact');expect(w.text()).not.toContain('Second Parent');w.unmount();
});
