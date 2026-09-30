import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { parseUtcDate } from '../../utils/officeEventDateTime.util.js';

export const mailboxKey = mailbox => crypto.createHash('sha256').update(String(mailbox).trim().toLowerCase()).digest('hex');
const timestamp = value => value ? parseUtcDate(value).getTime() : 0;
const sqlDate = value => new Date(value).toISOString().replace('T',' ').replace('Z','');
export function gmailRetryDeadline(error, now = Date.now()) {
  const status = Number(error.response?.status || error.code);
  const reason = error.response?.data?.error;
  const text = String(reason?.message || error.message || '');
  const isRateLimit = status === 429 || (status === 403 && /rate.?limit|quota.?exceeded/i.test(text + JSON.stringify(reason?.errors || [])));
  if (!isRateLimit) return null;
  const headers=error.response?.headers;
  const header=headers?.get?.('retry-after') || headers?.['retry-after'];
  const headerTime=header ? (/^\d+$/.test(String(header)) ? now+Number(header)*1000 : Date.parse(header)) : 0;
  const messageTime=Date.parse(text.match(/Retry after ([0-9T:.Z+-]+)/i)?.[1] || '');
  return Math.max(now+60000,Number.isFinite(headerTime)?headerTime:0,Number.isFinite(messageTime)?messageTime:0)+5000;
}
export const gmailDeferred = (retryAt, code='GMAIL_MAILBOX_THROTTLED') => Object.assign(new Error('Gmail delivery is deferred until the shared mailbox is available.'),{code,retryAt});

export function createGmailTrafficGuard({database=pool,now=Date.now,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
  async function ensure(db,key) { await db.execute('INSERT IGNORE INTO gmail_mailbox_traffic_state (mailbox_key) VALUES (?)',[key]); }
  async function request(mailbox,method,send) {
    const key=mailboxKey(mailbox),db=await database.getConnection();let locked=false;
    try {
      // One in-flight request per transport mailbox across every server replica.
      const [[lock]]=await db.execute('SELECT GET_LOCK(?, 30) acquired',[`gmail:${key.slice(0,48)}`]);
      if(Number(lock.acquired)!==1)throw gmailDeferred(now()+30000,'GMAIL_MAILBOX_BUSY');
      locked=true;await ensure(db,key);
      const [[state]]=await db.execute('SELECT blocked_until,next_request_at FROM gmail_mailbox_traffic_state WHERE mailbox_key=?',[key]);
      if(timestamp(state.blocked_until)>now())throw gmailDeferred(timestamp(state.blocked_until));
      const delay=Math.min(1000,Math.max(0,timestamp(state.next_request_at)-now()));if(delay)await sleep(delay);
      await db.execute('UPDATE gmail_mailbox_traffic_state SET request_count=request_count+1,last_method=?,next_request_at=? WHERE mailbox_key=?',[method,sqlDate(now()+500),key]);
      try { return await send(); }
      catch(error) {
        const retryAt=gmailRetryDeadline(error,now());
        if(retryAt){
          await db.execute('UPDATE gmail_mailbox_traffic_state SET blocked_until=GREATEST(COALESCE(blocked_until,?),?),last_rate_limit_at=?,rate_limit_count=rate_limit_count+1 WHERE mailbox_key=?',[sqlDate(retryAt),sqlDate(retryAt),sqlDate(now()),key]);
          console.warn('[gmail-traffic] cooldown',{method,retryAt:new Date(retryAt).toISOString()});
          throw Object.assign(gmailDeferred(retryAt),{cause:error});
        }
        throw error;
      }
    } finally { if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`gmail:${key.slice(0,48)}`]).catch(()=>{});db.release(); }
  }
  async function claimInboundPoll(mailbox) {
    const key=mailboxKey(mailbox);await ensure(database,key);
    const [result]=await database.execute(`UPDATE gmail_mailbox_traffic_state SET next_inbound_poll_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 60 SECOND)
      WHERE mailbox_key=? AND (blocked_until IS NULL OR blocked_until<=UTC_TIMESTAMP(3))
      AND (next_inbound_poll_at IS NULL OR next_inbound_poll_at<=UTC_TIMESTAMP(3))
      AND NOT EXISTS(SELECT 1 FROM office_arrival_deliveries WHERE email_status='pending' AND acknowledged_at IS NULL AND due_at<=UTC_TIMESTAMP() AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 4 HOUR))`,[key]);
    return result.affectedRows===1;
  }
  return {request,claimInboundPoll};
}
const guard=createGmailTrafficGuard();
export const claimGmailInboundPoll=guard.claimInboundPoll;
export function guardGmailClient(gmail,mailbox,traffic=guard) {
  // Google resource methods keep their receiver; context is deliberately excluded.
  const seen=new WeakSet();
  function wrap(resource,path) {
    if(seen.has(resource))return;seen.add(resource);
    const prototype=Object.getPrototypeOf(resource);
    const names=new Set([...Object.keys(resource),...(prototype&&prototype!==Object.prototype?Object.getOwnPropertyNames(prototype):[])]);
    for(const name of names) {
      if(name==='context'||name==='constructor')continue;
      const value=resource[name],method=`${path}.${name}`;
      if(typeof value==='function')resource[name]=function(params,options={}) {
        return traffic.request(mailbox,method,()=>value.call(resource,params,{...options,retry:false,timeout:30000}));
      };
      else if(value&&typeof value==='object')wrap(value,method);
    }
  }
  wrap(gmail.users,'users');return gmail;
}
