import { expect, it } from 'vitest';
import { cancellationClientLabel, selectedCancellationLetters } from '../cancellationEmailReview';
const message = { subject: 'Updated subject', text: 'Generic', guardian: { subject: 'Old subject', text: 'Parent email' }, client: { text: 'Client email' } };
const adult = { recipients: ['Client record #12'], clients: [{ clientId: 12, clientName: 'Example Adult', mode: 'client', recipients: [{ key: 'client', role: 'client', email: 'adult@example.test' }] }] };
it('shows the authorized client name and only the selected adult email', () => {
  expect(cancellationClientLabel(adult)).toBe('Example Adult');
  expect(selectedCancellationLetters(adult, message)).toEqual([{ audience: 'client', label: 'Client email', message: { subject: 'Updated subject', text: 'Client email' } }]);
});
it('uses the selected recipient role, not the client’s age, for guardians and authorized adult caregivers', () => {
  const item = { clients: [{ clientId: 12, clientName: 'Client', mode: 'guardian', recipients: [{ role: 'guardian', email: 'caregiver@example.test' }] }] };
  expect(selectedCancellationLetters(item, message).map(letter => letter.audience)).toEqual(['guardian']);
  const choices = { 12: { mode: 'both', recipients: [{ role: 'guardian' }, { role: 'client' }] } };
  expect(selectedCancellationLetters(item, message, choices).map(letter => letter.audience)).toEqual(['guardian', 'client']);
  choices[12].recipients[0].enabled = false;
  expect(selectedCancellationLetters(item, message, choices).map(letter => letter.audience)).toEqual(['client']);
  choices[12].mode = 'none'; expect(selectedCancellationLetters(item, message, choices)).toEqual([]);
});
it('keeps older single-body messages available for selected recipients', () => {
  expect(selectedCancellationLetters(adult, { subject: 'Subject', text: 'Older draft' })[0].message.text).toBe('Older draft');
});
