import { describe, expect, it, vi } from 'vitest';
import { clientTerminationDetails, listClientTerminationProviders } from '../clientTerminationDetails.service.js';

const client = { id: 51, agency_id: 2, provider_id: null };
const formerProvider = { id: 37, first_name: 'Former', last_name: 'Provider', is_active: 0, is_archived: 1 };
const database = () => ({ execute: vi.fn(async () => [[formerProvider]]) });

describe('optional historical termination details', () => {
  it('saves unknown details as null without inventing a date or assigning a provider', async () => {
    const db = database();
    await expect(clientTerminationDetails({}, client, db)).resolves.toEqual({
      termination_reason: null, termination_effective_date: null,
      termination_last_provider_id: null, termination_last_provider_name: null
    });
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('records an inactive provider and the exact historical calendar date', async () => {
    const db = database();
    await expect(clientTerminationDetails({ termination_reason: '  Family requested closure  ', termination_date: '2024-02-29', termination_last_provider_id: '37' }, client, db)).resolves.toEqual({
      termination_reason: 'Family requested closure', termination_effective_date: '2024-02-29',
      termination_last_provider_id: 37, termination_last_provider_name: 'Former Provider'
    });
    expect(db.execute.mock.calls[0][1]).toEqual([2, null, 51]);
  });

  it('allows an explicit unknown provider even when a current provider exists', async () => {
    const db = database();
    const details = await clientTerminationDetails({ termination_last_provider_id: null, termination_date: null }, { ...client, provider_id: 37 }, db);
    expect(details.termination_last_provider_id).toBeNull();
    expect(details.termination_effective_date).toBeNull();
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('retains the current provider as history for older callers that omit the new field', async () => {
    expect((await clientTerminationDetails({ termination_reason: 'Services completed' }, { ...client, provider_id: 37 }, database())).termination_last_provider_id).toBe(37);
  });

  it.each(['2025-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'yesterday', '2026-01-01T00:00:00Z'])('rejects invalid date %s', async termination_date => {
    await expect(clientTerminationDetails({ termination_date }, client, database())).rejects.toMatchObject({ status: 400 });
  });

  it.each([-1, 0, 1.5, '37junk', '3e1', true, {}, 9007199254740992])('rejects malformed provider %s', async termination_last_provider_id => {
    await expect(clientTerminationDetails({ termination_last_provider_id }, client, database())).rejects.toMatchObject({ status: 400 });
  });

  it('rejects providers outside the agency and client history', async () => {
    await expect(clientTerminationDetails({ termination_last_provider_id: 999 }, client, database())).rejects.toMatchObject({ status: 400 });
  });

  it.each([{}, 'x'.repeat(2001)])('rejects invalid reasons without truncating them', async termination_reason => {
    await expect(clientTerminationDetails({ termination_reason }, client, database())).rejects.toMatchObject({ status: 400 });
  });

  it('loads historical provider choices without requiring an active account or assignment', async () => {
    await expect(listClientTerminationProviders(client, database())).resolves.toEqual([formerProvider]);
  });
});
