import config from '../config/config.js';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import Client from '../models/Client.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import User from '../models/User.model.js';
import { generateUniqueSixDigitClientCode } from '../utils/clientCode.js';
import { resolvePaperworkStatusId, seedClientAffiliations, seedClientPaperworkItems } from '../utils/clientProvisioning.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';

/**
 * Guardian accounts created through public intake were being inserted into
 * `users` without any matching `user_agencies` row. That meant:
 *   • `GET /api/users/guardians` (which scopes to the viewer's agencies) did
 *     not return them, so staff saw a "Linked Clients: 0 / no agency" gap
 *     even though the child was correctly attached.
 *   • Agency filters on the Guardians view skipped them entirely.
 *   • Any downstream permission code keyed off user_agencies (portal access,
 *     cross-tenant isolation) treated the guardian as tenant-less.
 * This helper is the single seam for every intake path to make sure a new OR
 * pre-existing guardian is affiliated with the same tenant that owns the
 * child(ren) the guardian is being linked to.
 */
const ensureGuardianAgencyAffiliation = async (guardianUserId, agencyId) => {
  const uid = Number(guardianUserId || 0) || null;
  const aid = Number(agencyId || 0) || null;
  if (!uid || !aid) return;
  try {
    await pool.execute(
      `INSERT INTO user_agencies (user_id, agency_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE user_id = user_id`,
      [uid, aid]
    );
  } catch (err) {
    // Best-effort — surface visibly so the guardian silently-missing-from-agency
    // class of bugs can't recur without us noticing. Downstream intake flow
    // continues regardless so we don't break packet delivery.
    console.warn('[publicIntakeClient] user_agencies affiliation failed for guardian', {
      guardianUserId: uid,
      agencyId: aid,
      message: err?.message || err
    });
  }
};

const linkHasRegistrationIntakeStep = (link) => {
  const raw = link?.intake_steps;
  let steps = raw;
  if (!steps) return false;
  if (typeof steps === 'string') {
    try {
      steps = JSON.parse(steps);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(steps)) return false;
  return steps.some((s) => String(s?.type || '').trim().toLowerCase() === 'registration');
};

const usesExtendedRegistrationTempPasswordWindow = (link) => {
  const ft = String(link?.form_type || '').trim().toLowerCase();
  return ft === 'smart_registration' || (ft === 'intake' && linkHasRegistrationIntakeStep(link));
};

export const deriveInitials = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TBD';
  const formatTri = (value) => {
    const cleaned = String(value || '').replace(/[^a-zA-Z]/g, '').slice(0, 3);
    if (!cleaned) return '';
    const lower = cleaned.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };
  const first = formatTri(parts[0] || '');
  const last = formatTri(parts.length > 1 ? parts[parts.length - 1] : '');
  const combined = `${first}${last}`;
  return combined || 'TBD';
};

const resolveAgencyId = async (organizationId) => {
  const orgId = Number(organizationId);
  if (!orgId) return null;
  return (
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(orgId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(orgId)) ||
    null
  );
};

