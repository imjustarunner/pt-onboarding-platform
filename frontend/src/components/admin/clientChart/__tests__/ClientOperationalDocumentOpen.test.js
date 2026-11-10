import source from '../../ClientDetailPanel.vue?raw';
import { expect, it, vi } from 'vitest';

// Exercise the chart click handler with support's clinical Documents tab absent.
const start = source.indexOf('async function openChartDocument(');
const code = source.slice(start, source.indexOf('const medicalRecordEncounterId', start));
it.each(['signed-roi-1646', 'paper-4052'])('opens %s directly without a hidden Documents tab', async key => {
  const open = vi.fn().mockResolvedValue({ ok: true });
  const nav = vi.fn();
  const deps = { props: { client: { id: 2424 } }, chartReceiptError: { value: '' }, chartReceiptFallbackUrl: { value: '' },
    openEnrollmentReceipt: vi.fn(), openOperationalDocument: open, pendingChartViewKey: { value: '' }, setChartNav: nav, documentsTabRef: { value: null } };
  const handler = new Function(...Object.keys(deps), `${code}; return openChartDocument`)(...Object.values(deps));
  await handler(key);
  expect(open).toHaveBeenCalledWith(key.startsWith('signed') ? '/clients/2424/school-roi-documents/1646/view' : '/clients/2424/paper-packet-processing/documents/4052/view');
  expect(nav).not.toHaveBeenCalled();
  open.mockResolvedValue({ ok: false, error: 'Access denied' });
  await handler(key);
  expect(deps.chartReceiptError.value).toBe('Access denied');
});
