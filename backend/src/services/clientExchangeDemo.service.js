import pool from '../config/database.js';
import { hasDemoExchangeEmail } from '../utils/clientExchangeDemo.js';

const parse = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
export async function isDemoExchangeClient({ clientId, agencyId, client, database = pool }) {
  if (hasDemoExchangeEmail(client) || hasDemoExchangeEmail(parse(client?.intake_preferences_json))) return true;
  const id = Number(clientId || client?.id), agency = Number(agencyId || client?.agency_id);
  if (!id || !agency) return false;
  const [[row]] = await database.execute(`SELECT c.id,c.email,c.intake_preferences_json,
    EXISTS (SELECT 1 FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
      WHERE cg.client_id=c.id AND (LOWER(TRIM(COALESCE(u.email,''))) REGEXP '@(.*[.])?example([.]com)?$'
        OR LOWER(TRIM(COALESCE(u.personal_email,''))) REGEXP '@(.*[.])?example([.]com)?$'
        OR LOWER(TRIM(COALESCE(u.work_email,''))) REGEXP '@(.*[.])?example([.]com)?$')) AS demo_guardian_email
    FROM clients c WHERE c.id=? AND c.agency_id=? LIMIT 1`, [id,agency]);
  return Number(row?.id) === id && (Number(row.demo_guardian_email) === 1
    || hasDemoExchangeEmail(row) || hasDemoExchangeEmail(parse(row.intake_preferences_json)));
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
  await pool.execute(`UPDATE notifications SET is_resolved=TRUE,is_read=TRUE,resolved_at=COALESCE(resolved_at,NOW())
    WHERE agency_id=? AND related_entity_type='client_exchange_listing' AND related_entity_id=?
      AND type IN ('client_exchange_match','client_exchange_shared','client_exchange_claim','client_exchange_assigned')`,
    [listing.agencyId,listing.id]);
}
