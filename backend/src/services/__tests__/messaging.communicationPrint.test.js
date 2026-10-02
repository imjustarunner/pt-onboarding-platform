import {describe,it,expect} from 'vitest';
import {communicationPrintDocument} from '../communicationPrint.service.js';
describe('communication record printing',()=>{
  it('includes every message, sender, recipients, timestamp and purpose without executing message HTML',()=>{
    const messages=Array.from({length:301},(_,i)=>({body_text:`Message ${i} <script>alert(1)</script>`,from:{name:'Sender',email:'sender@example.test'},to:[{email:'parent@example.test'}],cc:[{email:'copy@example.test'}],sent_at:'2026-10-01T12:30:00Z',send_status:'sent'}));
    const html=communicationPrintDocument('Record <unsafe>',[{subject:'Thread',documentation:[{purpose:'Scheduling <img onerror=bad>',author:'Provider',completed:true,reviewedThroughId:301}],messages}]);
    expect(html).toContain('Message 300');expect(html).toContain('parent@example.test');expect(html).toContain('copy@example.test');expect(html).toContain('2026-10-01T12:30:00.000Z');expect(html).toContain('Scheduling &lt;img');expect(html).not.toContain('<script>');expect(html).not.toContain('<unsafe>');
  });
});
