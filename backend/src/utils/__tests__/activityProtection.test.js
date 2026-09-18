vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }), getConnection: vi.fn(() => { throw new Error('Unexpected database access in unit test'); }) } }));
import {describe,it,expect,vi} from 'vitest';
import {recipientCount,resourceReference} from '../../services/activityProtection.service.js';
import {fileOperation} from '../../middleware/activityProtection.middleware.js';
describe('protection classification',()=>{
 it('counts all To/Cc/Bcc addresses including display names and nested arrays',()=>{expect(recipientCount('"Smith, Jane" <jane@example.invalid>', ['a@example.invalid','b@example.invalid'],'hidden@example.invalid')).toBe(4);});
 it('recognizes clinical files, exports, PDFs and direct sensitive storage paths',()=>{for(const originalUrl of ['/api/phi-documents/4/view','/API/PHI-DOCUMENTS/%34/VIEW','/api/phi-documents/signed-school-packets/3','/api/medical-billing/notes/3/treatment-summary-pdf','/api/medical-billing/reports/export.csv','/uploads/phi-documents/a.pdf','/api/agency/4/roster.pdf'])expect(fileOperation({method:'GET',originalUrl})).toBe(true);});
 it('does not consume a file allowance for account security or printable metadata',()=>{for(const originalUrl of ['/api/account-security/sessions','/api/security-evidence/export.csv','/api/school-portal/4/printable-packet/availability'])expect(fileOperation({method:'GET',originalUrl})).toBe(false);});
 it('stores a one-way resource reference instead of clinical filenames or URLs',()=>{expect(resourceReference('private-client-name.pdf')).toMatch(/^[a-f0-9]{64}$/);});
});
