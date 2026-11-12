import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../services/ticketAssignment.service.js',()=>({listEligibleTicketAssignees:vi.fn(),recordTicketAssignment:vi.fn(),ticketAssignmentHistory:vi.fn(),setTicketAssignment:vi.fn(async()=>{throw Object.assign(Error('ownership changed'),{status:409});})}));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../services/departmentalGroupAccess.service.js', async importOriginal => ({
  ...await importOriginal(), listUserDepartmentalGroupKeys: vi.fn(async () => ['payroll'])
}));
vi.mock('../../services/supportTicketDepartmentAccess.service.js', () => ({
  ticketDepartmentKeys: vi.fn(async ticket => ticket.source_channel === 'email' ? [ticket.topic] : []),
  canWorkDepartmentTicket: vi.fn(async ({ ticket }) => ticket.source_channel === 'email' && ticket.topic === 'payroll'),
  appendDepartmentTicketVisibility: vi.fn()
}));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import Agency from '../../models/Agency.model.js';
import { claimSupportTicket } from '../supportTickets.controller.js';

let ticket;
let affectedRows;
const request = () => ({ user: { id: 5, role: 'provider' }, params: { id: '101' }, body: {} });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  ticket = { id: 101, agency_id: 2, school_organization_id: null, topic: 'payroll', source_channel: 'email', claimed_by_user_id: null };
  affectedRows = 1;
  User.getAgencies.mockResolvedValue([{ id: 2 }]);
  Agency.findById.mockResolvedValue({ id: 2, organization_type: 'agency' });
  pool.execute.mockImplementation(async sql => sql.startsWith('UPDATE support_tickets') ? [{ affectedRows }] : [[ticket]]);
});

it('does not give providers ownership even when they have a departmental grant',async()=>{
 const res=response();await claimSupportTicket(request(),res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);
 expect(pool.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE support_tickets'))).toBe(false);
});

it.each(['billing', 'general'])('does not let payroll permission claim unrelated %s tickets', async topic => {
  ticket.topic = topic;
  if (topic === 'general') ticket.source_channel = 'portal';
  const res = response();
  await claimSupportTicket(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});

it('returns a conflict when another claim wins the atomic update', async () => {
  affectedRows = 0;
  const res = response();
  const next=vi.fn();await claimSupportTicket({...request(),user:{id:5,role:'support'}}, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
});
