import { afterEach, describe, expect, it, vi } from 'vitest';
import api from '../../services/api';
import { openEnrollmentReceipt, resolveEnrollmentReceiptUrl } from '../openEnrollmentReceipt.js';

vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }));

function fakePopup() {
  return { closed: false, opener: {}, location: { href: '' }, document: { open() {}, write() {}, close() {} }, close: vi.fn() };
}

afterEach(() => vi.restoreAllMocks());

describe('openEnrollmentReceipt', () => {
  it('follows a JSON signed-URL payload to the stored PDF instead of showing the JSON', async () => {
    const popup = fakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const json = new Blob([JSON.stringify({ url: 'https://storage.example/intake_signed/a.pdf?sig=1' })], { type: 'application/json' });
    api.get.mockResolvedValue({ data: json, headers: { 'content-type': 'application/json; charset=utf-8' } });
    const result = await openEnrollmentReceipt(77);
    expect(result.ok).toBe(true);
    expect(popup.location.href).toBe('https://storage.example/intake_signed/a.pdf?sig=1');
  });

  it('shows streamed PDFs through a blob URL', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:pdf');
    const url = await resolveEnrollmentReceiptUrl(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'application/pdf');
    expect(url).toBe('blob:pdf');
  });

  it('returns a visible error and a fallback link when the tab is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    api.get.mockResolvedValue({ data: new Blob([JSON.stringify({ url: 'https://storage.example/b.pdf' })], { type: 'application/json' }), headers: { 'content-type': 'application/json' } });
    const result = await openEnrollmentReceipt(78);
    expect(result.ok).toBe(false);
    expect(result.fallbackUrl).toBe('https://storage.example/b.pdf');
    expect(result.error).toMatch(/blocked/);
  });

  it('surfaces the API error message', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakePopup());
    api.get.mockRejectedValue({ response: { data: new Blob([JSON.stringify({ error: { message: 'Enrollment receipt not found' } })], { type: 'application/json' }) } });
    const result = await openEnrollmentReceipt(79);
    expect(result).toMatchObject({ ok: false, error: 'Enrollment receipt not found' });
  });
});
