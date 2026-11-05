/**
 * Save demographic fields read from a signed paper packet onto the client.
 * Empty chart fields are filled. Existing values stay put so staff can merge them.
 */
import Client from '../models/Client.model.js';
import ClientGuardianIntakeProfile from '../models/ClientGuardianIntakeProfile.model.js';
import {
  decryptDemographicsPayload,
  encryptDemographicsPayload,
  isDemographicsEncryptionConfigured
} from './demographicsImport.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import {
  extractPaperPacketDemographics,
  paperPacketDemographicFill,
  paperPacketDemographicsHaveContent
} from '../utils/paperPacketDemographics.util.js';

function splitGuardianName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/** Same guardian card online registration writes. Empty fields only. */
async function fillEmptyGuardianProfile(clientId, parsed) {
  if (!parsed?.guardianName && !parsed?.contactPhone && !parsed?.email) return;
  let existing = null;
  try {
    existing = await ClientGuardianIntakeProfile.findByClientId(clientId);
  } catch {
    existing = null;
  }
  const name = splitGuardianName(parsed.guardianName);
  const profile = {
    firstName: existing?.firstName || name.firstName || null,
    lastName: existing?.lastName || name.lastName || null,
    fullName: existing?.fullName || parsed.guardianName || null,
    email: existing?.email || parsed.email || null,
    phone: existing?.phone || parsed.contactPhone || null,
    relationship: existing?.relationship || null,
    dateOfBirth: existing?.dateOfBirth || null,
    primaryLanguage: existing?.primaryLanguage || null
  };
  const adding = (!existing?.firstName && name.firstName)
    || (!existing?.lastName && name.lastName)
    || (!existing?.email && parsed.email)
    || (!existing?.phone && parsed.contactPhone);
  if (!adding) return;
  await ClientGuardianIntakeProfile.upsertForClient({
    clientId,
    profile,
    source: 'paper_packet'
  });
}

/** Same coverage record online registration writes, and only when the file has none. */
async function fillEmptyInsurance(client, parsed) {
  const agencyId = Number(client?.agency_id || 0);
  const clientId = Number(client?.id || 0);
  if (!agencyId || !clientId) return;
  const hasPrimary = parsed?.primaryInsurance || parsed?.memberId || parsed?.policyGroup || parsed?.policyHolder;
  if (!hasPrimary && !parsed?.secondaryInsurance) return;
  let existing = null;
  try {
    existing = await readClientInsurance(clientId, agencyId);
  } catch {
    return;
  }
  if (existing?.primary?.insurerName || existing?.primary?.memberId) return;
  const primary = {
    insurerName: parsed.primaryInsurance || '',
    memberId: parsed.memberId || '',
    groupNumber: parsed.policyGroup || '',
    subscriberName: parsed.policyHolder || ''
  };
  const secondary = (parsed.secondaryInsurance || parsed.secondaryMemberId || parsed.secondaryGroup || parsed.secondaryHolder)
    ? {
      insurerName: parsed.secondaryInsurance || '',
      memberId: parsed.secondaryMemberId || '',
      groupNumber: parsed.secondaryGroup || '',
      subscriberName: parsed.secondaryHolder || ''
    }
    : null;
  if (!primary.insurerName && !primary.memberId) return;
  await writeClientInsurance({
    clientId,
    agencyId,
    primary,
    secondary,
    verifiedForClaims: false
  });
}

export function readPaperPacketDemographicCandidate(client) {
  const enc = client?.paper_packet_demo_candidate_enc;
  if (!enc || enc === true || enc?.encrypted === true) return null;
  try {
    const parsed = decryptDemographicsPayload(enc);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!paperPacketDemographicsHaveContent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function applyPaperPacketDemographicsFromText({
  clientId,
  ocrText,
  actorUserId = null
} = {}) {
  const cid = Number(clientId || 0);
  const parsed = extractPaperPacketDemographics(ocrText);
  if (!cid || !paperPacketDemographicsHaveContent(parsed)) {
    return { attempted: true, stored: false, filled: [] };
  }
  const client = await Client.findById(cid);
  if (!client) return { attempted: true, stored: false, filled: [] };

  const patch = paperPacketDemographicFill(client, parsed);
  if (isDemographicsEncryptionConfigured()) {
    patch.paper_packet_demo_candidate_enc = encryptDemographicsPayload({
      ...parsed,
      readAt: new Date().toISOString()
    });
  }
  if (Object.keys(patch).length) {
    try {
      await Client.update(cid, patch, actorUserId || undefined);
    } catch (error) {
      if (error?.code !== 'ER_BAD_FIELD_ERROR' || !patch.paper_packet_demo_candidate_enc) throw error;
      delete patch.paper_packet_demo_candidate_enc;
      if (Object.keys(patch).length) await Client.update(cid, patch, actorUserId || undefined);
    }
  }
  try {
    await fillEmptyGuardianProfile(cid, parsed);
  } catch (error) {
    console.warn('[paperPacketDemographics] guardian profile fill failed', error?.message || error);
  }
  try {
    await fillEmptyInsurance(client, parsed);
  } catch (error) {
    console.warn('[paperPacketDemographics] insurance fill failed', error?.message || error);
  }
  return {
    attempted: true,
    stored: !!patch.paper_packet_demo_candidate_enc,
    filled: Object.keys(patch).filter((key) => key !== 'paper_packet_demo_candidate_enc')
  };
}
