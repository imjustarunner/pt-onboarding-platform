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

it('renders an XML-prefixed HTML message stored as plain text through the sanitized views', () => {
  const wrapper = mount(Body, { props: { message: { body_text:
    '<?xml version="1.0" encoding="utf-16"?><html><head><title>Vendor</title><style>.button {padding:24px}</style></head><body><p>Use this code to sign in.</p><img src="https://example.invalid/tracker"><script>unsafe()</script></body></html>'
  } } });
  expect(wrapper.get('.conversation-email-text').text()).toBe('Use this code to sign in.');
  expect(wrapper.get('details').text()).toContain('Use this code to sign in.');
  expect(wrapper.text()).not.toMatch(/padding|<html>|unsafe\(\)/);
  expect(wrapper.find('img').exists()).toBe(false);
});
