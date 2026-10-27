import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn()}}));
import { familyEnrollmentContext, familyRecoveryMessage } from '../familyPortalLocale.service.js';

it('resolves recovery language from the signed enrollment within the caring agency', async () => {
  const db={execute:vi.fn().mockResolvedValue([[{language_code:'es',master_channel:'school',school_id:451}]])};
  expect(await familyEnrollmentContext(1452,450,db)).toEqual({agencyId:450,locale:'es',channel:'school',schoolOrganizationId:451});
  expect(db.execute.mock.calls[0][1]).toEqual([1452,450]);
  expect(db.execute.mock.calls[0][0]).toContain('cg.access_enabled=1');
});
it('uses English when no enrollment supplies a language', async () => {
  expect((await familyEnrollmentContext(1440,450,{execute:vi.fn().mockResolvedValue([[]])})).locale).toBe('en');
});
it('renders first-password and recovery messages in Spanish without the staff template', () => {
  const input={locale:'es',firstSet:true,resetLink:'https://app.itsco.health/auricwell-qa-demo/reset-password/test-token',loginEmail:'qa.family@example.com',expiresInHours:24};
  const first=familyRecoveryMessage(input);
  expect(first.subject).toBe('Cree su contraseña');
  expect(first.body).toContain(input.resetLink);
  expect(first.body).toContain('Caduca en 24 horas');
  expect(first.html).toContain('lang="es"');
  expect(first.html).not.toContain('plottwisthq.com');
  expect(familyRecoveryMessage({...input,firstSet:false}).subject).toBe('Restablezca su contraseña');
});
it('escapes display values in the recovery HTML', () => {
  expect(familyRecoveryMessage({locale:'en',loginEmail:'<img src=x>',resetLink:'https://app.itsco.health/reset?x=1&y=2',expiresInHours:24}).html).not.toContain('<img');
});
