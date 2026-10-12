import { it, expect } from 'vitest';
import { toBusyOnlyScheduleSummary, toTypedPeerScheduleSummary } from '../scheduleSummaryPrivacy.service.js';

it.each([toBusyOnlyScheduleSummary, toTypedPeerScheduleSummary])('keeps Google overlays advisory without weakening app calendar conflicts', convert => {
 const interval={startAt:'2026-10-13T19:00:00Z',endAt:'2026-10-13T20:00:00Z'};
 const payload={
  googleBusy:[interval], googleEvents:[{...interval,title:'Private Google title'}],
  scheduleEvents:[{...interval,id:1,kind:'TEAM_MEETING',googleEventId:'synced-copy',title:'Private app title'}],
  supervisionSessions:[interval],externalBusy:[interval]
 };
 const result=convert(payload);
 expect(result.busyBlocks).toHaveLength(5);
 const advisory=result.busyBlocks.filter(b=>b.blocksScheduling===false);
 expect(advisory).toHaveLength(2);
 expect(advisory.every(b=>b.source==='external')).toBe(true);
 expect(result.busyBlocks.filter(b=>b.blocksScheduling!==false)).toHaveLength(3);
 expect(result.googleBusy).toHaveLength(3); // overlays remain visible
 expect(JSON.stringify(result)).not.toMatch(/Private Google title|Private app title/);
});
