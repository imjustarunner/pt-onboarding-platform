import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertReviewAccess, buildReviewNotice, deliveryState, latestDueReviewDate, localDateTimeToUtc,
  normalizePilotConfig, reviewWindow, validDate
} from '../supportReplyReview.shared.js';

describe('support review calendar and policy', () => {
  it('uses a weekday 6 PM Mountain cutoff, including weekend activity on Monday', () => {
    const result = reviewWindow('2026-10-26');
    assert.equal(result.start, '2026-10-24T00:00:00.000Z');
    assert.equal(result.end, '2026-10-27T00:00:00.000Z');
    assert.equal(latestDueReviewDate('2026-10-26T23:59:00Z'), '2026-10-23');
    assert.equal(latestDueReviewDate('2026-10-27T00:00:00Z'), '2026-10-26');
    assert.equal(latestDueReviewDate('2026-10-25T22:00:00Z'), '2026-10-23');
  });

  it('has correct spring and fall DST boundaries instead of subtracting 24 hours', () => {
    const spring = reviewWindow('2026-03-09');
    assert.equal(spring.start, '2026-03-07T01:00:00.000Z');
    assert.equal(spring.end, '2026-03-10T00:00:00.000Z');
    assert.equal((new Date(spring.end) - new Date(spring.start)) / 3600000, 71);
    const fall = reviewWindow('2026-11-02');
    assert.equal(fall.start, '2026-10-31T00:00:00.000Z');
    assert.equal(fall.end, '2026-11-03T01:00:00.000Z');
    assert.equal((new Date(fall.end) - new Date(fall.start)) / 3600000, 73);
  });

  it('handles configurable cutoff inside the DST gap or overlap deterministically', () => {
    assert.equal(localDateTimeToUtc('2026-03-08', '02:30', 'America/Denver').toISOString(), '2026-03-08T09:00:00.000Z');
    assert.equal(localDateTimeToUtc('2026-11-01', '01:30', 'America/Denver').toISOString(), '2026-11-01T07:30:00.000Z');
  });

  it('rejects malformed dates, times, timezones and incomplete pilot settings', () => {
    for (const date of ['2026-02-30', '2026-13-01', 'today', '']) assert.throws(() => validDate(date), { status: 400 });
    const valid = { agencyId: 2, reviewerUserId: 507, pilotUserIds: [559, 555] };
    assert.equal(normalizePilotConfig(valid).sendTime, '18:00');
    for (const change of [{ timeZone: 'Mars/Olympus' }, { sendTime: '25:00' }, { pilotUserIds: [] }]) assert.throws(() => normalizePilotConfig({ ...valid, ...change }), { status: 400 });
  });

  it('requires actual agency membership and designated reviewer/admin; pilot staff do not gain peer access', () => {
    const base = { agencyId: 2, memberAgencyIds: [2], config: { reviewerUserId: 507 } };
    assert.doesNotThrow(() => assertReviewAccess({ ...base, user: { id: 507, role: 'staff' } }));
    assert.doesNotThrow(() => assertReviewAccess({ ...base, user: { id: 1, role: 'admin' } }));
    assert.throws(() => assertReviewAccess({ ...base, user: { id: 559, role: 'support' } }), { status: 403 });
    assert.throws(() => assertReviewAccess({ ...base, memberAgencyIds: [], user: { id: 507, role: 'admin' } }), { status: 403 });
    assert.throws(() => assertReviewAccess({ ...base, user: { id: 507, role: 'staff' }, write: true }), { status: 403 });
    assert.throws(() => assertReviewAccess({ ...base, user: null }), { status: 401 });
  });

  it('never treats queued, failed, an RFC header, or closure as actual sending', () => {
    assert.equal(deliveryState({ deliveryStatus: 'queued' }), 'queued');
    assert.equal(deliveryState({ deliveryStatus: 'failed' }), 'failed');
    assert.throws(() => deliveryState({ deliveryStatus: 'sent', internetMessageId: '<allocated@local>', closed: true }), { status: 409 });
    assert.equal(deliveryState({ deliveryStatus: 'sent', transportMessageId: 'gmail-proof' }), 'sent');
    assert.equal(deliveryState({ deliveryStatus: 'sent', verifiedCommunicationSent: true }), 'sent');
  });

  it('summarizes counts in the sign-in notice without conversation or staff content', () => {
    const notice = buildReviewNotice({ date: '2026-10-26', url: 'https://app.itsco.health/itsco/admin/support-review?date=2026-10-26&agencyId=2',
      totals: { tickets: 8, drafts: 6, sent: 5, missingDraft: 2, body: 'private student detail' }, body: 'private student detail', claimantName: 'Hannah' });
    assert.match(notice.text, /Sign in/);
    assert.match(notice.text, /support-review\?date=/);
    assert.match(notice.text, /agencyId=2/);
    assert.match(notice.text, /Conversations reviewed: 8\nDrafts captured: 6\nConfirmed sent replies: 5\nReplies without a captured draft: 2/);
    assert.doesNotMatch(JSON.stringify(notice), /private student detail|Hannah/);
  });

  it('does not expose arbitrary values or present limited counts as a complete summary', () => {
    const notice = buildReviewNotice({ date: '2026-10-26', url: '/review', incomplete: true,
      totals: { tickets: 'private school detail', drafts: -1, sent: 0, missingDraft: NaN } });
    assert.doesNotMatch(notice.text, /private school detail/);
    assert.match(notice.text, /Conversations reviewed: Unavailable/);
    assert.match(notice.text, /Confirmed sent replies: 0/);
    assert.match(notice.text, /counts are incomplete/);
  });
});
