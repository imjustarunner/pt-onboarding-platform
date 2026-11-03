import { afterAll, beforeAll, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { STALE_TEXT_QUERY } from '../../utils/staleTextPolicy.js';

// Explicitly enabled read-only integration check. CTEs shadow every real table;
// fixtures never create records or send messages, including in a shared database.
const enabled = process.env.STALE_TEXT_MYSQL_READONLY_TEST === '1';
let db;
beforeAll(async () => {
  if (!enabled) return;
  db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  await db.query('START TRANSACTION READ ONLY');
});
afterAll(async () => { if (db) { await db.rollback(); await db.end(); } });

async function selected(messages, reviews = [], hours = null) {
  const args = [];
  const messageSql = messages.map(m => {
    args.push(m.id, m.agency ?? 2, m.number ?? 6, m.client ?? 88, 'Synthetic fixture',
      '+12025550101', '+12025550102', m.read ?? 0, m.age ?? 90000,
      m.thread === undefined ? 'family-a' : m.thread, m.direction || 'INBOUND',
      m.delivery || 'received', JSON.stringify(m.metadata || {}));
    return `SELECT ? AS id,? AS agency_id,? AS number_id,? AS client_id,? AS body,
      ? AS from_number,? AS to_number,? AS is_read,
      DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? SECOND) AS created_at,? AS sms_thread_key,
      ? AS direction,? AS delivery_status,CAST(? AS JSON) AS metadata`;
  }).join(' UNION ALL ');
  args.push(JSON.stringify(hours === null ? {} : { smsSupportEscalationHours: hours }));
  const reviewSql = reviews.length ? reviews.map(q => {
    args.push(q.agency ?? 2,q.source,q.status || 'review',q.age ?? 0);
    return `SELECT ? AS agency_id,? AS message_log_id,'sms_followup' AS channel,? AS status,
      DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? SECOND) AS reviewed_at`;
  }).join(' UNION ALL ') : `SELECT 2 AS agency_id,0 AS message_log_id,'sms_followup' AS channel,
    'review' AS status,UTC_TIMESTAMP() AS reviewed_at WHERE FALSE`;
  const query = `WITH message_logs AS (${messageSql}),
    agencies AS (SELECT 2 AS id,CAST(? AS JSON) AS feature_flags UNION ALL SELECT 3,JSON_OBJECT()),
    communication_review_queue AS (${reviewSql}), ${STALE_TEXT_QUERY.replace(/^WITH /, '')}`;
  const [rows] = await db.query(query, args);
  return rows.map(row => Number(row.id));
}

it.runIf(enabled)('24 elapsed hours is inclusive; reading and recent follow-ups do not reset the first unanswered text', async () => {
  expect(await selected([{id:1,age:86400,read:1},{id:2,age:60}])).toEqual([1]);
  expect(await selected([{id:1,age:86399}])).toEqual([]);
});
it.runIf(enabled)('an actual sent or delivered answer closes the earlier wait; a new inbound starts a new clock', async () => {
  for (const delivery of ['sent','delivered']) {
    expect(await selected([{id:1},{id:2,age:88000,direction:'OUTBOUND',delivery},{id:3,age:60}])).toEqual([]);
    expect(await selected([{id:1,age:100000},{id:2,age:95000,direction:'OUTBOUND',delivery},{id:3,age:90000}])).toEqual([3]);
  }
});
it.runIf(enabled)('failed, queued and automated messages are not answers, including an away notice', async () => {
  for (const delivery of ['failed','queued']) {
    expect(await selected([{id:1},{id:2,age:60,direction:'OUTBOUND',delivery}])).toEqual([1]);
  }
  for (const flag of ['autoReply','vacationReply','forwardOffer','communicationNotice','outOfOfficeNotice','supportChoiceOffer','supportChoiceConfirmation']) {
    expect(await selected([{id:1},{id:2,age:60,direction:'OUTBOUND',delivery:'delivered',metadata:{[flag]:true}}])).toEqual([1]);
  }
});
it.runIf(enabled)('an absent provider does not prevent review, while support/control commands do not start the clock', async () => {
  expect(await selected([{id:1,metadata:{awaitingProviderReturn:true}}])).toEqual([1]);
  expect(await selected([{id:1,metadata:{supportChoiceAccepted:true}}])).toEqual([]);
  expect(await selected([{id:1,metadata:{outOfOfficeNoticesDisabled:true}}])).toEqual([]);
});
it.runIf(enabled)('a reply for another family, sender number, client or agency does not close the wait', async () => {
  for (const scope of [{thread:'family-b'},{number:7},{client:89},{agency:3}]) {
    expect(await selected([{id:1},{id:2,age:60,direction:'OUTBOUND',delivery:'sent',...scope}])).toEqual([1]);
  }
});
it.runIf(enabled)('an existing review for any message in the conversation prevents duplicate items', async () => {
  expect(await selected([{id:1},{id:2,age:60}],[{source:2}])).toEqual([]);
  expect(await selected([{id:1},{id:2,thread:'family-b',age:60}],[{source:2}])).toEqual([1]);
});
it.runIf(enabled)('marking a prior item handled allows later unanswered messages to start a new wait', async () => {
  expect(await selected([{id:1,age:200000},{id:2,age:90000}],[{source:1,status:'resolved',age:100000}])).toEqual([2]);
});
it.runIf(enabled)('a same-second answer uses message order and an explicit agency timeout remains effective', async () => {
  expect(await selected([{id:1},{id:2,direction:'OUTBOUND',delivery:'delivered'}])).toEqual([]);
  expect(await selected([{id:2},{id:1,direction:'OUTBOUND',delivery:'sent'}])).toEqual([2]);
  expect(await selected([{id:1,age:43200}],[],12)).toEqual([1]);
  expect(await selected([{id:1,thread:null}])).toEqual([]);
});
