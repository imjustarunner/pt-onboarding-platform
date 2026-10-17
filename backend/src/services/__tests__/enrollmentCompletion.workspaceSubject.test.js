import { it, expect } from 'vitest';
import { resolveWorkspaceSubject } from '../googleWorkspaceSubject.service.js';
it('keeps migrated staff correspondence groups attached to their original login identities',()=>{
 expect(resolveWorkspaceSubject(' Michael@ITSCO.health ')).toBe('michael@plottwistco.com');
 expect(resolveWorkspaceSubject('loriana@itsco.health')).toBe('loriana@plottwistco.com');
 expect(resolveWorkspaceSubject('hannah@itsco.health')).toBe('hannah@plottwistco.com');
 expect(resolveWorkspaceSubject('kaitlyn@itsco.health')).toBe('kaitlyn@plottwistco.com');
});
it('does not grant impersonation based on arbitrary group names or membership',()=>{
 expect(resolveWorkspaceSubject('portal@auricwell.com')).toBe('portal@auricwell.com');
 expect(resolveWorkspaceSubject('someone@agency.test')).toBe('someone@agency.test');
});
