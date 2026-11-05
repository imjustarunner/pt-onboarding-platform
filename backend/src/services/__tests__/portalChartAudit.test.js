import { expect, it, vi } from 'vitest';
import { clientIdFromEvidence, portalChartAction, projectPortalChartAccess } from '../portalChartAudit.service.js';

it('names the opened portal screen without treating an agency id as a client', () => {
  expect(portalChartAction('/api/guardian-portal/clients/:clientId/intake-documents', 'GET', 'data_read')).toBe('portal_documents_opened');
  expect(portalChartAction('/api/guardian-portal/clients/:clientId/intake-documents/:id/download-url', 'GET', 'download_link_issued')).toBe('portal_document_opened');
  expect(portalChartAction('/api/guardian-portal/messages/:id', 'GET', 'data_read')).toBe('portal_message_opened');
  expect(portalChartAction('/api/guardian-portal/messages', 'POST', 'data_change')).toBe('portal_message_sent');
  expect(portalChartAction('/api/auth/initial-setup/:token', 'POST', 'login')).toBe('portal_sign_in');
  expect(portalChartAction('/api/auth/session-lock-config', 'GET', 'data_read')).toBeNull();
  expect(clientIdFromEvidence({ route: '/api/agencies/:id', details: { id: 2 } })).toBeNull();
  expect(clientIdFromEvidence({ route: '/api/guardian-portal/clients/:clientId/appointments', details: { clientId: 8 } })).toBe(8);
  expect(clientIdFromEvidence({ route: '/api/clients/:id/daily-notes', details: { id: 9, transfer: { bodyPermitted: true } } })).toBe(9);
});

it('writes a chart row per linked client on sign-in and one row for a client open', async () => {
  const db = { execute: vi.fn(async sql => sql.includes('client_guardians') ? [[{ client_id: 4 }, { client_id: 5 }]] : [[]]) };
  await projectPortalChartAccess({ phase: 'completed', outcome: 'succeeded', userId: 10, role: 'client_guardian', action: 'login', method: 'POST', route: '/api/auth/login', clientIp: '192.0.2.10', userAgent: 'Browser', details: {} }, { db });
  await projectPortalChartAccess({ phase: 'completed', outcome: 'succeeded', userId: 10, role: 'provider', action: 'data_read', method: 'GET', route: '/api/clients/:id', clientIp: '192.0.2.10', details: { id: 4 } }, { db });
  await projectPortalChartAccess({ phase: 'completed', outcome: 'succeeded', userId: 10, role: 'client_guardian', action: 'data_read', method: 'GET', route: '/api/guardian-portal/clients/:clientId/intake-documents', clientIp: '192.0.2.10', details: { clientId: 4, transfer: { declaredBytes: 12 } } }, { db });
  const inserts = db.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO client_access_logs'));
  expect(inserts).toHaveLength(3);
  expect(inserts[0][1]).toEqual([4, 10, 'client_guardian', 'portal_sign_in', '/api/auth/login', 'POST', '192.0.2.10', 'Browser']);
  expect(inserts[2][1][3]).toBe('portal_documents_opened');
  expect(JSON.stringify(inserts)).not.toContain('declaredBytes');
});
