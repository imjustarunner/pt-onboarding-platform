import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Body from '../ConversationEmailBody.vue';
it('shows compact text with a full sanitized original available on demand',()=>{
 const wrapper=mount(Body,{props:{message:{body_html:'<p>Hello!</p><div class="gmail_signature">Alex, Counselor</div><blockquote>Earlier reply</blockquote><img src="https://tracker.test/pixel">'}}});
 expect(wrapper.find('.conversation-email-text').text()).toBe('Hello!');
 const original=wrapper.find('details');expect(original.attributes('open')).toBeUndefined();
 expect(original.text()).toContain('Alex, Counselor');expect(original.text()).toContain('Earlier reply');
 expect(wrapper.html()).not.toContain('src="https://tracker.test/pixel"');
});
