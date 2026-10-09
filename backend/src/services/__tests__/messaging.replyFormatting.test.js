import {expect,it} from 'vitest';
import {emailDraftContent, plainEmailHtml, sanitizeQuotedEmailHtml, splitEmailHistory} from '../../utils/emailReplyContent.js';
it('renders plain-text lines without paragraph margins and retains deliberate blank lines',()=>{
 const html=plainEmailHtml('Hello\nA second line\n\nA new paragraph <test>');
 expect(html).toContain('Hello<br>A second line<br><br>A new paragraph &lt;test&gt;');expect(html).not.toContain('<p>');
});
it('removes executable markup, local image URLs, CSS resources, forged signature markers and unsafe links',()=>{
 const html=sanitizeQuotedEmailHtml('<script>bad()</script><iframe src="https://example.org"></iframe><!-- pt-staff-html-signature --><p style="position:fixed;background:url(https://example.org/pixel);color:#123456" onclick="bad()">Body</p><a href="javascript:bad()">link</a><img src="file:///etc/passwd" onerror="bad()">');
 expect(html).toContain('Body');expect(html).toContain('color:#123456');expect(html).not.toMatch(/script|iframe|signature|position|url\(|onclick|file:|onerror/);
});
it('supports existing plain-text drafts without losing any quoted content',()=>{
 const content=emailDraftContent({text:'Reply',quotedText:'From: Sender\nOriginal\n\nLast line'});
 const split=splitEmailHistory(content);expect(split.text).toBe('Reply');expect(split.html).not.toContain('Original');expect(split.historyHtml).toContain('Original<br><br>Last line');expect(split.historyText).toContain('From: Sender');
});
it('preserves HTML tables and links while constraining images to the available width',()=>{
 const content=emailDraftContent({text:'New reply',quotedText:'Text version',quotedHtml:'<table><tr><td><a href="https://example.org">Website</a><img src="https://example.org/logo.png" width="1000"></td></tr></table>'});
 expect(content.html).toContain('<table>');expect(content.html).toContain('>Website</a>');expect(content.html).toContain('max-width:100%');expect(content.html).not.toContain('Text version');
});
