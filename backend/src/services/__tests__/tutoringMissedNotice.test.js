import {it,expect} from 'vitest';
import {buildTutoringMissedNotice} from '../tutoringMissedNotice.js';
const a={id:370,businessType:'tutoring',startAt:'2026-11-18 03:30:00',sourceTimezone:'America/Denver',learningContext:{subjectLabel:'Reading'}};
it('uses the reviewed family wording, local appointment time and exact appointment link',()=>{const result=buildTutoringMissedNotice(a,'https://example.test/guardian?appointmentId=370',{parentFirstName:'Morgan',studentFirstName:'Quinn',tutorFirstName:'Finley'});expect(result.subject).toBe('Missed session: Reading tutoring on Tue, Nov 17, 8:30 PM MST');expect(result.text).toContain('Hi Morgan,');expect(result.text).toContain("Finley marked Quinn's Reading tutoring session");expect(result.text).toContain('this may use a session from your package');expect(result.text).toContain('appointmentId=370');expect(result.text).not.toMatch(/clinical|care team|intake|telehealth|TUTORING/);});
it('keeps the provider copy on this appointment and escapes names in HTML',()=>{const result=buildTutoringMissedNotice(a,'https://example.test/tutoring-session/appointment/370',{studentFirstName:'Quinn <QA>',providerCopy:true});expect(result.subject).toContain('Copy: missed session for Quinn');expect(result.html).toContain('Quinn &lt;QA&gt;');expect(result.text).toContain('/appointment/370');expect(result.text).not.toContain('appointment/290');});

it('opens the staff copy in the same tenant without forwarding guardian parameters',async()=>{
 const {providerTutoringOutcomeUrl}=await import('../tutoringMissedNotice.js');
 expect(providerTutoringOutcomeUrl('https://example.test/nlu-qa-demo/guardian?clientId=7&serviceId=11',420)).toBe('https://example.test/nlu-qa-demo/tutoring-session/appointment/420');
});
