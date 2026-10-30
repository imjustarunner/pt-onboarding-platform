import { expect, it, vi } from 'vitest';
import fs from 'node:fs';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
import { persistSubmissionRoster, restoreSubmissionRoster, submittedChildCount, submissionArtifactsComplete } from '../enrollmentSubmissionRoster.service.js';
import { isDobAdultLocked } from '../../utils/guardianWaivers.utils.js';

it('saves both child references before document generation, without duplicating a retry', async () => {
 const saved = [{ client_id: 5 }];
 const deps = { rows: { listBySubmissionId: async () => saved, create: vi.fn(async data => saved.push({ client_id: data.clientId })) } };
 const children = [{ id: 5, full_name: 'First Child' }, { id: 6, full_name: 'Second Child' }];
 await persistSubmissionRoster(18, children, deps);
 await persistSubmissionRoster(18, children, deps);
 expect(deps.rows.create).toHaveBeenCalledTimes(1);
 expect(deps.rows.create).toHaveBeenCalledWith(expect.objectContaining({ intakeSubmissionId: 18, clientId: 6 }));
});
it('restores both siblings in saved order after only the first document was generated', async () => {
 const deps = { rows: { listBySubmissionId: async () => [{ client_id: 5, bundle_pdf_path: 'first.pdf' }, { client_id: 6 }] },
  clients: { findById: async id => ({ id, agency_id: 450 }) } };
 expect(await restoreSubmissionRoster({ id: 18, client_id: 5 }, 2, 450, deps)).toEqual([{ id: 5, agency_id: 450 }, { id: 6, agency_id: 450 }]);
});
it('requires all children’s artifacts and a successful generation status before returning completed', () => {
 const submission = { intake_data: { clients: [{ fullName: 'First' }, { fullName: 'Second' }, {}] } };
 const count = submittedChildCount(submission.intake_data);
 expect(count).toBe(2);
 expect(submissionArtifactsComplete(submission, [{ bundle_pdf_path: 'first.pdf' }, {}], count)).toBe(false);
 expect(submissionArtifactsComplete(submission, [{ bundle_pdf_path: 'first.pdf' }], count)).toBe(false);
 expect(submissionArtifactsComplete(submission, [{ bundle_pdf_path: 'first.pdf' }, { bundle_pdf_path: 'second.pdf' }], count)).toBe(true);
 expect(submissionArtifactsComplete({ ...submission, intake_data: { packetGeneration: { status: 'needs_review' } } }, [{ bundle_pdf_path: 'first.pdf' }, { bundle_pdf_path: 'second.pdf' }], count)).toBe(false);
});
it.each([null, { id: 5, agency_id: 2 }, { id: 5, agency_id: 450 }])('preserves answers and asks for review when a saved two-child roster is incomplete or unsafe: %j', async client => {
 const deps = { rows: { listBySubmissionId: async () => [{ client_id: 5 }] }, clients: { findById: async () => client } };
 await expect(restoreSubmissionRoster({ id: 18, client_id: 5 }, 2, 450, deps)).rejects.toThrow('answers and signatures are saved');
});
it('allows an adult’s self profile while retaining adult-dependent and no-view restrictions', () => {
 const source = fs.readFileSync(new URL('../../controllers/guardianPortal.controller.js', import.meta.url), 'utf8');
 const start = source.indexOf('function enrichGuardianClientRow('), end = source.indexOf('function isSuperadminGuardianPreview(', start);
 const enrich = new Function('ClientGuardian', 'isDobAdultLocked', 'firstNameOnly', `${source.slice(start, end)} return enrichGuardianClientRow;`)
  ({ isNoView: p => p?.noView === true }, isDobAdultLocked, name => name.split(' ')[0]);
 const adult = { full_name: 'Pat Example', date_of_birth: '1985-01-01' };
 expect(enrich({ ...adult, relationship_type: 'self' }).guardian_portal_locked).toBe(false);
 expect(enrich({ ...adult, relationship_type: 'guardian' }).guardian_portal_locked).toBe(true);
 expect(enrich({ ...adult, relationship_type: 'self', permissions_json: { noView: true } })).toMatchObject({ no_view: true, date_of_birth: null, full_name: 'Pat' });
});
