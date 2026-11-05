import { expect, it } from 'vitest';
import { canAccessTicketDesk } from '../ticketAccess.js';

it('admits permission-bearing providers only in their permitted agencies', () => {
  const user = { role: 'provider', billingAgencyIds: [2], payrollAgencyIds: ['3'] };
  expect(canAccessTicketDesk(user, 2)).toBe(true);
  expect(canAccessTicketDesk(user, 3)).toBe(true);
  expect(canAccessTicketDesk(user, 4)).toBe(false);
  expect(canAccessTicketDesk({ role: 'provider', hasBillingAccess: true }, 4)).toBe(false);
});

it('preserves provider plus and role access and does not depend on Google SSO', () => {
  expect(canAccessTicketDesk({ role: 'provider_plus' }, 2)).toBe(true);
  expect(canAccessTicketDesk({ role: 'provider', loginIsGroupEmail: true, credentialingAgencyIds: [2] }, 2)).toBe(true);
  expect(canAccessTicketDesk({ role: 'provider', loginIsGroupEmail: true }, 2)).toBe(false);
  expect(canAccessTicketDesk({ role: 'assistant', billingAgencyIds: [2] }, 2)).toBe(false);
});

it('uses active scoped grants, rejecting inactive memberships and false string flags', () => {
  expect(canAccessTicketDesk({ role: 'provider', agencies: [{ id: 2, has_payroll_access: '1' }] }, 2)).toBe(true);
  expect(canAccessTicketDesk({ role: 'provider', agencies: [{ id: 2, has_payroll_access: '0' }] }, 2)).toBe(false);
  expect(canAccessTicketDesk({ role: 'provider', agencies: [{ id: 2, has_billing_access: 1, is_active: 0 }] }, 2)).toBe(false);
});

it('does not introduce ticket desk access from People Operations hiring permission', () => {
  expect(canAccessTicketDesk({ role: 'provider', hasHiringAccess: true, agencies: [{ id: 2, is_active: 1 }] }, 2)).toBe(false);
});
