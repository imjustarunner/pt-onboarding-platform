import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import LearningProgramClass from '../models/LearningProgramClass.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import ChallengeParticipantProfile from '../models/ChallengeParticipantProfile.model.js';

const asInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const asBool = (v, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'on';
};

// Roles that can manage challenges/classes. provider_plus = Team Manager / Team Lead (Summit Stats Challenge).
const canManageRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'support' || r === 'staff' || r === 'clinical_practice_assistant' || r === 'provider_plus';
};

const isSubCoordinator = (userLike) => {
  return (
    userLike?.has_skill_builder_coordinator_access === true ||
    userLike?.has_skill_builder_coordinator_access === 1 ||
    userLike?.has_skill_builder_coordinator_access === '1'
  );
};

const getUserAgencyContext = async (userId) => {
  const memberships = await User.getAgencies(userId);
  const allOrgIds = (memberships || []).map((m) => Number(m?.id || 0)).filter((n) => Number.isFinite(n) && n > 0);
  const agencyIds = (memberships || [])
    .filter((m) => String(m?.organization_type || '').toLowerCase() === 'agency')
    .map((m) => Number(m?.id || 0))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { allOrgIds, agencyIds };
};

// Summit Stats Challenge: Challenges can live under 'learning' or 'affiliation' orgs (program divisions).
const ensureLearningOrganization = async (organizationId) => {
  const orgId = asInt(organizationId);
  if (!orgId) return { ok: false, status: 400, message: 'organizationId is required' };
  const [rows] = await pool.execute(
    `SELECT id, name, slug, organization_type
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [orgId]
  );
  const org = rows?.[0] || null;
  if (!org) return { ok: false, status: 404, message: 'Organization not found' };
  const orgType = String(org.organization_type || '').toLowerCase();
  // Program orgs host therapy-style "enrollments" (learning_program_classes) without being learning-type tenants.
  if (orgType !== 'learning' && orgType !== 'affiliation' && orgType !== 'program') {
    return {
      ok: false,
      status: 400,
      message: 'organizationId must be a program, learning, or affiliation organization'
    };
  }
  return { ok: true, organization: org };
};

const canAccessOrganization = async ({ user, organizationId }) => {
  if (String(user?.role || '').toLowerCase() === 'super_admin') return true;
  const ctx = await getUserAgencyContext(user.id);
  if (ctx.allOrgIds.includes(Number(organizationId))) return true;
  const affAgencyId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(organizationId);
  return !!affAgencyId && ctx.agencyIds.includes(Number(affAgencyId));
};

// Summit Stats: Agency-level management is super_admin only. Admins manage affiliations only.
const canManageAtOrganization = async ({ user, organizationId }) => {
  const orgId = asInt(organizationId);
  if (!orgId) return false;
  const [rows] = await pool.execute(
    `SELECT organization_type FROM agencies WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const orgType = String(rows?.[0]?.organization_type || '').toLowerCase();
  if (orgType === 'agency') return String(user?.role || '').toLowerCase() === 'super_admin';
  return canManageRole(user?.role) || isSubCoordinator(user);
};

const ensureClassLifecycleStatus = async (klass) => {
  if (!klass) return null;
  const status = String(klass.status || '').toLowerCase();
  const isActive = klass.is_active === 1 || klass.is_active === true;
  if (!isActive || status !== 'active' || !klass.ends_at) return klass;
  const now = Date.now();
  const endsAt = new Date(klass.ends_at).getTime();
  if (!Number.isFinite(endsAt) || endsAt >= now) return klass;
  const updated = await LearningProgramClass.update(klass.id, { status: 'closed' });
  return updated || klass;
};

export const listLearningProgramClasses = async (req, res, next) => {
  try {
    const organizationId = asInt(req.query.organizationId);
    if (!organizationId) return res.status(400).json({ error: { message: 'organizationId is required' } });
    const orgCheck = await ensureLearningOrganization(organizationId);
    if (!orgCheck.ok) return res.status(orgCheck.status).json({ error: { message: orgCheck.message } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this learning program' } });

    const includeArchived = asBool(req.query.includeArchived, false);
    const classes = await LearningProgramClass.listByOrganization({ organizationId, includeArchived });
    const out = [];
    for (const row of classes || []) out.push(await ensureClassLifecycleStatus(row));
    return res.json({ organizationId, classes: out });
  } catch (e) {
    next(e);
  }
};

export const getLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    let klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    klass = await ensureClassLifecycleStatus(klass);
    const [intakeRows] = await pool.execute(
      `SELECT * FROM intake_links
       WHERE scope_type = 'learning_class' AND learning_class_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [classId]
    );
    const intakeLinks = (intakeRows || []).map((r) => IntakeLink.normalize(r));
    const resources = await LearningProgramClass.listResources(classId);
    const clientMembers = await LearningProgramClass.listClientMembers(classId);
    const providerMembers = await LearningProgramClass.listProviderMembers(classId);
    return res.json({ class: klass, intakeLinks, resources, clientMembers, providerMembers });
  } catch (e) {
    next(e);
  }
};

export const createLearningProgramClass = async (req, res, next) => {
  try {
    const organizationId = asInt(req.body.organizationId);
    const className = String(req.body.className || '').trim();
    if (!organizationId || !className) {
      return res.status(400).json({ error: { message: 'organizationId and className are required' } });
    }
    const orgCheck = await ensureLearningOrganization(organizationId);
    if (!orgCheck.ok) return res.status(orgCheck.status).json({ error: { message: orgCheck.message } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this learning program' } });
    const klass = await LearningProgramClass.create({
      organizationId,
      className,
      classCode: req.body.classCode ? String(req.body.classCode).trim() : null,
      description: req.body.description ? String(req.body.description) : null,
      timezone: req.body.timezone ? String(req.body.timezone) : 'America/New_York',
      startsAt: req.body.startsAt || null,
      endsAt: req.body.endsAt || null,
      enrollmentOpensAt: req.body.enrollmentOpensAt || null,
      enrollmentClosesAt: req.body.enrollmentClosesAt || null,
      status: req.body.status || 'draft',
      isActive: asBool(req.body.isActive, true),
      allowLateJoin: asBool(req.body.allowLateJoin, false),
      maxClients: asInt(req.body.maxClients),
      metadataJson: req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      activityTypesJson: req.body.activityTypesJson && typeof req.body.activityTypesJson === 'object' ? req.body.activityTypesJson : (Array.isArray(req.body.activityTypesJson) ? req.body.activityTypesJson : null),
      scoringRulesJson: req.body.scoringRulesJson && typeof req.body.scoringRulesJson === 'object' ? req.body.scoringRulesJson : null,
      weeklyGoalMinimum: req.body.weeklyGoalMinimum != null ? asInt(req.body.weeklyGoalMinimum) : null,
      teamMinPointsPerWeek: req.body.teamMinPointsPerWeek != null ? asInt(req.body.teamMinPointsPerWeek) : null,
      individualMinPointsPerWeek: req.body.individualMinPointsPerWeek != null ? asInt(req.body.individualMinPointsPerWeek) : null,
      weekStartTime: req.body.weekStartTime || null,
      mastersAgeThreshold: req.body.mastersAgeThreshold != null ? asInt(req.body.mastersAgeThreshold) : 53,
      recognitionCategoriesJson: (() => {
        const v = req.body.recognitionCategoriesJson;
        if (Array.isArray(v)) return v;
        if (typeof v === 'string' && v.trim()) { try { return JSON.parse(v); } catch { return null; } }
        return null;
      })(),
      recognitionMetric: req.body.recognitionMetric || 'points',
      deliveryMode: String(req.body.deliveryMode || req.body.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
      registrationEligible: asBool(req.body.registrationEligible ?? req.body.registration_eligible, false),
      medicaidEligible: asBool(req.body.medicaidEligible ?? req.body.medicaid_eligible, false),
      cashEligible: asBool(req.body.cashEligible ?? req.body.cash_eligible, false),
      createdByUserId: req.user.id
    });
    return res.status(201).json({ class: klass });
  } catch (e) {
    next(e);
  }
};

export const updateLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const current = await LearningProgramClass.findById(classId);
    if (!current) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: current.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: current.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });

    const patch = {
      className: req.body.className !== undefined ? String(req.body.className || '').trim() : undefined,
      classCode: req.body.classCode !== undefined ? (req.body.classCode ? String(req.body.classCode).trim() : null) : undefined,
      description: req.body.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined,
      timezone: req.body.timezone !== undefined ? String(req.body.timezone || '').trim() : undefined,
      startsAt: req.body.startsAt !== undefined ? req.body.startsAt || null : undefined,
      endsAt: req.body.endsAt !== undefined ? req.body.endsAt || null : undefined,
      enrollmentOpensAt: req.body.enrollmentOpensAt !== undefined ? req.body.enrollmentOpensAt || null : undefined,
      enrollmentClosesAt: req.body.enrollmentClosesAt !== undefined ? req.body.enrollmentClosesAt || null : undefined,
      status: req.body.status !== undefined ? String(req.body.status || '').toLowerCase() : undefined,
      isActive: req.body.isActive !== undefined ? asBool(req.body.isActive, true) : undefined,
      allowLateJoin: req.body.allowLateJoin !== undefined ? asBool(req.body.allowLateJoin, false) : undefined,
      maxClients: req.body.maxClients !== undefined ? asInt(req.body.maxClients) : undefined,
      metadataJson: req.body.metadataJson !== undefined
        ? (req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null)
        : undefined,
      activityTypesJson: req.body.activityTypesJson !== undefined
        ? (req.body.activityTypesJson && typeof req.body.activityTypesJson === 'object' ? req.body.activityTypesJson : (Array.isArray(req.body.activityTypesJson) ? req.body.activityTypesJson : null))
        : undefined,
      scoringRulesJson: req.body.scoringRulesJson !== undefined
        ? (req.body.scoringRulesJson && typeof req.body.scoringRulesJson === 'object' ? req.body.scoringRulesJson : null)
        : undefined,
      weeklyGoalMinimum: req.body.weeklyGoalMinimum !== undefined ? (req.body.weeklyGoalMinimum != null ? asInt(req.body.weeklyGoalMinimum) : null) : undefined,
      teamMinPointsPerWeek: req.body.teamMinPointsPerWeek !== undefined ? (req.body.teamMinPointsPerWeek != null ? asInt(req.body.teamMinPointsPerWeek) : null) : undefined,
      individualMinPointsPerWeek: req.body.individualMinPointsPerWeek !== undefined ? (req.body.individualMinPointsPerWeek != null ? asInt(req.body.individualMinPointsPerWeek) : null) : undefined,
      weekStartTime: req.body.weekStartTime !== undefined ? (req.body.weekStartTime || null) : undefined,
      mastersAgeThreshold: req.body.mastersAgeThreshold !== undefined ? (req.body.mastersAgeThreshold != null ? asInt(req.body.mastersAgeThreshold) : null) : undefined,
      recognitionCategoriesJson: req.body.recognitionCategoriesJson !== undefined
        ? (Array.isArray(req.body.recognitionCategoriesJson) ? req.body.recognitionCategoriesJson : (req.body.recognitionCategoriesJson ? JSON.parse(String(req.body.recognitionCategoriesJson)) : null))
        : undefined,
      recognitionMetric: req.body.recognitionMetric !== undefined ? (req.body.recognitionMetric || null) : undefined,
      deliveryMode: req.body.deliveryMode !== undefined || req.body.delivery_mode !== undefined
        ? (String(req.body.deliveryMode || req.body.delivery_mode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group')
        : undefined
    };
    const nextClass = await LearningProgramClass.update(classId, patch);
    return res.json({ class: nextClass });
  } catch (e) {
    next(e);
  }
};

export const duplicateLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const source = await LearningProgramClass.findById(classId);
    if (!source) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: source.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: source.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });

    const copyMembers = asBool(req.body.copyMembers, false);
    const newName = req.body.className ? String(req.body.className).trim() : `${source.class_name} (Copy)`;
    const dup = await LearningProgramClass.create({
      organizationId: source.organization_id,
      className: newName,
      classCode: source.class_code ? `${source.class_code}-copy` : null,
      description: source.description || null,
      timezone: source.timezone || 'America/New_York',
      startsAt: source.starts_at || null,
      endsAt: source.ends_at || null,
      enrollmentOpensAt: source.enrollment_opens_at || null,
      enrollmentClosesAt: source.enrollment_closes_at || null,
      status: 'draft',
      isActive: true,
      allowLateJoin: asBool(source.allow_late_join, false),
      maxClients: source.max_clients || null,
      metadataJson: source.metadata_json || null,
      activityTypesJson: source.activity_types_json || null,
      scoringRulesJson: source.scoring_rules_json || null,
      weeklyGoalMinimum: source.weekly_goal_minimum ?? null,
      teamMinPointsPerWeek: source.team_min_points_per_week ?? null,
      individualMinPointsPerWeek: source.individual_min_points_per_week ?? null,
      weekStartTime: source.week_start_time || null,
      mastersAgeThreshold: source.masters_age_threshold ?? 53,
      recognitionCategoriesJson: source.recognition_categories_json || null,
      recognitionMetric: source.recognition_metric || 'points',
      deliveryMode: source.delivery_mode || 'group',
      registrationEligible: !!(source.registration_eligible === 1 || source.registration_eligible === true),
      medicaidEligible: !!(source.medicaid_eligible === 1 || source.medicaid_eligible === true),
      cashEligible: !!(source.cash_eligible === 1 || source.cash_eligible === true),
      createdByUserId: req.user.id
    });

    const sourceResources = await LearningProgramClass.listResources(classId);
    for (const r of sourceResources || []) {
      await LearningProgramClass.createResource({
        classId: dup.id,
        resourceType: r.resource_type,
        title: r.title,
        description: r.description,
        filePath: r.file_path,
        externalUrl: r.external_url,
        sortOrder: r.sort_order,
        isPublished: asBool(r.is_published, true),
        visibleToClients: asBool(r.visible_to_clients, true),
        visibleToProviders: asBool(r.visible_to_providers, true),
        metadataJson: r.metadata_json,
        createdByUserId: req.user.id
      });
    }

    if (copyMembers) {
      const clients = await LearningProgramClass.listClientMembers(classId);
      const providers = await LearningProgramClass.listProviderMembers(classId);
      for (const c of clients || []) {
        if (String(c.membership_status || '').toLowerCase() === 'removed') continue;
        await LearningProgramClass.addClientMember({
          classId: dup.id,
          clientId: c.client_id,
          membershipStatus: 'active',
          roleLabel: c.role_label || null,
          notes: c.notes || null,
          actorUserId: req.user.id
        });
      }
      for (const p of providers || []) {
        if (String(p.membership_status || '').toLowerCase() === 'removed') continue;
        await LearningProgramClass.addProviderMember({
          classId: dup.id,
          providerUserId: p.provider_user_id,
          membershipStatus: 'active',
          roleLabel: p.role_label || null,
          notes: p.notes || null,
          actorUserId: req.user.id
        });
      }
    }

    const [intakeRows] = await pool.execute(
      `SELECT * FROM intake_links
       WHERE scope_type = 'learning_class' AND learning_class_id = ?`,
      [classId]
    );
    const duplicatedIntakeLinks = [];
    for (const row of intakeRows || []) {
      const normalized = IntakeLink.normalize(row);
      const link = await IntakeLink.create({
        publicKey: crypto.randomBytes(24).toString('hex'),
        title: normalized?.title ? `${normalized.title} (Copy)` : 'Class Registration (Copy)',
        description: normalized?.description || null,
        languageCode: normalized?.language_code || 'en',
        scopeType: 'learning_class',
        formType: normalized?.form_type || 'intake',
        organizationId: dup.organization_id,
        programId: normalized?.program_id || null,
        jobDescriptionId: normalized?.job_description_id || null,
        learningClassId: dup.id,
        isActive: false,
        createClient: normalized?.create_client !== false,
        createGuardian: normalized?.create_guardian === true,
        requiresAssignment: normalized?.requires_assignment !== false,
        allowedDocumentTemplateIds: normalized?.allowed_document_template_ids || null,
        intakeFields: normalized?.intake_fields || null,
        intakeSteps: normalized?.intake_steps || null,
        retentionPolicy: normalized?.retention_policy_json || null,
        customMessages: normalized?.custom_messages || null,
        createdByUserId: req.user.id
      });
      duplicatedIntakeLinks.push(link);
    }

    return res.status(201).json({ class: dup, duplicatedIntakeLinks });
  } catch (e) {
    next(e);
  }
};

export const upsertClassClientMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const clientId = asInt(m?.clientId);
      if (!clientId) continue;
      await LearningProgramClass.addClientMember({
        classId,
        clientId,
        membershipStatus: String(m?.membershipStatus || 'active').toLowerCase(),
        roleLabel: m?.roleLabel ? String(m.roleLabel) : null,
        notes: m?.notes ? String(m.notes) : null,
        actorUserId: req.user.id
      });
    }
    const clientMembers = await LearningProgramClass.listClientMembers(classId);
    return res.json({ classId, clientMembers });
  } catch (e) {
    next(e);
  }
};

export const upsertClassProviderMembers = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    for (const m of members) {
      const providerUserId = asInt(m?.providerUserId);
      if (!providerUserId) continue;
      await LearningProgramClass.addProviderMember({
        classId,
        providerUserId,
        membershipStatus: String(m?.membershipStatus || 'active').toLowerCase(),
        roleLabel: m?.roleLabel ? String(m.roleLabel) : null,
        notes: m?.notes ? String(m.notes) : null,
        actorUserId: req.user.id
      });
    }
    const providerMembers = await LearningProgramClass.listProviderMembers(classId);
    return res.json({ classId, providerMembers });
  } catch (e) {
    next(e);
  }
};

export const listClassResources = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const allowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!allowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const resources = await LearningProgramClass.listResources(classId);
    return res.json({ classId, resources });
  } catch (e) {
    next(e);
  }
};

export const createClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    const resource = await LearningProgramClass.createResource({
      classId,
      resourceType: String(req.body?.resourceType || 'document').toLowerCase(),
      title,
      description: req.body?.description ? String(req.body.description) : null,
      filePath: req.body?.filePath ? String(req.body.filePath) : null,
      externalUrl: req.body?.externalUrl ? String(req.body.externalUrl) : null,
      sortOrder: asInt(req.body?.sortOrder) || 0,
      isPublished: asBool(req.body?.isPublished, true),
      visibleToClients: asBool(req.body?.visibleToClients, true),
      visibleToProviders: asBool(req.body?.visibleToProviders, true),
      metadataJson: req.body?.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ resource });
  } catch (e) {
    next(e);
  }
};

export const updateClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const resourceId = asInt(req.params.resourceId);
    if (!classId || !resourceId) return res.status(400).json({ error: { message: 'Invalid classId/resourceId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const patch = {
      resourceType: req.body?.resourceType !== undefined ? String(req.body.resourceType || '').toLowerCase() : undefined,
      title: req.body?.title !== undefined ? String(req.body.title || '').trim() : undefined,
      description: req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined,
      filePath: req.body?.filePath !== undefined ? (req.body.filePath ? String(req.body.filePath) : null) : undefined,
      externalUrl: req.body?.externalUrl !== undefined ? (req.body.externalUrl ? String(req.body.externalUrl) : null) : undefined,
      sortOrder: req.body?.sortOrder !== undefined ? (asInt(req.body.sortOrder) || 0) : undefined,
      isPublished: req.body?.isPublished !== undefined ? asBool(req.body.isPublished, true) : undefined,
      visibleToClients: req.body?.visibleToClients !== undefined ? asBool(req.body.visibleToClients, true) : undefined,
      visibleToProviders: req.body?.visibleToProviders !== undefined ? asBool(req.body.visibleToProviders, true) : undefined,
      metadataJson: req.body?.metadataJson !== undefined
        ? (req.body.metadataJson && typeof req.body.metadataJson === 'object' ? req.body.metadataJson : null)
        : undefined
    };
    const resource = await LearningProgramClass.updateResource(resourceId, patch);
    return res.json({ resource });
  } catch (e) {
    next(e);
  }
};

export const deleteClassResource = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const resourceId = asInt(req.params.resourceId);
    if (!classId || !resourceId) return res.status(400).json({ error: { message: 'Invalid classId/resourceId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required. Agency-level changes are restricted to super admin.' } });
    const orgAllowed = await canAccessOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!orgAllowed) return res.status(403).json({ error: { message: 'Access denied for this class' } });
    const ok = await LearningProgramClass.deleteResource(resourceId);
    if (!ok) return res.status(404).json({ error: { message: 'Resource not found' } });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const launchLearningProgramClass = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const status = String(klass.status || '').toLowerCase();
    if (status !== 'draft') return res.status(400).json({ error: { message: 'Only draft seasons can be launched' } });
    const [teams] = await pool.execute(`SELECT id FROM challenge_teams WHERE learning_class_id = ?`, [classId]);
    if (!teams?.length) return res.status(400).json({ error: { message: 'Add at least one team before launching' } });
    const [members] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId]
    );
    if (!members?.length) return res.status(400).json({ error: { message: 'Add at least one participant before launching' } });
    await LearningProgramClass.update(classId, { status: 'active' });
    const updated = await LearningProgramClass.findById(classId);
    return res.json({ class: updated, launched: true });
  } catch (e) {
    next(e);
  }
};

export const listParticipantProfiles = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    if (!classId) return res.status(400).json({ error: { message: 'Invalid classId' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const profiles = await ChallengeParticipantProfile.listByClass(classId);
    return res.json({ profiles });
  } catch (e) {
    next(e);
  }
};

export const upsertParticipantProfile = async (req, res, next) => {
  try {
    const classId = asInt(req.params.classId);
    const providerUserId = asInt(req.params.providerUserId ?? req.body.providerUserId ?? req.body.provider_user_id);
    if (!classId || !providerUserId) return res.status(400).json({ error: { message: 'classId and providerUserId required' } });
    const klass = await LearningProgramClass.findById(classId);
    if (!klass) return res.status(404).json({ error: { message: 'Class not found' } });
    const manageAllowed = await canManageAtOrganization({ user: req.user, organizationId: klass.organization_id });
    if (!manageAllowed) return res.status(403).json({ error: { message: 'Manage access required' } });
    const [member] = await pool.execute(
      `SELECT 1 FROM learning_class_provider_memberships WHERE learning_class_id = ? AND provider_user_id = ? AND membership_status IN ('active','completed') LIMIT 1`,
      [classId, providerUserId]
    );
    if (!member?.length) return res.status(400).json({ error: { message: 'User is not a participant in this season' } });
    const profile = await ChallengeParticipantProfile.upsert({
      learningClassId: classId,
      providerUserId,
      gender: req.body.gender || null,
      dateOfBirth: req.body.dateOfBirth ?? req.body.date_of_birth ?? null
    });
    return res.json(profile);
  } catch (e) {
    next(e);
  }
};

export const listMyLearningClasses = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const organizationId = asInt(req.query.organizationId);
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    let rows = [];
    const orgFilter = organizationId ? ' AND c.organization_id = ?' : '';
    const params = organizationId ? [userId, organizationId] : [userId];
    if (role === 'client_guardian') {
      const [qRows] = await pool.execute(
        `SELECT DISTINCT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         INNER JOIN learning_class_client_memberships m ON m.learning_class_id = c.id
         INNER JOIN client_guardians cg ON cg.client_id = m.client_id
         WHERE cg.guardian_user_id = ?
           AND (cg.access_enabled IS NULL OR cg.access_enabled = TRUE)
           AND m.membership_status IN ('active','completed')
           AND c.status <> 'archived'${orgFilter}
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC`,
        params
      );
      rows = qRows || [];
    } else {
      const [qRows] = await pool.execute(
        `SELECT DISTINCT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
         FROM learning_program_classes c
         INNER JOIN agencies a ON a.id = c.organization_id
         INNER JOIN learning_class_provider_memberships m ON m.learning_class_id = c.id
         WHERE m.provider_user_id = ?
           AND m.membership_status IN ('active','completed')
           AND c.status <> 'archived'${orgFilter}
         ORDER BY COALESCE(c.starts_at, c.created_at) DESC`,
        params
      );
      rows = qRows || [];
    }
    const classes = [];
    for (const row of rows) classes.push(await ensureClassLifecycleStatus(row));
    return res.json({ classes });
  } catch (e) {
    next(e);
  }
};
