import { publishedSmsProgramSeed } from '../utils/smsPublishedProgramSeeds.js';
import pool from '../config/database.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';
import { normalizeCampaignProfile, campaignProfileErrors, buildCampaignPacket, campaignPublicContent, campaignPacketMarkdown, SMS_PROGRAMS } from '../utils/smsCampaignPacket.js';

const fail = (status, message) => Object.assign(new Error(message), { status });
const flagsOf = value => { try { return (typeof value === 'string' ? JSON.parse(value) : value) || {}; } catch { return {}; } };
function checkProgram(program) { if (!Object.hasOwn(SMS_PROGRAMS, program)) throw fail(400, 'Unknown messaging program'); }
function checkId(id) { if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw fail(400, 'Invalid agency'); }
async function agencyRecord(id) {
  checkId(id);
  const [rows] = await pool.execute('SELECT * FROM agencies WHERE id = ? AND is_active = TRUE LIMIT 1', [Number(id)]);
  if (!rows[0]) throw fail(404, 'Agency not found');
  return rows[0];
}
function defaults(agency) {
  const https = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
  return normalizeCampaignProfile({ legalName: agency.official_name || '', brandName: agency.name || '',
    supportContact: agency.support_team_email || agency.phone_number || '',
    website: https(agency.website_url), portalUrl: buildPublicPortalBaseUrl(agency),
    businessAddress: [agency.street_address, agency.city, agency.state, agency.postal_code].filter(Boolean).join(', '),
    logoUrl: https(agency.logo_url), organizationPrivacyUrl: '', organizationTermsUrl: '', ownership: '', volume: 'low' });
}
export async function getAgencyCampaignPacket(agencyId, program) {
  checkProgram(program);
  const agency = await agencyRecord(agencyId);
  const stored = flagsOf(agency.feature_flags).smsCampaignPackets?.[program];
  const published = stored?.published || publishedSmsProgramSeed(agency, program);
  const profile = stored?.draft?.profile || published?.profile || flagsOf(agency.feature_flags).smsCampaignProfile || defaults(agency);
  const hasPublished = !!published;
  const packet = buildCampaignPacket(profile, { agencyId, program, origin: buildPublicPortalBaseUrl(agency),
    published: hasPublished && JSON.stringify(profile) === JSON.stringify(published.profile), publishedAt: published?.at || null });
  return { ...packet, hasPublished, markdown: campaignPacketMarkdown(packet), preview: campaignPublicContent(packet), programs: Object.entries(SMS_PROGRAMS).map(([value,p])=>({value,label:p.name})) };
}
export async function saveAgencyCampaignPacket({ agencyId, program, input, actorUserId }) {
  checkProgram(program);
  const agency = await agencyRecord(agencyId);
  const profile = normalizeCampaignProfile(input?.profile);
  const publish = input?.publish === true;
  const missing = campaignProfileErrors(profile);
  if (publish && missing.length) throw fail(400, missing.join('; '));
  if (publish && input?.confirmed !== true) throw fail(400, 'Confirm that the identity, policies and described consent process are accurate before publishing');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT feature_flags FROM agencies WHERE id = ? FOR UPDATE', [Number(agencyId)]);
    const packets = flagsOf(rows[0]?.feature_flags).smsCampaignPackets || {};
    const stored = packets[program] || {};
    const record = { ...stored, draft: { profile, at: new Date().toISOString(), by: actorUserId } };
    if (publish) record.published = { ...record.draft };
    await conn.execute("UPDATE agencies SET feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.smsCampaignPackets', CAST(? AS JSON), '$.smsCampaignProfile', CAST(? AS JSON)), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [JSON.stringify({ ...packets, [program]: record }), JSON.stringify(profile), Number(agencyId)]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  return getAgencyCampaignPacket(agency.id, program);
}
export async function getPublicCampaignPacket(agencyId, program, audience) {
  checkProgram(program);
  const agency = await agencyRecord(agencyId);
  const published = flagsOf(agency.feature_flags).smsCampaignPackets?.[program]?.published || publishedSmsProgramSeed(agency, program);
  if (!published) throw fail(404, 'This messaging program has not been published');
  const packet = buildCampaignPacket(published.profile, { agencyId, program, origin: buildPublicPortalBaseUrl(agency), published: true, publishedAt: published.at });
  // Public allowlist: no agency row, tax ID, actor, credentials, carrier IDs or recipient data.
  return { ...campaignPublicContent(packet, audience), messagingGuideUrl: `${new URL(buildPublicPortalBaseUrl(agency)).origin}/${encodeURIComponent(agency.slug)}/messaging` };
}

export async function getPublicSmsProgramDirectory(slug) {
  if (!/^[a-z0-9_-]{1,100}$/i.test(String(slug))) throw fail(400, 'Invalid organization');
  const [rows] = await pool.execute('SELECT * FROM agencies WHERE (slug = ? OR portal_url = ?) AND is_active = TRUE LIMIT 1', [slug, slug]);
  const agency = rows[0];
  if (!agency) return [];
  return Object.keys(SMS_PROGRAMS).flatMap(program => {
    const published = flagsOf(agency.feature_flags).smsCampaignPackets?.[program]?.published || publishedSmsProgramSeed(agency, program);
    if (!published) return [];
    const packet = buildCampaignPacket(published.profile, { agencyId: agency.id, program, origin: buildPublicPortalBaseUrl(agency), published: true, publishedAt: published.at });
    return [{ name: SMS_PROGRAMS[program].name, termsUrl: packet.links.termsUrl, privacyUrl: packet.links.privacyUrl, consentUrl: packet.registration.evidenceUrl }];
  });
}
