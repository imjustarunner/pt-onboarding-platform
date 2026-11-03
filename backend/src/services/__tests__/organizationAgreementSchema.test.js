import { expect,it,vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { ensureOrganizationAgreementSchema } from '../organizationAgreementSchema.js';
it('uses the checked-in idempotent migration for both archive tables',async()=>{
 const db={query:vi.fn()};await ensureOrganizationAgreementSchema(db);expect(db.query).toHaveBeenCalledTimes(2);expect(db.query.mock.calls.map(([sql])=>sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1])).toEqual(['organization_agreement_records','organization_agreement_audit']);
 expect(db.query.mock.calls.every(([sql])=>!/^(?:DROP|DELETE|TRUNCATE|UPDATE)\s/i.test(sql))).toBe(true);
});
it('fails startup readiness if the required archive schema cannot be created',async()=>{
 const db={query:vi.fn().mockRejectedValue(Error('schema unavailable'))};await expect(ensureOrganizationAgreementSchema(db)).rejects.toThrow('schema unavailable');
});