const buildGuardianPasswordlessLoginUrl = (agencyRecord, token) => {
  const frontendBase = String(config.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const portalSlug = String(agencyRecord?.portal_url || '').trim();
  if (!frontendBase || !token) return '';
  return portalSlug
    ? `${frontendBase}/${portalSlug}/passwordless-login/${token}`
    : `${frontendBase}/passwordless-login/${token}`;
};

const ensureOrganizationIsChild = async (organizationId) => {
  const org = await Agency.findById(organizationId);
  if (!org) throw new Error('Organization not found');
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  if (!['school', 'program', 'learning', 'clinical'].includes(orgType)) {
    throw new Error('Organization must be a school, program, learning, or clinical org');
  }
  return org;
};

class PublicIntakeClientService {
  static async createClientAndGuardian({ link, payload }) {
    const scopeType = String(link.scope_type || 'agency').toLowerCase();
    let organizationId = link.organization_id;

    if (scopeType === 'agency') {
      const payloadOrg = payload?.organizationId ? Number(payload.organizationId) : null;
      organizationId = payloadOrg || organizationId || null;
    }

    if (!organizationId) {
      throw new Error('organizationId is required to create a client for this intake link');
    }

    const organization = await ensureOrganizationIsChild(organizationId);
    const orgType = String(organization?.organization_type || 'agency').toLowerCase();
    const agencyId = await resolveAgencyId(organizationId);
    if (!agencyId) {
      throw new Error('Unable to resolve agency for intake organization');
    }

    const rawClients = Array.isArray(payload?.clients) && payload.clients.length
      ? payload.clients
      : (payload?.client ? [payload.client] : []);

    const createdClients = [];
    const createGuardian = !!link.create_guardian;
    for (const clientPayload of rawClients) {
      const firstName = String(clientPayload?.firstName || '').trim();
      const lastName = String(clientPayload?.lastName || '').trim();
      const fullName = String(clientPayload?.fullName || `${firstName} ${lastName}` || '').trim();
      const initials = String(clientPayload?.initials || deriveInitials(fullName)).trim() || 'TBD';
      const contactPhone = String(clientPayload?.contactPhone || '').trim() || null;

      const identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
      const paperworkStatusId = await resolvePaperworkStatusId({ agencyId });
      const clientStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'packet' });
      const clientType =
        scopeType === 'school' || orgType === 'school'
          ? 'school'
          : orgType === 'learning'
            ? 'learning'
            : (orgType === 'program' || orgType === 'clinical')
              ? 'clinical'
              : 'basic_nonclinical';

      const client = await Client.create({
        organization_id: organizationId,
        agency_id: agencyId,
        provider_id: null,
        initials,
        full_name: fullName || null,
        contact_phone: contactPhone,
        identifier_code: identifierCode,
        status: 'PACKET',
        submission_date: new Date().toISOString().split('T')[0],
        document_status: 'UPLOADED',
        paperwork_status_id: paperworkStatusId,
        client_status_id: clientStatusId,
        client_type: clientType,
        source: 'PUBLIC_INTAKE_LINK',
        created_by_user_id: null,
        ...(createGuardian ? { guardian_portal_enabled: true } : {})
      });

      await seedClientAffiliations({
        clientId: client.id,
        agencyId,
        organizationId
      });
      await seedClientPaperworkItems({ clientId: client.id, agencyId });

      await ClientStatusHistory.create({
        client_id: client.id,
        changed_by_user_id: null,
        field_changed: 'created',
        from_value: null,
        to_value: JSON.stringify({ source: 'PUBLIC_INTAKE_LINK', status: 'PACKET' }),
        note: 'Client created via public intake link'
      });

      createdClients.push(client);
    }

    let guardianUser = null;
    let newGuardianCreated = false;
    let newGuardianTemporaryPassword = null;
    let newGuardianPasswordlessLoginUrl = null;
    if (createGuardian) {
      const guardianPayload = payload?.guardian || {};
      const email = String(guardianPayload.email || '').trim();
      if (!email) {
        throw new Error('Guardian email is required for guardian account creation');
      }
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        guardianUser = existingUser;
        const roleNorm = String(guardianUser.role || '').toLowerCase();
        if (roleNorm === 'client_guardian') {
          const tempHours = usesExtendedRegistrationTempPasswordWindow(link) ? 72 : 48;
          try {
            const agencyRecord = await Agency.findById(agencyId);
            const tokenResult = await User.generatePasswordlessToken(guardianUser.id, tempHours, 'setup');
            newGuardianPasswordlessLoginUrl = buildGuardianPasswordlessLoginUrl(agencyRecord, tokenResult.token);
          } catch (tokenErr) {
            console.error('[publicIntakeClient] existing guardian passwordless token failed', {
              userId: guardianUser.id,
              message: tokenErr?.message || tokenErr
            });
          }
        }
      } else {
        const firstName = String(guardianPayload.firstName || '').trim() || 'Guardian';
        const lastName = String(guardianPayload.lastName || '').trim() || '';
        const phoneNumber = String(guardianPayload.phone || '').trim() || null;

        guardianUser = await User.create({
          email,
          passwordHash: null,
          firstName,
          lastName,
          phoneNumber,
          personalEmail: email,
          role: 'client_guardian',
          status: 'ACTIVE_EMPLOYEE'
        });
        newGuardianCreated = true;

        const tempHours = usesExtendedRegistrationTempPasswordWindow(link) ? 72 : 48;
        try {
          const agencyRecord = await Agency.findById(agencyId);
          const tokenResult = await User.generatePasswordlessToken(guardianUser.id, tempHours, 'setup');
          newGuardianPasswordlessLoginUrl = buildGuardianPasswordlessLoginUrl(agencyRecord, tokenResult.token);
        } catch (tokenErr) {
          console.error('[publicIntakeClient] guardian passwordless token failed', {
            userId: guardianUser.id,
            message: tokenErr?.message || tokenErr
          });
        }
      }

      // Always attach the guardian to the child's tenant, even if the guardian
      // row pre-existed (they might have been created in a different agency
      // context earlier). This keeps the Guardians list + agency filters in
      // sync with the client(s) they're actually linked to.
      await ensureGuardianAgencyAffiliation(guardianUser.id, agencyId);

      for (const client of createdClients) {
        await ClientGuardian.upsertLink({
          clientId: client.id,
          guardianUserId: guardianUser.id,
          relationshipTitle: guardianPayload.relationship || 'Guardian',
          accessEnabled: true,
          permissionsJson: { intakeLink: link.id },
          createdByUserId: null
        });
      }
    }

    return {
      clients: createdClients,
      guardianUser,
      newGuardianCreated,
      newGuardianTemporaryPassword,
      newGuardianPasswordlessLoginUrl
    };
  }

  /**
   * Link an existing guardian account to one or more existing clients (returning-family intake path).
   * Mirrors guardian provisioning from createClientAndGuardian without creating new client rows.
   */
  static async provisionGuardianForIntakeClients({ link, agencyId, clients = [], payload = {} }) {
    const createdClients = Array.isArray(clients) ? clients.filter((c) => c && Number(c.id)) : [];
    let guardianUser = null;
    let newGuardianCreated = false;
    let newGuardianTemporaryPassword = null;
    let newGuardianPasswordlessLoginUrl = null;
    if (!link.create_guardian || !createdClients.length) {
      return {
        clients: createdClients,
        guardianUser,
        newGuardianCreated,
        newGuardianTemporaryPassword,
        newGuardianPasswordlessLoginUrl
      };
    }
    const guardianPayload = payload?.guardian || {};
    const email = String(guardianPayload.email || '').trim();
    if (!email) {
      throw new Error('Guardian email is required for guardian account creation');
    }
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      guardianUser = existingUser;
      const roleNorm = String(guardianUser.role || '').toLowerCase();
      if (roleNorm === 'client_guardian') {
        const tempHours = usesExtendedRegistrationTempPasswordWindow(link) ? 72 : 48;
        try {
          const agencyRecord = await Agency.findById(agencyId);
          const tokenResult = await User.generatePasswordlessToken(guardianUser.id, tempHours, 'setup');
          newGuardianPasswordlessLoginUrl = buildGuardianPasswordlessLoginUrl(agencyRecord, tokenResult.token);
        } catch (tokenErr) {
          console.error('[publicIntakeClient] returning guardian passwordless token failed', {
            userId: guardianUser.id,
            message: tokenErr?.message || tokenErr
          });
        }
      }
    } else {
      const firstName = String(guardianPayload.firstName || '').trim() || 'Guardian';
      const lastName = String(guardianPayload.lastName || '').trim() || '';
      const phoneNumber = String(guardianPayload.phone || '').trim() || null;
      guardianUser = await User.create({
        email,
        passwordHash: null,
        firstName,
        lastName,
        phoneNumber,
        personalEmail: email,
        role: 'client_guardian',
        status: 'ACTIVE_EMPLOYEE'
      });
      newGuardianCreated = true;
      const tempHours = usesExtendedRegistrationTempPasswordWindow(link) ? 72 : 48;
      try {
        const agencyRecord = await Agency.findById(agencyId);
        const tokenResult = await User.generatePasswordlessToken(guardianUser.id, tempHours, 'setup');
        newGuardianPasswordlessLoginUrl = buildGuardianPasswordlessLoginUrl(agencyRecord, tokenResult.token);
      } catch (tokenErr) {
        console.error('[publicIntakeClient] returning guardian passwordless token failed (new user)', {
          userId: guardianUser.id,
          message: tokenErr?.message || tokenErr
        });
      }
    }

    // Returning-family path goes through here with an existing child row; tie
    // the guardian to the resolved agency so the Guardians admin view sees
    // them scoped to the same tenant as their kids.
    await ensureGuardianAgencyAffiliation(guardianUser.id, agencyId);

    for (const client of createdClients) {
      await ClientGuardian.upsertLink({
        clientId: client.id,
        guardianUserId: guardianUser.id,
        relationshipTitle: guardianPayload.relationship || 'Guardian',
        accessEnabled: true,
        permissionsJson: { intakeLink: link.id },
        createdByUserId: null
      });
    }

    return {
      clients: createdClients,
      guardianUser,
      newGuardianCreated,
      newGuardianTemporaryPassword,
      newGuardianPasswordlessLoginUrl
    };
  }
}

export default PublicIntakeClientService;
