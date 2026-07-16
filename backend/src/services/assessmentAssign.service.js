import crypto from 'crypto';
import pool from '../config/database.js';
import { getFamilyMeta, normalizeFamilyKey } from './assessmentFamilyRegistry.js';
import * as lifeBalanceWheelService from './lifeBalanceWheel.service.js';
import * as valuesAlignmentService from './valuesAlignment.service.js';
import * as teenWellBeingService from './teenWellBeing.service.js';
import * as personalFulfillmentService from './personalFulfillment.service.js';
import * as digitalWellnessService from './digitalWellness.service.js';
import * as mensLifeService from './mensLife.service.js';
import * as parentingConfidenceService from './parentingConfidence.service.js';
import * as burdenPurposeService from './burdenPurpose.service.js';
import * as familyFunctioningService from './familyFunctioning.service.js';
import * as savageBlueprintService from './savageBlueprint.service.js';
import * as rewardRegulationService from './rewardRegulation.service.js';
import * as athleteReadinessService from './athleteReadiness.service.js';
import * as studentSuccessService from './studentSuccess.service.js';
import * as collegeReadinessService from './collegeReadiness.service.js';
import * as marriageAlignmentService from './marriageAlignment.service.js';
import * as relationshipHealthService from './relationshipHealth.service.js';

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function token() {
  return crypto.randomBytes(24).toString('base64url');
}

function buildShareUrls({ path, accessToken, organizationSlug = '' }) {
  const slug = String(organizationSlug || '').trim();
  const brandedPath = slug
    ? `/${slug}/${path}/${accessToken}`
    : `/${path}/${accessToken}`;
  const shortPath = `/${path}/a/${accessToken}`;
  return { brandedPath, shortPath };
}

const SINGLE_CREATORS = {
  life_balance: ({ agencyId, clientId, coachUserId }) =>
    lifeBalanceWheelService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      assignedByUserId: coachUserId
    }),
  values_alignment: ({ agencyId, clientId, coachUserId }) =>
    valuesAlignmentService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      assignedByUserId: coachUserId
    }),
  teen_wellbeing: ({ agencyId, clientId, coachUserId }) =>
    teenWellBeingService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  personal_fulfillment: ({ agencyId, clientId, coachUserId }) =>
    personalFulfillmentService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  digital_wellness: ({ agencyId, clientId, coachUserId }) =>
    digitalWellnessService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  mens_life: ({ agencyId, clientId, coachUserId }) =>
    mensLifeService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  parenting_confidence: ({ agencyId, clientId, coachUserId }) =>
    parentingConfidenceService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  burden_purpose: ({ agencyId, clientId, coachUserId }) =>
    burdenPurposeService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  family_functioning: ({ agencyId, clientId, coachUserId }) =>
    familyFunctioningService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  savage_blueprint: ({ agencyId, clientId, coachUserId }) =>
    savageBlueprintService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  reward_regulation: ({ agencyId, clientId, coachUserId }) =>
    rewardRegulationService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      participantUserId: null,
      context: { assigned: true }
    }),
  athlete_readiness: ({ agencyId, clientId, coachUserId }) =>
    athleteReadinessService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      context: { assigned: true }
    }),
  student_success: ({ agencyId, clientId, coachUserId }) =>
    studentSuccessService.createAssessment({
      agencyId,
      clientId,
      coachUserId,
      context: { assigned: true }
    }),
  college_readiness: ({ agencyId, clientId, coachUserId }) =>
    collegeReadinessService.createAssessment({
      agencyId,
      clientId,
      counselorUserId: coachUserId,
      context: { assigned: true }
    })
};

