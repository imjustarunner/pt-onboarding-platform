import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: m.get } }));
import Details from '../CanceledSessionDetails.vue';
import { reportViewerDateTime } from '../../../utils/reportDateTime.js';

describe('canceled session audit timestamp', () => {
  it('keeps actor and reason with a readable, zone-labeled timestamp', async () => {
    m.get.mockResolvedValue({ data: { cancellation: { actorName: 'Support QA', providerName: 'Provider QA',
      canceledAt: '2026-11-03T03:05:18.000Z', reason: 'Weather', source: 'cancel_day', feeCents: 0 } } });
    const w = mount(Details, { props: { appointmentId: 174 }, global: { stubs: { AppointmentCommunicationsPanel: true } } });
    await flushPromises();
    expect(w.text()).toContain('Canceled by Support QA for Provider QA');
    expect(w.text()).toContain(reportViewerDateTime('2026-11-03T03:05:18.000Z'));
    expect(w.text()).not.toContain('T03:05:18');
    expect(w.text()).toContain('Weather');
    expect(w.text()).toContain('No cancellation fee');
    expect(m.get).toHaveBeenCalledTimes(1);
    w.unmount();
  });
});
