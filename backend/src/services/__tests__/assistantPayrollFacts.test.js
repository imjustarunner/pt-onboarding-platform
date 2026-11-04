import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
import { readAssistantPayrollSnapshot } from '../assistantPayrollFacts.service.js';
import { buildOperationalPacket, operationalSourceRevision, safePayrollClaim } from '../assistantOperationalPackets.service.js';
const row = (id = 1, more = {}) => ({ id, agency_id: 2, user_id: 90, status: 'submitted', claim_type: 'meeting_training', suggested_payroll_period_id: 100, updated_at: '2026-11-02 13:00:00', total_minutes: '30', source_name: 'meeting_compensation_auto', schedule_event: 55, ...more });
const active = new Set(['submitted', 'returned', 'needs_changes', 'deferred', 'approved', 'paid']);
function dbFor(rows) {
  return { execute: vi.fn(async (sql, values) => {
    if (sql.includes('AND c.id=?')) return [[...rows.filter(item => item.agency_id === values[0] && item.id === values[1])]];
    return [rows.filter(item => item.agency_id === values[0] && item.user_id === values[1] && item.id > values[2] && active.has(item.status)).sort((a, b) => a.id - b.id).slice(0, 200)];
  }) };
}
const read = (rows, extra = {}) => readAssistantPayrollSnapshot({ agencyId: 2, sourceId: 1, ...extra }, dbFor(rows));
const clock = (start, end) => ({ clock_start: `2026-11-02T${start}:00Z`, clock_end: `2026-11-02T${end}:00Z` });

