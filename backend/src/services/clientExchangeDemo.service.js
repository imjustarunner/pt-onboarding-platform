import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { hasClientDemoIdentity, canViewDemoExchange } from '../utils/clientExchangeDemo.js';
import { allowQaExchangeRecipient, isAuricwellQaAgency } from '../utils/auricwellQaPolicy.js';

const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
let noticeCursor=0;
export async function isDemoExchangeClient({ clientId, agencyId, client, database = pool }) {
  if (hasClientDemoIdentity(client) || hasClientDemoIdentity(parse(client?.intake_preferences_json))) return true;
  const id = Number(clientId || client?.id), agency = Number(agencyId || client?.agency_id);
  if (!id || !agency) return false;
  const [[row]] = await database.execute(`SELECT c.id,c.email,c.intake_preferences_json,
    EXISTS (SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
      WHERE cg.client_id=c.id AND (LOWER(TRIM(COALESCE(u.email,''))) REGEXP '@(.*[.])?example([.]com)?$'
        OR LOWER(TRIM(COALESCE(u.personal_email,''))) REGEXP '@(.*[.])?example([.]com)?$'
        OR LOWER(TRIM(COALESCE(u.work_email,''))) REGEXP '@(.*[.])?example([.]com)?$')) AS demo_guardian_email
    FROM clients c WHERE c.id=? AND c.agency_id=? LIMIT 1`, [id,agency]);
  return Number(row?.id) === id && (Number(row.demo_guardian_email) === 1
    || hasClientDemoIdentity(row) || hasClientDemoIdentity(parse(row.intake_preferences_json)));
}

// Real providers never see example.com referrals. The AuricWell QA roster does,
// so the synthetic exchange can be requested without opening it to other agencies.
export async function viewerMayOpenDemoExchange({ userId, role, agencyId, database = pool } = {}) {
  if (canViewDemoExchange(role)) return true;
  if (Number(agencyId) !== 450 || !Number(userId)) return false;
  const agency = await Agency.findById(agencyId);
  if (!isAuricwellQaAgency(agency)) return false;
  const [[user]] = await database.execute('SELECT id,email,role,is_demo FROM users WHERE id=? LIMIT 1', [userId]);
  return allowQaExchangeRecipient(agency, user);
}

export async function isDemoExchangeListing({ listingId, agencyId, database = pool }) {
  const [[listing]] = await database.execute('SELECT client_id,agency_id FROM client_exchange_listings WHERE id=?', [listingId]);
  if (!listing || (agencyId && Number(listing.agency_id) !== Number(agencyId))) return false;
  return isDemoExchangeClient({clientId:listing.client_id,agencyId:listing.agency_id,database});
}

export async function blockDemoExchangeEmail({templateType,linkUrl,clientId,agencyId}) {
  if (!['client_exchange_match','client_exchange_shared','client_exchange_claim','client_exchange_assigned'].includes(templateType)) return false;
  if (clientId) return isDemoExchangeClient({clientId,agencyId});
  let listingId;
  try { listingId = Number(new URL(linkUrl).searchParams.get('listingId')); } catch { /* no trusted listing */ }
  if (!Number.isSafeInteger(listingId) || listingId < 1) return true;
  return isDemoExchangeListing({listingId,agencyId});
}

export async function suppressDemoExchangeNotifications(listing) {
  // Preserve historical records while removing old demo match notices from inboxes.
  await pool.execute(`UPDATE notifications SET is_resolved=TRUE,is_read=TRUE,resolved_at=COALESCE(resolved_at,NOW()),
    audience_json=JSON_MERGE_PATCH(COALESCE(audience_json,JSON_OBJECT()),
      CAST('{"provider":false,"clinicalPracticeAssistant":false,"supervisor":false,"guardian":false,"schoolStaff":false,"admin":false}' AS JSON))
    WHERE agency_id=? AND related_entity_type='client_exchange_listing' AND related_entity_id=?
      AND type IN ('client_exchange_match','client_exchange_shared','client_exchange_claim','client_exchange_assigned')`,
    [listing.agencyId,listing.id]);
}

export async function retireDemoExchangeNotifications({limit=50}={}) {
  // Include closed listings: their old in-app notices must not remain visible
  // merely because the matching monitor only evaluates open referrals.
  const batch=Math.max(1,Math.min(100,Math.trunc(Number(limit)) || 50));
  const [rows]=await pool.execute(`SELECT DISTINCT l.id,l.agency_id,l.client_id FROM notifications n
    JOIN client_exchange_listings l ON l.id=n.related_entity_id AND l.agency_id=n.agency_id
    WHERE n.related_entity_type='client_exchange_listing' AND n.is_resolved=FALSE AND l.id>?
      AND n.type IN ('client_exchange_match','client_exchange_shared','client_exchange_claim','client_exchange_assigned')
    ORDER BY l.id LIMIT ${batch}`,[noticeCursor]);
  for(const row of rows){
    if(await isDemoExchangeClient({clientId:row.client_id,agencyId:row.agency_id}))
      await suppressDemoExchangeNotifications({id:row.id,agencyId:row.agency_id});
  }
  noticeCursor=rows.length===batch?Number(rows.at(-1).id):0;
}
