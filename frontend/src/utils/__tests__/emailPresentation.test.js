import { expect, it } from 'vitest';
import { readableEmailHtml, renderEmailContent, emailDeliveryLabel } from '../emailPresentation';
it('preserves email buttons and safe formatting but strips scripts, tracking images and unsafe CSS',()=>{
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
it('shows signatures while keeping quoted history behind collapsed details',()=>{
 const div=document.createElement('div');div.innerHTML=readableEmailHtml({body_html:'<p>New reply</p><blockquote>Old reply</blockquote><div class="gmail_signature">Signature</div>'});
 expect(div.querySelectorAll('details')).toHaveLength(1);expect(div.querySelector('details').textContent).not.toContain('Signature');expect(div.querySelector('details').open).toBe(false);expect(div.textContent).toContain('Old reply');expect(div.textContent).toContain('Signature');
});
it('does not describe a queued email as sent',()=>{
 expect(emailDeliveryLabel({send_status:'scheduled'})).toBe('Queued for delivery');
 expect(emailDeliveryLabel({send_status:'failed'})).toContain('not confirmed');
 expect(emailDeliveryLabel({send_status:'sent',direction:'outbound'})).toBe('Sent');
});
it('displays hosted signature images and safe table formatting without app-level styles',()=>{
 const {html,hasBlockedImages}=renderEmailContent({body_html:'<div class="gmail_signature"><table style="color:#123456;background-color:#ffffff;position:fixed;z-index:999"><tr><td style="padding:8px;font-size:14px;background-image:url(https://tracker.test)"><img src="https://ci3.googleusercontent.com/signature" width="420" height="153" onerror="bad()" style="width:420px;position:absolute" /><a href="https://example.org">Contact</a></td></tr></table></div>'});
 const div=document.createElement('div');div.innerHTML=html;
 expect(div.querySelector('img').getAttribute('src')).toBe('https://ci3.googleusercontent.com/signature');
 expect(div.querySelector('img').getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(div.querySelector('table').style.color).toBe('rgb(18, 52, 86)');
 expect(div.querySelector('td').style.padding).toBe('8px');
 expect(div.querySelector('details')).toBeNull();expect(hasBlockedImages).toBe(false);
 expect(html).not.toMatch(/onerror|position:|z-index|background-image|tracker\.test/);
});
it('requires an explicit choice for other external images and never renders tracking pixels',()=>{
 const message={body_html:'<img src="https://example.org/signature.png" width="400"><img src="https://example.org/pixel" width="1" height="1"><img src="https://plottwisthq.com/api/email/track-open/token"><img src="https://lh7-us.googleusercontent.com/hidden" style="display:none">'};
 expect(renderEmailContent(message).hasBlockedImages).toBe(true);
 expect(readableEmailHtml(message)).not.toContain('<img');
 const div=document.createElement('div');div.innerHTML=readableEmailHtml(message,{loadExternalImages:true});
 expect(div.querySelectorAll('img')).toHaveLength(1);expect(div.querySelector('img').getAttribute('src')).toBe('https://example.org/signature.png');
});
it('rejects unsafe image sources and does not mistake lookalike hosts for hosted signatures',()=>{
 const result=renderEmailContent({body_html:'<img src="javascript:bad()"><img src="data:image/svg+xml,bad"><img src="/api/logout"><img src="https://user:pass@ci3.googleusercontent.com/photo"><img src="https://ci3.googleusercontent.com.evil.test/photo" alt="Signature">'});
 expect(result.html).not.toContain('<img');expect(result.hasBlockedImages).toBe(true);
 expect(result.html).toContain('[Image: Signature]');
});