describe('bounded payroll comparison facts', () => {
  it.each([null, '', '   ', true, false, [], {}, '0x10', 'Infinity'])('rejects malformed minute quantities without coercing them to payable time', async value => {
    const result = await read([row(1, { total_minutes: value })]);
    expect(result.target.minutes).toBeNull();
    expect(safePayrollClaim({ payload_json: { totalMinutes: value }, status: 'submitted' }).submittedMinutes).toBeNull();
  });
  it.each([0, '0', ' 0 ', 30, '30.5'])('preserves valid numeric minute quantities including zero', async value => {
    expect((await read([row(1, { total_minutes: value })])).target.minutes).toBe(Number(value));
    expect(safePayrollClaim({ payload_json: { totalMinutes: value }, status: 'submitted' }).submittedMinutes).toBe(Number(value));
  });
  it('flags identical recognized meeting source events without treating equal minutes alone as duplicates', async () => {
    const result = await read([row(), row(2), row(3, { schedule_event: null })]);
    expect(result.validation.flags).toContain('POSSIBLE_DUPLICATE_SOURCE_EVENT');
    expect(result.validation.counts.possibleDuplicateSources).toBe(1);
    const unknown = await read([row(1, { schedule_event: null }), row(2, { schedule_event: null })]);
    expect(unknown.validation.counts.possibleDuplicateSources).toBe(0);
    expect(unknown.validation.flags).toContain('OVERLAP_NOT_VERIFIABLE');
  });
  it('excludes intentional direct/remainder kiosk siblings from duplicate and overlap findings', async () => {
    const common = { claim_type: 'skill_builder_event', schedule_event: null, kiosk_punch: 123, ...clock('10:00', '11:00') };
    const result = await read([row(1, { ...common, bucket_role: 'direct', sibling_claim: 2 }), row(2, { ...common, bucket_role: 'indirect', sibling_claim: 1 })]);
    expect(result.validation).toEqual({ flags: [], counts: { possibleDuplicateSources: 0, recordedTimeOverlaps: 0, unverifiablePeerIntervals: 0 } });
    const duplicate = await read([row(1, { ...common, bucket_role: 'indirect' }), row(2, { ...common, bucket_role: 'indirect' })]);
    expect(duplicate.validation.flags).toEqual(expect.arrayContaining(['POSSIBLE_DUPLICATE_SOURCE_EVENT', 'RECORDED_TIME_OVERLAP']));
  });
  it('keeps an unknown kiosk split explicit rather than guessing that it is a duplicate', async () => {
    const common = { claim_type: 'skill_builder_event', schedule_event: null, kiosk_punch: 123 };
    const result = await read([row(1, common), row(2, common)]);
    expect(result.validation.counts.possibleDuplicateSources).toBe(0); expect(result.validation.flags).toContain('EVENT_SPLIT_REQUIRES_REVIEW');
  });
  it('identifies actual ISO interval overlap while permitting adjacent intervals', async () => {
    const result = await read([row(1, { schedule_event: null, ...clock('10:00', '11:00') }), row(2, { schedule_event: null, ...clock('10:30', '11:30') }), row(3, { schedule_event: null, ...clock('11:00', '12:00') })]);
    expect(result.validation.counts.recordedTimeOverlaps).toBe(1);
    expect(result.validation.flags).not.toContain('OVERLAP_NOT_VERIFIABLE');
  });
  it('reuses the minute-input travel/attendance boundary and still catches a substantive overlap', async () => {
    const attendance = row(2, { claim_type: 'skill_builder_event', schedule_event: null, kiosk_punch: 100, bucket_role: 'indirect', clock_start: '2026-11-02T16:00:00Z', clock_end: '2026-11-02T17:31:56Z' });
    const travel = row(1, { claim_type: 'indirect_time', schedule_event: null, travel_start: '2026-11-02T17:31:00Z', travel_end: '2026-11-02T17:45:00Z' });
    expect((await read([travel, attendance])).validation.counts.recordedTimeOverlaps).toBe(0);
    expect((await read([{ ...travel, travel_start: '2026-11-02T17:30:00Z' }, attendance])).validation.counts.recordedTimeOverlaps).toBe(1);
  });
  it.each([
    { clock_start: '10:00', clock_end: '11:00' },
    { clock_start: '2026-02-30T10:00:00Z', clock_end: '2026-02-30T11:00:00Z' },
    { clock_start: '2026-11-02T10:00:00', clock_end: '2026-11-02T11:00:00' },
    { clock_start: '2026-11-02T10:00:00Z', clock_end: null },
    { clock_start: '2026-11-02T11:00:00Z', clock_end: '2026-11-02T10:00:00Z' },
    { clock_start: '2026-11-01T10:00:00Z', clock_end: '2026-11-03T11:00:00Z' }
  ])('does not invent an interval for missing, local-clock-only, reversed or excessive duration data', async values => {
    const result = await read([row(1, { schedule_event: null, ...values })]);
    expect(result.target.interval).toBeNull(); expect(result.validation.flags).toContain('OVERLAP_NOT_VERIFIABLE');
  });
  it('does not confuse a source correction/carryover with an additional payable attendance claim', async () => {
    const result = await read([row(), row(2, { source_name: 'supervision_payroll_correction' })]);
    expect(result.validation.counts.possibleDuplicateSources).toBe(0);
  });
  it('fully paginates bounded peers and fails closed instead of hashing a truncated comparison', async () => {
    const rows = [row(), ...Array.from({ length: 200 }, (_, i) => row(i + 2, { schedule_event: null }))];
    const db = dbFor(rows); expect((await readAssistantPayrollSnapshot({ agencyId: 2, sourceId: 1 }, db)).peers).toHaveLength(200);
    expect(db.execute.mock.calls.filter(([sql]) => sql.includes('ORDER BY c.id'))).toHaveLength(2);
    await expect(read(rows, { maxPeers: 2 })).rejects.toMatchObject({ code: 'PAYROLL_PEER_LIMIT_EXCEEDED' });
  });
  it('binds peer creation, withdrawal, status changes and time edits to the same source revision used at completion', async () => {
    const target = row(1, { schedule_event: null, ...clock('10:00', '11:00') }), peer = row(2, { schedule_event: null, ...clock('10:30', '11:30') });
    const original = (await read([target, peer])).sourceRevision;
    for (const changed of [[target], [target, { ...peer, status: 'withdrawn' }], [target, { ...peer, status: 'approved' }], [target, { ...peer, clock_end: '2026-11-02T11:40:00Z' }], [target, peer, row(3)]]) expect((await read(changed)).sourceRevision).not.toBe(original);
    const db = dbFor([target, peer]);
    expect(await operationalSourceRevision({ agencyId: 2, sourceKind: 'payroll_time_claim', sourceId: 1 }, db)).toBe(original);
  });
  it('does not include another agency or staff member in the comparison/hash', async () => {
    const original = await read([row()]);
    const scoped = await read([row(), row(2, { agency_id: 6 }), row(3, { user_id: 91 })]);
    expect(scoped.sourceRevision).toBe(original.sourceRevision); expect(scoped.peers).toEqual([]);
  });
  it('releases flags/counts only while raw peer IDs and dates remain in trusted processing', async () => {
    const source = row(), db = dbFor([source, row(2)]);
    const result = await buildOperationalPacket({ agencyId: 2, subrole: 'payroll', row: { ...source, user_id: 90, sourceKind: 'payroll_time_claim', payload_json: { description: 'PRIVATE PERSON AT PRIVATE ADDRESS' } } }, db);
    expect(result.packet.items[0].validationFlags).toContain('POSSIBLE_DUPLICATE_SOURCE_EVENT');
    expect(result.packet.items[0].comparisonCounts.possibleDuplicateSources).toBe(1);
    expect(JSON.stringify(result.packet)).not.toMatch(/PRIVATE|2026-|sourceId|userId|schedule_event|kiosk_punch|payload_json/);
    expect(result.mapping.validationPeerIds).toEqual([2]);
    expect(result.packet.limitations.join(' ')).toContain('unverifiable');
    expect(result.sourceRevision).toBe((await read([source, row(2)])).sourceRevision);
    for (const [sql] of db.execute.mock.calls) { expect(sql).toMatch(/^SELECT/); expect(sql).not.toMatch(/(?:SELECT|,)\s*c\.payload_json\s*(?:,|FROM)/); }
  });
  it('blocks unreadable facts without returning provider error or raw source content', async () => {
    const db = { execute: async () => { throw new Error('PRIVATE SQL payload'); } };
    await expect(readAssistantPayrollSnapshot({ agencyId: 2, sourceId: 1 }, db)).rejects.toMatchObject({ code: 'PAYROLL_FACTS_UNAVAILABLE' });
    await expect(readAssistantPayrollSnapshot({ agencyId: 2, sourceId: 1 }, db)).rejects.not.toThrow('PRIVATE SQL payload');
  });
  it('uses a repeatable read-only transaction on pooled connections and always releases it', async () => {
    const reader = dbFor([row()]), conn = { execute: reader.execute, query: vi.fn(), rollback: vi.fn(), release: vi.fn() }, db = { getConnection: async () => conn };
    await readAssistantPayrollSnapshot({ agencyId: 2, sourceId: 1 }, db);
    expect(conn.query.mock.calls.map(call => call[0])).toEqual(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', 'START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT']);
    expect(conn.rollback).toHaveBeenCalled(); expect(conn.release).toHaveBeenCalled();
  });
  it('does not prepare a claim that became approved during inventory', async () => {
    const source = row(1, { status: 'approved' });
    expect(await buildOperationalPacket({ agencyId: 2, subrole: 'payroll', row: { ...source, sourceKind: 'payroll_time_claim' } }, dbFor([source]))).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_NO_LONGER_PENDING' });
  });
});
