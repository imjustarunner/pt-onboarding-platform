import {expect,it} from 'vitest';
import {emailPreviewText,quoteEmailHistory,quoteEmailHistoryHtml} from '../emailReading';
it('removes signature and quoted history from previews without modifying source',()=>{const body='The actual message\n\n--\nName, title\nCONFIDENTIAL';expect(emailPreviewText(body)).toBe('The actual message');expect(body).toContain('CONFIDENTIAL');expect(emailPreviewText('A short answer\nOn Monday Pat wrote:\nEarlier message')).toBe('A short answer');});
it('cleans signatures in already-collapsed inbox previews',()=>{expect(emailPreviewText('checking personal -- CONFIDENTIALITY NOTICE')).toBe('checking personal');});
it('never quotes internal notes or failed/cancelled sends into outgoing email',()=>{const quote=quoteEmailHistory([{id:1,from:{email:'a@example.org'},body_text:'Actual email'},{id:2,is_internal_note:true,body_text:'Private note'},{id:3,send_status:'cancelled',body_text:'Cancelled'}]);expect(quote).toContain('Actual email');expect(quote).not.toContain('Private note');expect(quote).not.toContain('Cancelled');});

it('quotes the original HTML paragraphs, links and signature instead of the wrapped MIME text',()=>{
 const html=quoteEmailHistoryHtml([{from:{name:'Sender',email:'sender@example.org'},to:[{email:'provider@example.org'}],sent_at:'2026-10-08T22:33:54.000Z',subject:'A question',body_text:'This is a wrapped\nline.\n[image: signature.png]\n<https://example.org>',body_html:'<div>This is a wrapped line.</div><table><tr><td><a href="https://example.org">Website</a></td><td><img src="https://example.org/signature.png" alt="Signature"></td></tr></table>'}]);
 expect(html).toContain('<div>This is a wrapped line.</div>');expect(html).toContain('<table>');expect(html).toContain('>Website</a>');expect(html).toContain('src="https://example.org/signature.png"');expect(html).not.toContain('[image:');expect(html).not.toContain('2026-10-08T');
});
it('sanitizes quoted headers and HTML and excludes notes and unsent mail',()=>{
 const html=quoteEmailHistoryHtml([{from:{name:'<img src=x onerror=alert(1)>'},subject:'<script>bad()</script>',body_html:'<p>Actual message</p><script>bad()</script><img src="https://example.org/a.png" onerror="bad()">'}, {is_internal_note:true,body_html:'Secret note'}, {send_status:'failed',body_html:'Unsent writing'}]);
 expect(html).toContain('Actual message');expect(html).not.toContain('<script>');expect(html).not.toContain('onerror="');expect(html).not.toContain('Secret note');expect(html).not.toContain('Unsent writing');
});
it('preserves intentional plain-text lines and avoids multiplying nested Gmail history',()=>{
 const html=quoteEmailHistoryHtml([{body_text:'First line\nSecond line'},{body_html:'<p>New reply</p><div class="gmail_quote">First line again</div>'}]);
 expect(html).toContain('First line<br>Second line');expect(html).not.toContain('First line again');expect(html.indexOf('New reply')).toBeLessThan(html.indexOf('First line'));
});
