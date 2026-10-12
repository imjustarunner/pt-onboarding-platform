import { workspaceMailboxType } from './workspaceMailboxType.service.js';

// A personal app inbox also holds sent history for SSO staff. Its existence is
// not consent to copy that person's Workspace mailbox. Password login alone is
// not evidence of a Group either (some Workspace users have password overrides).
export async function canImportPersonalMailboxEmail(identity) {
  return await workspaceMailboxType(identity?.from_email) === 'group';
}