async function createMarriageCycle({ agencyId, clientId, coachUserId }) {
  const template = await marriageAlignmentService.getDefaultTemplate({ agencyId });
  const [result] = await pool.execute(
    `INSERT INTO marriage_alignment_cycles
      (agency_id, client_id, template_id, template_version, display_name, mode, participant_version, status, context_json)
     VALUES (?, ?, ?, ?, ?, 'full', 'general', 'invited', ?)`,
    [
      agencyId ? Number(agencyId) : null,
      clientId ? Number(clientId) : null,
      template.id,
      template.version,
      'Marriage Alignment Assessment',
      JSON.stringify({ assigned: true, coachUserId: coachUserId || null })
    ]
  );
  const cycleId = result.insertId;
  const tokenA = token();
  const tokenB = token();
  await pool.execute(
    `INSERT INTO marriage_alignment_partner_assessments
      (cycle_id, partner_role, display_label, access_token, status)
     VALUES (?, 'partner-a', 'Partner A', ?, 'not_started'),
            (?, 'partner-b', 'Partner B', ?, 'not_started')`,
    [cycleId, tokenA, cycleId, tokenB]
  );
  return {
    id: cycleId,
    accessToken: tokenA,
    inviteTokens: { partnerA: tokenA, partnerB: tokenB },
    clientId: clientId ? Number(clientId) : null,
    agencyId: agencyId ? Number(agencyId) : null
  };
}

async function createRelationshipCycle({ agencyId, clientId, coachUserId }) {
  const template = await relationshipHealthService.getDefaultTemplate({ agencyId });
  const [result] = await pool.execute(
    `INSERT INTO relationship_assessment_cycles
      (agency_id, client_id, template_id, template_version, display_name, mode, status, context_json)
     VALUES (?, ?, ?, ?, ?, 'full', 'invited', ?)`,
    [
      agencyId ? Number(agencyId) : null,
      clientId ? Number(clientId) : null,
      template.id,
      template.version,
      'Relationship Health Assessment',
      JSON.stringify({ assigned: true, coachUserId: coachUserId || null })
    ]
  );
  const cycleId = result.insertId;
  const tokenA = token();
  const tokenB = token();
  await pool.execute(
    `INSERT INTO relationship_partner_assessments
      (cycle_id, partner_role, display_label, access_token, status)
     VALUES (?, 'partner-a', 'Partner A', ?, 'not_started'),
            (?, 'partner-b', 'Partner B', ?, 'not_started')`,
    [cycleId, tokenA, cycleId, tokenB]
  );
  return {
    id: cycleId,
    accessToken: tokenA,
    inviteTokens: { partnerA: tokenA, partnerB: tokenB },
    clientId: clientId ? Number(clientId) : null,
    agencyId: agencyId ? Number(agencyId) : null
  };
}

/**
 * Assign any of the 16 families to a client; returns access token + URL paths.
 */
export async function assignAssessmentToClient({
  family,
  agencyId,
  clientId,
  coachUserId = null,
  organizationSlug = ''
} = {}) {
  const familyKey = normalizeFamilyKey(family);
  const meta = getFamilyMeta(familyKey);
  if (!meta) throw err(400, `Unknown assessment family: ${family}`);
  if (!clientId) throw err(400, 'clientId is required');
  if (!agencyId) throw err(400, 'agencyId is required');

  if (meta.kind === 'couples') {
    const cycle =
      familyKey === 'marriage_alignment'
        ? await createMarriageCycle({ agencyId, clientId, coachUserId })
        : await createRelationshipCycle({ agencyId, clientId, coachUserId });
    const urls = buildShareUrls({
      path: meta.path,
      accessToken: cycle.accessToken,
      organizationSlug
    });
    return {
      family: familyKey,
      catalogId: meta.catalogId,
      title: meta.title,
      kind: meta.kind,
      assessment: cycle,
      accessToken: cycle.accessToken,
      inviteTokens: cycle.inviteTokens,
      ...urls
    };
  }

  const creator = SINGLE_CREATORS[familyKey];
  if (!creator) throw err(400, `No assign handler for ${familyKey}`);

  const assessment = await creator({
    agencyId: Number(agencyId),
    clientId: Number(clientId),
    coachUserId: coachUserId || null
  });

  const accessToken = assessment.accessToken || assessment.access_token;
  if (!accessToken) throw err(500, 'Assessment created without access token');

  const urls = buildShareUrls({
    path: meta.path,
    accessToken,
    organizationSlug
  });

  return {
    family: familyKey,
    catalogId: meta.catalogId,
    title: meta.title,
    kind: meta.kind,
    assessment,
    accessToken,
    ...urls
  };
}
