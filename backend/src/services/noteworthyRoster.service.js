import crypto from 'node:crypto';
import pool from '../config/database.js';

export const noteworthyNameKey = name => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const practiceCache=new Map();

export async function isNoteworthyPractice(agencyId, db = pool) {
  const key=Number(agencyId),cached=db===pool?practiceCache.get(key):null;
  if(cached && cached.expires>Date.now())return cached.value;
  try {
    const [[row]] = await db.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=?', [agencyId]);
    if(db===pool){if(practiceCache.size>1000)practiceCache.clear();practiceCache.set(key,{value:!!row,expires:Date.now()+60000});}
    return !!row;
  } catch (e) { if (e.code === 'ER_NO_SUCH_TABLE') return false; throw e; }
}

export async function noteworthyMatchingUsers(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT u.id,u.first_name,u.last_name FROM noteworthy_roster r
    JOIN users u ON u.id=r.payroll_user_id
    WHERE r.agency_id=? AND COALESCE(u.is_archived,0)=0`, [agencyId]);
  return rows;
}

// The payroll identity stays stable when an employee later claims their portal.
// No lookup by a name or address in another practice is permitted here.
export async function ensureNoteworthyProvider({ agencyId, providerName, firstName, lastName }, db = pool) {
  const key = noteworthyNameKey(providerName);
  if (!key || key.length > 255 || !firstName || !lastName) return null;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE', [agencyId]);
    const [[existing]] = await conn.execute(`SELECT r.payroll_user_id,u.first_name,u.last_name FROM noteworthy_roster r
      JOIN users u ON u.id=r.payroll_user_id WHERE r.agency_id=? AND r.source_name_key=?`, [agencyId,key]);
    if (existing) {
      await conn.commit();
      return { userId: existing.payroll_user_id, firstName: existing.first_name, lastName: existing.last_name };
    }
    // No email/password and no provider privileges are inferred from a report.
    // An ordinary provider role is needed by the existing payroll roster model.
    const [created] = await conn.execute(`INSERT INTO users
      (email,password_hash,first_name,last_name,role,status,is_active,is_roster_placeholder,has_provider_access)
      VALUES (NULL,NULL,?,?,'provider','ACTIVE_EMPLOYEE',1,1,0)`, [firstName,lastName]);
    const userId = created.insertId;
    await conn.execute('INSERT INTO user_agencies(user_id,agency_id,is_active,has_payroll_access) VALUES(?,?,1,0)', [userId,agencyId]);
    await conn.execute('INSERT INTO noteworthy_roster(agency_id,payroll_user_id,source_name_key) VALUES(?,?,?)', [agencyId,userId,key]);
    await conn.commit();
    return { userId, firstName, lastName };
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}

export const newNoteworthyToken = () => crypto.randomBytes(32).toString('hex');
export const noteworthyTokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
