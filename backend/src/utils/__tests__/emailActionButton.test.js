import {it,expect} from 'vitest';
import {emailActionButton,standardizeEmailButtons} from '../emailActionButton.js';
import {supervisionDisplayTitle} from '../supervisionDisplayTitle.js';
import {agencyActionColor} from '../agencyBrandColor.js';
it('uses NLU’s saved navy and keeps other agencies’ own primary colors',()=>{
 const navy=agencyActionColor({slug:'nlu',color_palette:{primary:'#6FCFBE',secondary:'#1F2A44'}});
 expect(navy).toBe('#1F2A44');
 const html=standardizeEmailButtons(emailActionButton('Join','/join',true)+emailActionButton('RSVP','/rsvp'),navy);
 expect(html).toContain('background:#1F2A44');expect(html).toContain('border:1px solid #1F2A44');expect(html).not.toContain('#34734f');
 expect(agencyActionColor({color_palette:'{"primary":"#773399"}'})).toBe('#773399');
 expect(standardizeEmailButtons(emailActionButton('Join','/join',true),'red;display:none')).not.toContain('display:none');
});
it('escapes button content and matches the supervision action style',()=>{
 const html=emailActionButton('<Join>','https://example.test/?a=1&b=2',true);
 expect(html).toContain('&lt;Join&gt;');expect(html).toContain('&amp;b=2');expect(html).toContain('display:block');expect(html).toContain('background:#34734f');
});
it('restyles CTA buttons without turning ordinary links into buttons',()=>{
 const text='<a href="/reply">Reply</a><a href="/notes" style="display:inline-block;background:#17634b;color:#fff;padding:12px 18px;border-radius:8px">Notes</a>';
 const result=standardizeEmailButtons(text);
 expect(result).toContain('<a href="/reply">Reply</a>');expect(result).toContain('padding:15px 20px');expect(result).toContain('background:#34734f');expect(standardizeEmailButtons(result)).toBe(result);
});
it.each([['2026-10-16 00:00:00','Individual Supervision–Mia 10/15/26 – 6pm'],['2026-11-13 01:30:00','Individual Supervision–Mia 11/12/26 – 6:30pm']])('formats individual supervision titles in Mountain time', (start,title)=>{
 expect(supervisionDisplayTitle({session_type:'individual',start_at:start,event_timezone:'America/Denver'},'Mia')).toBe(title);
});
