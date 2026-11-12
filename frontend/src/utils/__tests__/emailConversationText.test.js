import { describe, it, expect } from 'vitest';
import { emailConversationText } from '../emailConversationText';
describe('conversation email text',()=>{
 it('removes signature and quoted history while preserving the reply',()=>{
  expect(emailConversationText({body_text:'The meeting is at 3.\n\nThanks,\nAlex\nCounselor\nOn Tuesday, Sam wrote:\n> Old reply'})).toBe('The meeting is at 3.');
 });
 it('keeps substantive thanks and links, without email chrome or active HTML',()=>{
  const text=emailConversationText({body_html:'<p>Thanks for your help with this.</p><p><a href="https://school.test/form">Complete the form</a></p><div class="gmail_signature">Signature</div><blockquote>Prior text</blockquote><img src="https://tracker.test/pixel"><script>alert(1)</script>'});
  expect(text).toContain('Thanks for your help with this.');expect(text).toContain('Complete the form (https://school.test/form)');
  expect(text).not.toMatch(/Signature|Prior text|tracker|alert/);
 });
 it('preserves all text if removing a signature would leave an empty reply',()=>{
  expect(emailConversationText({body_text:'Thanks!'})).toBe('Thanks!');
 });
});
