import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enterPublicAuthForm, isPublicAuthFormActive } from '../../utils/publicAuthForm';

const m = vi.hoisted(() => ({ error: null, redirect: vi.fn(() => '/schoolcarebridge/app/demo-school') }));
vi.mock('axios', () => ({ default: { create: () => ({ interceptors: {
  request: { use: vi.fn() },
  response: { use: (_ok, handler) => { m.error = handler; } }
} }) } }));
vi.mock('../../utils/loginRedirect', () => ({ getLoginUrlForRedirect: m.redirect }));
import '../api';

let leave;
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); m.redirect.mockClear();
  window.history.replaceState(null, '', '/schoolcarebridge/app/demo-school');
});
afterEach(() => { leave?.(); leave = null; });
const unauthorized = () => ({ config: { url: '/notifications/counts' }, response: { status: 401, data: {} } });

it('rejects a late unauthorized response without navigating away from an open sign-in/recovery form', async () => {
  leave = enterPublicAuthForm();
  const error = unauthorized();
  await expect(m.error(error)).rejects.toBe(error);
  expect(m.redirect).not.toHaveBeenCalled();
});

it('continues to redirect an expired authenticated school workspace at the same URL', async () => {
  const release = enterPublicAuthForm(); release();
  localStorage.setItem('user', JSON.stringify({ id: 1465, role: 'school_staff' }));
  const error = unauthorized();
  await expect(m.error(error)).rejects.toBe(error);
  expect(m.redirect).toHaveBeenCalledWith({ id: 1465, role: 'school_staff' });
  expect(localStorage.getItem('user')).toBeNull();
});

it('keeps overlapping forms protected until each unmounts, with idempotent cleanup', () => {
  leave = enterPublicAuthForm();
  const other = enterPublicAuthForm();
  other(); other();
  expect(isPublicAuthFormActive()).toBe(true);
  leave();
  expect(isPublicAuthFormActive()).toBe(false);
});
