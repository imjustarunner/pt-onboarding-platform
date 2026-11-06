import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Reader from '../EmailThreadReader.vue';
it('uses the linked ticket to remove email reply controls even without an explicit read-only flag',()=>{
 const wrapper=mount(Reader,{props:{conversation:{id:10,support_ticket_id:7},messages:[{id:1,body_text:'Payroll question'}]}});
 expect(wrapper.findAll('button').some(button=>['Reply','Reply all','Forward','Keep unread'].includes(button.text()))).toBe(false);
 wrapper.unmount();
});
it('prioritizes the latest email and keeps earlier emails expandable',async()=>{
 const wrapper=mount(Reader,{props:{conversation:{id:10,subject:'Conversation'},messages:[{id:1,body_text:'Earlier email'},{id:2,body_html:'<a href="https://example.org/join">Join meeting</a>'}]}});
 const items=wrapper.findAll('.email-message');expect(items[0].element.open).toBe(false);expect(items[1].element.open).toBe(true);
 expect(items[1].get('a').attributes('href')).toBe('https://example.org/join');
 items[0].element.open=true;await items[0].trigger('toggle');await wrapper.setProps({messages:[{id:1,body_text:'Earlier email'},{id:2,body_text:'Latest refreshed'}]});
 expect(wrapper.findAll('.email-message')[0].element.open).toBe(true);
 await wrapper.get('.actions button').trigger('click');expect(wrapper.emitted('compose')).toEqual([['reply']]);wrapper.unmount();
});
it('shows signature images, lets the reader load other images, and resets that choice for another conversation',async()=>{
 const message={id:8,body_html:'<div class="gmail_signature"><img src="https://lh7-us.googleusercontent.com/signature" width="420"></div><img src="https://outside.test/logo.png" alt="Logo">'};
 const wrapper=mount(Reader,{props:{conversation:{id:20},messages:[message]}});
 expect(wrapper.findAll('.body img')).toHaveLength(1);expect(wrapper.find('.body details').exists()).toBe(false);
 await wrapper.get('.load-images').trigger('click');expect(wrapper.findAll('.body img')).toHaveLength(2);
 await wrapper.setProps({conversation:{id:21}});expect(wrapper.findAll('.body img')).toHaveLength(1);wrapper.unmount();
});

it('uses a compact phone reading layout without changing the source email or losing links',()=>{
 const html='<table style="width:600px;padding:40px;background-color:#ffffff"><tr><td><p>Readable update</p><a href="https://example.org/one" style="background-color:#236644;color:white;padding:20px;width:300px">Open one</a><a href="https://example.org/two" style="background-color:#236644;color:white;padding:20px;width:300px">Open two</a></td></tr></table>';
 const message={id:1,body_html:html,direction:'outbound',from:{name:'Taylor Example',email:'staff@example.invalid'}};
 const wrapper=mount(Reader,{props:{conversation:{id:5},messages:[message],mobile:true,currentUserPhoto:'photos/me.png'}});
 expect(wrapper.get('.body').html()).not.toContain('width: 600px');expect(wrapper.findAll('.body a')).toHaveLength(2);expect(wrapper.get('.body a').element.style.display).toBe('block');expect(message.body_html).toBe(html);expect(wrapper.find('.email-avatar img').exists()).toBe(true);wrapper.unmount();
});
