import {describe,it,expect} from 'vitest';
import {meetingFollowupContent} from '../meetingFollowupContent.service.js';
import {compactSchoolCareBridgeEmail} from '../schoolCareBridgeEmail.service.js';
describe('meeting follow-up email',()=>{
 it('includes the saved notes and separate authenticated summary and transcript destinations',()=>{
  const content=meetingFollowupContent({title:'CPA',summary:'## Tasks by person\n- **Pat**: Send the schedule\n## Suggested next steps\n- Review options',url:'https://example.test/agency/my-meetings?type=team&meetingId=7&tab=Summary'});
  expect(content.html).toContain('<strong>Pat</strong>');expect(content.html).toContain('tab=Transcript');expect(content.html).toContain('tab=Summary');expect(content.text).toContain('Send the schedule');
 });
 it('renders transcript-derived HTML and links as text, never executable markup',()=>{
  const content=meetingFollowupContent({title:'<script>bad</script>',summary:'<img src=x onerror=alert(1)>\n[Click](javascript:alert(1))',url:'https://example.test/my-meetings'});
  expect(content.html).not.toContain('<script>');expect(content.html).not.toContain('<img');expect(content.html).not.toContain('href="javascript:');
 });
});
describe('compact school network attribution',()=>{
 it('adds the block to packet receipts once in HTML and plain text',()=>{
  const input={html:'<p>Packet received</p>',text:'Packet received',templateType:'school_enrollment_packet_status'};
  const first=compactSchoolCareBridgeEmail(input),second=compactSchoolCareBridgeEmail({...first,templateType:input.templateType});
  expect(first).toEqual(second);expect(first.html).toContain('SchoolCareBridge');expect(first.text).toContain('A program of MH4Kidz');
 });
 it('replaces the oversized legacy welcome block without altering its neighboring content',()=>{
  const html='<p>Welcome</p><div style="padding:20px"><img src="https://plottwisthq.com/assets/schoolcarebridge/logo.png" width="200"><p style="margin:0">Part of the SchoolCareBridge network</p><p>A program of MH4Kidz</p><a href="https://plottwisthq.com/schoolcarebridge">Learn about SchoolCareBridge</a></div><p>Signature</p>';
  const result=compactSchoolCareBridgeEmail({html});expect(result.html).toContain('data-schoolcarebridge="compact"');expect(result.html).not.toContain('width="200"');expect(result.html).toContain('<p>Signature</p>');expect(result.html).toContain('<p>Welcome</p>');
 });
});
