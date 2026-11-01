import { expect, it } from 'vitest';
import { clientStatusTone, summarizeClients, documentStatusTone } from '../clientManagementVisuals.js';

it('keeps pending workflow clients out of completed counts even when paperwork is complete or unknown', () => {
  const clients = [
    { status: 'PENDING', paperwork_needed_count: null },
    { status: 'PACKET', paperwork_needed_count: 0 },
    { client_status_key: 'prospective', paperwork_status_key: 'completed' },
    { status: 'ACTIVE', paperwork_needed_count: null },
    { status: 'ON_HOLD', paperwork_needed_count: 0 },
    { paperwork_needed_count: null }
  ];
  expect(clients.map(clientStatusTone)).toEqual(['pending', 'pending', 'pending', 'completed', 'attention', 'neutral']);
  expect(summarizeClients(clients)).toMatchObject({ total: 6, completed: 1, pending: 3, attention: 1, completedPct: '16.7' });
  expect(documentStatusTone({ paperwork_needed_count: null })).toBe('neutral');
  expect(documentStatusTone({ paperwork_needed_count: 0 })).toBe('completed');
});
