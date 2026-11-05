import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canSeeClientMessagesWindow } from '../clientAlertAccess.js';

it('uses the messages-window gate and keeps the composer off school staff', () => {
  expect(canSeeClientMessagesWindow('school_staff')).toBe(false);
  expect(canSeeClientMessagesWindow('client_guardian')).toBe(false);
  expect(canSeeClientMessagesWindow('provider_plus')).toBe(true);
  expect(canSeeClientMessagesWindow('clinical_practice_assistant')).toBe(true);
  expect(canSeeClientMessagesWindow('supervisor')).toBe(true);

  const panel = readFileSync(path.resolve('src/components/admin/ClientDetailPanel.vue'), 'utf8');
  expect(panel).toContain("v-if=\"showPanel('messages') && canSeeClientMessages\"");
  const schoolModal = readFileSync(path.resolve('src/components/school/redesign/ClientModal.vue'), 'utf8');
  expect(schoolModal).not.toContain('client-alerts');
  expect(schoolModal).not.toContain('Client Alert');
  expect(schoolModal).not.toContain('ClientMessagesTab');
});
