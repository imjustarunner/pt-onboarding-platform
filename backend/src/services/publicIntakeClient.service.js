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

const deriveInitials = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TBD';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase() || 'TBD';
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

const ensureOrganizationIsChild = async (organizationId) => {
  const org = await Agency.findById(organizationId);
  if (!org) throw new Error('Organization not found');
  const orgType = String(org.organization_type || 'agency').toLowerCase();
  if (!['school', 'program', 'learning'].includes(orgType)) {
    throw new Error('Organization must be a school, program, or learning org');
  }
  return org;
};

class PublicIntakeClientService {
  static async createClientAndGuardian({ link, payload }) {
    const scopeType = String(link.scope_type || 'agency').toLowerCase();
    let organizationId = link.organization_id;

    if (scopeType === 'agency') {
      organizationId = payload?.organizationId ? Number(payload.organizationId) : null;
    }

    if (!organizationId) {
      throw new Error('organizationId is required to create a client for this intake link');
    }

    await ensureOrganizationIsChild(organizationId);
    const agencyId = await resolveAgencyId(organizationId);
    if (!agencyId) {
      throw new Error('Unable to resolve agency for intake organization');
    }

    const rawClients = Array.isArray(payload?.clients) && payload.clients.length
      ? payload.clients
      : (payload?.client ? [payload.client] : []);

    const createdClients = [];
    for (const clientPayload of rawClients) {
      const fullName = String(clientPayload?.fullName || '').trim();
      const initials = String(clientPayload?.initials || deriveInitials(fullName)).trim() || 'TBD';
      const contactPhone = String(clientPayload?.contactPhone || '').trim() || null;

      const identifierCode = await generateUniqueSixDigitClientCode({ agencyId });
      const paperworkStatusId = await resolvePaperworkStatusId({ agencyId });
      const clientStatusId = await getClientStatusIdByKey({ agencyId, statusKey: 'packet' });

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
        source: 'PUBLIC_INTAKE_LINK',
        created_by_user_id: null
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
    const createGuardian = scopeType === 'school' ? false : !!link.create_guardian;
    if (createGuardian) {
      const guardianPayload = payload?.guardian || {};
      const email = String(guardianPayload.email || '').trim();
      if (!email) {
        throw new Error('Guardian email is required for guardian account creation');
      }
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        guardianUser = existingUser;
      } else {
        const firstName = String(guardianPayload.firstName || '').trim() || 'Guardian';
        const lastName = String(guardianPayload.lastName || '').trim() || '';
        const phoneNumber = String(guardianPayload.phone || '').trim() || null;
        const tempPassword = await User.generateTemporaryPassword();
        const bcrypt = (await import('bcrypt')).default;
        const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

        guardianUser = await User.create({
          email,
          passwordHash: tempPasswordHash,
          firstName,
          lastName,
          phoneNumber,
          personalEmail: email,
          role: 'client_guardian',
          status: 'PENDING_SETUP'
        });

        await User.setTemporaryPassword(guardianUser.id, tempPassword, 48);
      }

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

    return { clients: createdClients, guardianUser };
  }
}

export default PublicIntakeClientService;
