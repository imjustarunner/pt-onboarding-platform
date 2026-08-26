import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDemographicsPaste } from '../demographicsImport.service.js';
import { parseTreatmentPlanText } from '../treatmentPlanImport.service.js';

test('parseDemographicsPaste extracts Frankie fields', () => {
  const text = `Legal Name
Frankie Eschberger

Date of Birth
7/17/2014Age: 12y, 1m, 8d

Address
5410 Escapardo Way
Colorado Springs, CO 80917

Time Zone
MT - Mountain Time, UTC-7 with DST

Mobile Phone
(719) 229-2815
(Text messages OK)

eschfablife@gmail.com

Appt Reminders
Text (SMS) only

Email appointment reminders are recommended as they also include paperwork reminders.

Administrative Sex
Female

Gender Identity
Sexual Orientation`;
  const parsed = parseDemographicsPaste(text);
  assert.equal(parsed.fullName, 'Frankie Eschberger');
  assert.equal(parsed.dateOfBirth, '2014-07-17');
  assert.equal(parsed.addressStreet, '5410 Escapardo Way');
  assert.equal(parsed.addressCity, 'Colorado Springs');
  assert.equal(parsed.addressState, 'CO');
  assert.equal(parsed.addressZip, '80917');
  assert.match(String(parsed.timezone || ''), /Mountain Time/i);
  assert.match(String(parsed.contactPhone || ''), /719/);
  assert.equal(parsed.textMessagesOk, true);
  assert.equal(parsed.email, 'eschfablife@gmail.com');
  assert.match(String(parsed.appointmentReminderType || ''), /Text \(SMS\) only/i);
  assert.equal(parsed.administrativeSex, 'Female');
});

test('parseTreatmentPlanText reads multi-dx goals and discharge', () => {
  const text = `Diagnosis
F40.10	Social Anxiety Disorder
F41.8	Other Specified Anxiety Disorder
Diagnostic Justification
Primary social anxiety with secondary reactivity.
Presenting Problem
The client is an 11-year-old female who has withdrawn from school.
Treatment Goal 1
Reduce Anxiety-Related Overwhelm and Social Avoidance.
Objective 1.1
The client will reduce social anxiety from a current self-reported level of 9 to a 5 or below on a 1–10 scale.
Estimated Completion: 3 months (8/29/2026)
Discharge Criteria/Planning
Discharged when anxiety is managed independently.
Prescribed Frequency of Treatment
Twice a Week`;
  const parsed = parseTreatmentPlanText(text);
  assert.ok(parsed.diagnoses.length >= 2);
  assert.equal(parsed.diagnoses[0].icd10Code, 'F40.10');
  assert.match(String(parsed.diagnoses[0].justification || ''), /social anxiety/i);
  assert.match(String(parsed.presentingProblem || ''), /11-year-old/i);
  assert.equal(parsed.goals.length, 1);
  assert.ok(parsed.goals[0].objectives.length >= 1);
  assert.equal(parsed.goals[0].objectives[0].scaleCurrent, 9);
  assert.equal(parsed.goals[0].objectives[0].scaleTarget, 5);
  assert.match(String(parsed.dischargePlan || ''), /Discharged when/i);
  assert.match(String(parsed.prescribedFrequency || ''), /Twice a Week/i);
});
