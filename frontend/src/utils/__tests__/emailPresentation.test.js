import { expect, it } from 'vitest';
import { readableEmailHtml, emailDeliveryLabel } from '../emailPresentation';
it('preserves email buttons and safe formatting but strips scripts, tracking images and CSS',()=>{
 const result=readableEmailHtml({body_html:'<p onclick="bad()" style="position:fixed">Hello <b>Reader</b></p><a href="https://example.org/meeting">Join meeting</a><img src="https://tracker.test/pixel"><script>bad()</script><iframe src="https://bad.test"></iframe>'});
 const div=document.createElement('div');div.innerHTML=result;
 expect(div.querySelector('b').textContent).toBe('Reader');expect(div.querySelector('a').href).toBe('https://example.org/meeting');expect(div.querySelector('a').rel).toBe('noopener noreferrer');
 expect(result).not.toMatch(/onclick|style=|<img|<script|<iframe/);
});
it('rejects executable, relative and data links',()=>{
 const html=readableEmailHtml({body_html:'<a href="javascript:alert(1)">A</a><a href="data:text/html,bad">B</a><a href="/logout">C</a><a href="mailto:sender@example.org">D</a>'});
 const div=document.createElement('div');div.innerHTML=html;
 expect([...div.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))).toEqual(['mailto:sender@example.org']);
});
it('linkifies plain text without interpreting it as HTML',()=>{
 const html=readableEmailHtml({body_text:'<img src=x onerror=bad()> Open https://example.org/path. Thank you.'});
 const div=document.createElement('div');div.innerHTML=html;
 expect(div.querySelector('img')).toBeNull();expect(div.querySelector('a').href).toBe('https://example.org/path');expect(div.textContent).toContain('<img src=x');expect(div.textContent).toContain('path. Thank');
});
it('keeps quoted history and signatures accessible behind collapsed details',()=>{
 const div=document.createElement('div');div.innerHTML=readableEmailHtml({body_html:'<p>New reply</p><blockquote>Old reply</blockquote><div class="gmail_signature">Signature</div>'});
 expect(div.querySelectorAll('details')).toHaveLength(2);expect(div.querySelector('details').open).toBe(false);expect(div.textContent).toContain('Old reply');expect(div.textContent).toContain('Signature');
});
it('does not describe a queued email as sent',()=>{
 expect(emailDeliveryLabel({send_status:'scheduled'})).toBe('Queued for delivery');
 expect(emailDeliveryLabel({send_status:'failed'})).toContain('not confirmed');
 expect(emailDeliveryLabel({send_status:'sent',direction:'outbound'})).toBe('Sent');
});
