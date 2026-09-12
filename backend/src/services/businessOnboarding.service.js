import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { encryptIntakePayload, decryptIntakePayload } from './intakeResponsesEncryption.service.js';

export class BusinessOnboardingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new BusinessOnboardingError(status, message); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
export const BUSINESS_PATHS = ['starting', 'operations', 'hq', 'growth'];
export const BUSINESS_TYPES = ['mental-health', 'consulting', 'coaching', 'life-coaching', 'tutoring', 'other'];
export const BUSINESS_SERVICES = ['business-setup', 'credentialing', 'payroll', 'people', 'marketing', 'website', 'operations', 'hq'];
export function validateBusinessApplication(input) {
  const s = (key, max, required = true) => {
    if (typeof input?.[key] !== 'string' || input[key].trim().length > max || (required && !input[key].trim())) fail(400, `Check ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}.`);
    return input[key].trim();
  };
  if (input?.websiteTrap) fail(400, 'Unable to submit this request.');
  const data = { businessName:s('businessName',200), firstName:s('firstName',100), lastName:s('lastName',100), email:s('email',254).toLowerCase(), phone:s('phone',40), path:s('path',30), businessType:s('businessType',30), stage:s('stage',30), goals:s('goals',1000), consent:input?.consent === true };
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email) || /[\r\n]/.test(data.email)) fail(400,'Enter a valid email address.');
  if (!BUSINESS_PATHS.includes(data.path) || !BUSINESS_TYPES.includes(data.businessType) || !['idea','launching','established','expanding'].includes(data.stage)) fail(400,'Choose your business type, stage, and starting point.');
  if (!Array.isArray(input.services) || input.services.length > BUSINESS_SERVICES.length || input.services.some(s => !BUSINESS_SERVICES.includes(s))) fail(400,'Choose valid services.');
  data.services = [...new Set(input.services)].sort();
  if (!data.consent) fail(400,'Please agree to be contacted about this request.');
  return data;
}
export function businessInvitationDeliveryStatus(result) {
  if (result?.pendingApproval || result?.queued) return 'pending_approval';
  if (result?.blocked || result?.skipped || result?.success === false) return 'not_sent';
  if (result?.redirected) return 'redirected';
  return result?.id ? 'sent' : 'failed';
}
export function validateBusinessSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,59}$/.test(slug) || ['admin','api','p','join','login','signup','ptco','tisi','plottwistco','settings','public','support','assets','auth','intake'].includes(slug)) fail(400,'Choose an available company URL using 3–60 lowercase letters, numbers, or hyphens.');
  return slug;
}
const validId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
const payload = row => {
  const envelope = decryptIntakePayload({ciphertext:row.private_payload,ivB64:row.private_iv,authTagB64:row.private_tag,keyId:row.private_key_id});
  if (envelope.context !== `business-onboarding:${row.id}`) fail(409,'Business request could not be verified.');
  return envelope.business;
};
const publicRow = row => ({id:row.id,status:row.status,createdAt:row.created_at,approvedSlug:row.approved_slug,agencyId:row.agency_id,...payload(row)});

// Dependencies are supplied by the route; tests can exercise transaction boundaries without live data.
export function createBusinessOnboardingService({pool, resolveActiveStatus}) {
  async function transaction(work) {
    const db=await pool.getConnection();
    try { await db.beginTransaction(); const result=await work(db); await db.commit(); return result; }
    catch(error) { await db.rollback(); throw error; } finally { db.release(); }
  }
  const event=(db,id,action,actor=null)=>db.execute('INSERT INTO business_onboarding_events (request_id,action,actor_user_id) VALUES (?,?,?)',[id,action,actor]);
  const findInvite=async(db,token,lock=false)=>{
    if (!/^[a-f0-9]{64}$/.test(String(token || ''))) fail(410,'This invitation is invalid or expired. Ask Plot Twist Co. for a new invitation.');
    const [[row]]=await db.execute(`SELECT * FROM business_onboarding_requests WHERE invite_hash=? AND status='approved' AND invite_expires_at>UTC_TIMESTAMP()${lock?' FOR UPDATE':''}`,[hash(token)]);
    if(!row) fail(410,'This invitation is invalid or expired. Ask Plot Twist Co. for a new invitation.');
    return row;
  };
  return {
    async submit(input,id) {
      if(!validId(id)) fail(400,'A valid submission reference is required.');
      const business=validateBusinessApplication(input), fingerprint=hash(JSON.stringify(business));
      const encrypted=encryptIntakePayload({context:`business-onboarding:${id}`,business});
      return transaction(async db=>{
        // Unique id makes retries safe; no public read endpoint exposes enquiry details.
        await db.execute('INSERT INTO business_onboarding_requests (id,submission_hash,private_payload,private_iv,private_tag,private_key_id) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[id,fingerprint,encrypted.ciphertext,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId]);
        const [[row]]=await db.execute('SELECT submission_hash FROM business_onboarding_requests WHERE id=? FOR UPDATE',[id]);
        if(row.submission_hash!==fingerprint) fail(409,'This submission reference was already used. Start a new request.');
        return {id,status:'submitted'};
      });
    },
    async list() { const [rows]=await pool.execute('SELECT * FROM business_onboarding_requests ORDER BY created_at DESC LIMIT 200'); return rows.map(publicRow); },
    async approve(id,slug,actor) {
      slug=validateBusinessSlug(slug);
      return transaction(async db=>{
        const [[row]]=await db.execute('SELECT * FROM business_onboarding_requests WHERE id=? FOR UPDATE',[id]);
        if(!row || !['submitted','approved'].includes(row.status)) fail(409,'Only submitted or approved requests can receive an invitation.');
        const business=payload(row);
        const [[existing]]=await db.execute('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=? LIMIT 1',[business.email,business.email]);
        if(existing) fail(409,'This owner already has an account. Use the existing account and tenant membership tools; no role will be changed here.');
        const [[taken]]=await db.execute('SELECT id FROM agencies WHERE slug=? OR portal_url=? LIMIT 1',[slug,slug]);
        if(taken) fail(409,'That company URL is already in use.');
        const token=crypto.randomBytes(32).toString('hex');
        await db.execute("UPDATE business_onboarding_requests SET status='approved',approved_slug=?,invite_hash=?,invite_expires_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY),reviewed_by=? WHERE id=?",[slug,hash(token),actor,id]);
        await event(db,id,'invitation_created',actor);
        return {token,businessName:business.businessName,email:business.email};
      });
    },
    async decline(id,actor) { return transaction(async db=>{
      const [r]=await db.execute("UPDATE business_onboarding_requests SET status='declined',invite_hash=NULL,invite_expires_at=NULL,reviewed_by=? WHERE id=? AND status IN ('submitted','approved')",[actor,id]);
      if(!r.affectedRows) fail(409,'This request cannot be declined.');
      await event(db,id,'declined',actor); return {ok:true};
    }); },
    async inspect(token) { const row=await findInvite(pool,token);const b=payload(row);return {businessName:b.businessName,email:b.email,slug:row.approved_slug}; },
    async activate(token,password,accepted) {
      if(typeof password!=='string' || password.trim().length<12 || Buffer.byteLength(password,'utf8')>72) fail(400,'Use a password of at least 12 characters and no more than 72 bytes.');
      if(accepted!==true) fail(400,'Confirm that you are authorized to administer this company workspace.');
      await findInvite(pool,token); // Reject expired tokens before expensive password hashing.
      const passwordHash=await bcrypt.hash(password,12),status=await resolveActiveStatus();
      return transaction(async db=>{
        const row=await findInvite(db,token,true),b=payload(row);
        const [[existing]]=await db.execute('SELECT id FROM users WHERE LOWER(email)=? OR LOWER(username)=? LIMIT 1',[b.email,b.email]);
        if(existing) fail(409,'An account already exists for this email. Contact Plot Twist Co. to connect your existing account.');
        const slug=validateBusinessSlug(row.approved_slug);
        const [[taken]]=await db.execute('SELECT id FROM agencies WHERE slug=? OR portal_url=? LIMIT 1',[slug,slug]);
        if(taken) fail(409,'This company URL is no longer available. Ask Plot Twist Co. to update the invitation.');
        // A business request always creates a root tenant. No client-supplied role,
        // organization type, tenant id, or school affiliation is accepted.
        const [agency]=await db.execute("INSERT INTO agencies (name,slug,portal_url,organization_type,is_active,color_palette) VALUES (?,?,?,'agency',TRUE,?)",[b.businessName,slug,slug,JSON.stringify({primary:'#8c1020',secondary:'#171b2b',accent:'#bd2639'})]);
        const [owner]=await db.execute("INSERT INTO users (email,username,password_hash,role,status,first_name,last_name,is_active) VALUES (?,?,?,'admin',?,?,?,TRUE)",[b.email,b.email,passwordHash,status,b.firstName,b.lastName]);
        await db.execute('INSERT INTO user_agencies (user_id,agency_id,is_active) VALUES (?,?,TRUE)',[owner.insertId,agency.insertId]);
        await db.execute('UPDATE agencies SET account_owner_user_id=? WHERE id=?',[owner.insertId,agency.insertId]);
        await db.execute("UPDATE business_onboarding_requests SET status='activated',agency_id=?,owner_user_id=?,invite_hash=NULL,invite_expires_at=NULL WHERE id=?",[agency.insertId,owner.insertId,row.id]);
        await event(db,row.id,'workspace_activated',owner.insertId);
        return {slug,agencyId:agency.insertId,loginPath:`/${slug}/login`,setupPath:`/${slug}/admin/settings?category=general&item=company-profile&agencyId=${agency.insertId}`};
      });
    }
  };
}
