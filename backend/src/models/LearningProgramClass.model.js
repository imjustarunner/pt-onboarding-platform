import pool from '../config/database.js';
import { toMysqlDateTimeOrNull } from '../utils/mysqlDateTime.utils.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const parseJsonMaybe = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeClass = (row) => {
  if (!row) return null;
  return {
    ...row,
    metadata_json: parseJsonMaybe(row.metadata_json),
    // Summit Stats Team Challenge config (Phase 1 extension)
    activity_types_json: parseJsonMaybe(row.activity_types_json),
    scoring_rules_json: parseJsonMaybe(row.scoring_rules_json),
    recognition_categories_json: parseJsonMaybe(row.recognition_categories_json),
    season_settings_json: parseJsonMaybe(row.season_settings_json),
    program_kind: row.program_kind || 'season'
  };
};

const normalizeResource = (row) => {
  if (!row) return null;
  return {
    ...row,
    metadata_json: parseJsonMaybe(row.metadata_json)
  };
};

class LearningProgramClass {
  static async findById(id) {
    const classId = toInt(id);
    if (!classId) return null;
    const [rows] = await pool.execute(
      `SELECT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
       FROM learning_program_classes c
       INNER JOIN agencies a ON a.id = c.organization_id
       WHERE c.id = ?
       LIMIT 1`,
      [classId]
    );
    return normalizeClass(rows?.[0] || null);
  }

  static async listByOrganization({ organizationId, includeArchived = false }) {
    const orgId = toInt(organizationId);
    if (!orgId) return [];
    const [rows] = await pool.execute(
      `SELECT c.*, a.name AS organization_name, a.slug AS organization_slug, a.organization_type
       FROM learning_program_classes c
       INNER JOIN agencies a ON a.id = c.organization_id
       WHERE c.organization_id = ?
         AND (? = TRUE OR c.status <> 'archived')
       ORDER BY COALESCE(c.starts_at, c.created_at) DESC, c.id DESC`,
      [orgId, includeArchived ? 1 : 0]
    );
    return (rows || []).map(normalizeClass);
  }

  static async create({
    organizationId,
    className,
    classCode = null,
    description = null,
    programKind = 'season',
    bookAuthor = null,
    bookCoverUrl = null,
    bookMonthLabel = null,
    timezone = 'America/New_York',
    startsAt = null,
    endsAt = null,
    enrollmentOpensAt = null,
    enrollmentClosesAt = null,
    status = 'draft',
    isActive = true,
    allowLateJoin = false,
    maxClients = null,
    metadataJson = null,
      activityTypesJson = null,
      scoringRulesJson = null,
      weeklyGoalMinimum = null,
      teamMinPointsPerWeek = null,
      individualMinPointsPerWeek = null,
      weekStartTime = null,
      mastersAgeThreshold = null,
      recognitionCategoriesJson = null,
      recognitionMetric = null,
      captainApplicationOpen = true,
      captainsFinalized = false,
      seasonSplashEnabled = true,
      seasonAnnouncementText = null,
      seasonSettingsJson = null,
      deliveryMode = 'group',
      registrationEligible = false,
      medicaidEligible = false,
      cashEligible = false,
      createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_program_classes
       (organization_id, class_name, class_code, program_kind, description, book_author, book_cover_url, book_month_label, timezone, starts_at, ends_at,
        enrollment_opens_at, enrollment_closes_at, status, is_active, allow_late_join, max_clients,
        metadata_json, activity_types_json, scoring_rules_json, weekly_goal_minimum,
        team_min_points_per_week, individual_min_points_per_week, week_start_time,
        masters_age_threshold, recognition_categories_json, recognition_metric,
        captain_application_open, captains_finalized, season_splash_enabled, season_announcement_text, season_settings_json,
        delivery_mode,
        registration_eligible, medicaid_eligible, cash_eligible, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizationId,
        className,
        classCode,
        String(programKind || 'season').trim().toLowerCase() === 'monthly_book' ? 'monthly_book' : 'season',
        description,
        bookAuthor ? String(bookAuthor).trim() : null,
        bookCoverUrl ? String(bookCoverUrl).trim() : null,
        bookMonthLabel ? String(bookMonthLabel).trim() : null,
        timezone,
        toMysqlDateTimeOrNull(startsAt),
        toMysqlDateTimeOrNull(endsAt),
        toMysqlDateTimeOrNull(enrollmentOpensAt),
        toMysqlDateTimeOrNull(enrollmentClosesAt),
        status,
        isActive ? 1 : 0,
        allowLateJoin ? 1 : 0,
        maxClients,
        metadataJson ? JSON.stringify(metadataJson) : null,
        activityTypesJson ? JSON.stringify(activityTypesJson) : null,
        scoringRulesJson ? JSON.stringify(scoringRulesJson) : null,
        weeklyGoalMinimum != null ? toInt(weeklyGoalMinimum) : null,
        teamMinPointsPerWeek != null ? toInt(teamMinPointsPerWeek) : null,
        individualMinPointsPerWeek != null ? toInt(individualMinPointsPerWeek) : null,
        weekStartTime || null,
        mastersAgeThreshold != null ? toInt(mastersAgeThreshold) : 53,
        recognitionCategoriesJson ? JSON.stringify(recognitionCategoriesJson) : null,
        recognitionMetric || 'points',
        captainApplicationOpen ? 1 : 0,
        captainsFinalized ? 1 : 0,
        seasonSplashEnabled ? 1 : 0,
        seasonAnnouncementText ? String(seasonAnnouncementText).trim() : null,
        seasonSettingsJson ? JSON.stringify(seasonSettingsJson) : null,
        String(deliveryMode || 'group').toLowerCase() === 'individual' ? 'individual' : 'group',
        registrationEligible ? 1 : 0,
        medicaidEligible ? 1 : 0,
        cashEligible ? 1 : 0,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(classId, patch = {}) {
    const id = toInt(classId);
    if (!id) return null;
    const mapping = {
      className: 'class_name',
      classCode: 'class_code',
      programKind: 'program_kind',
      description: 'description',
      bookAuthor: 'book_author',
      bookCoverUrl: 'book_cover_url',
      bookMonthLabel: 'book_month_label',
      timezone: 'timezone',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      enrollmentOpensAt: 'enrollment_opens_at',
      enrollmentClosesAt: 'enrollment_closes_at',
      status: 'status',
      isActive: 'is_active',
      allowLateJoin: 'allow_late_join',
      maxClients: 'max_clients',
      metadataJson: 'metadata_json',
      activityTypesJson: 'activity_types_json',
      scoringRulesJson: 'scoring_rules_json',
      weeklyGoalMinimum: 'weekly_goal_minimum',
      teamMinPointsPerWeek: 'team_min_points_per_week',
      individualMinPointsPerWeek: 'individual_min_points_per_week',
      weekStartTime: 'week_start_time',
      mastersAgeThreshold: 'masters_age_threshold',
      recognitionCategoriesJson: 'recognition_categories_json',
      recognitionMetric: 'recognition_metric',
      captainApplicationOpen: 'captain_application_open',
      captainsFinalized: 'captains_finalized',
      seasonSplashEnabled: 'season_splash_enabled',
      seasonAnnouncementText: 'season_announcement_text',
      seasonSettingsJson: 'season_settings_json',
      deliveryMode: 'delivery_mode',
      registrationEligible: 'registration_eligible',
      medicaidEligible: 'medicaid_eligible',
      cashEligible: 'cash_eligible'
    };
    const setParts = [];
    const values = [];
    for (const [k, col] of Object.entries(mapping)) {
      if (patch[k] === undefined) continue;
      if (k === 'isActive' || k === 'allowLateJoin' || k === 'registrationEligible' || k === 'medicaidEligible' || k === 'cashEligible' || k === 'captainApplicationOpen' || k === 'captainsFinalized' || k === 'seasonSplashEnabled') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? 1 : 0);
        continue;
      }
      if (k === 'metadataJson' || k === 'activityTypesJson' || k === 'scoringRulesJson' || k === 'seasonSettingsJson') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? JSON.stringify(patch[k]) : null);
        continue;
      }
      if (k === 'weeklyGoalMinimum' || k === 'teamMinPointsPerWeek' || k === 'individualMinPointsPerWeek') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] != null ? toInt(patch[k]) : null);
        continue;
      }
      if (k === 'weekStartTime' || k === 'recognitionMetric') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] || null);
        continue;
      }
      if (k === 'mastersAgeThreshold') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] != null ? toInt(patch[k]) : null);
        continue;
      }
      if (k === 'recognitionCategoriesJson') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? JSON.stringify(patch[k]) : null);
        continue;
      }
      if (k === 'startsAt' || k === 'endsAt' || k === 'enrollmentOpensAt' || k === 'enrollmentClosesAt') {
        setParts.push(`${col} = ?`);
        values.push(toMysqlDateTimeOrNull(patch[k]));
        continue;
      }
      setParts.push(`${col} = ?`);
      values.push(patch[k]);
    }
    if (!setParts.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE learning_program_classes SET ${setParts.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async addClientMember({ classId, clientId, membershipStatus = 'active', roleLabel = null, notes = null, actorUserId = null }) {
    await pool.execute(
      `INSERT INTO learning_class_client_memberships
       (learning_class_id, client_id, membership_status, joined_at, role_label, notes, created_by_user_id)
       VALUES (?, ?, ?, CASE WHEN ? = 'active' THEN NOW() ELSE NULL END, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         membership_status = VALUES(membership_status),
         role_label = VALUES(role_label),
         notes = VALUES(notes),
         removed_at = CASE WHEN VALUES(membership_status) IN ('removed') THEN NOW() ELSE NULL END`,
      [classId, clientId, membershipStatus, membershipStatus, roleLabel, notes, actorUserId]
    );
  }

  static async addProviderMember({ classId, providerUserId, membershipStatus = 'active', roleLabel = null, notes = null, actorUserId = null }) {
    await pool.execute(
      `INSERT INTO learning_class_provider_memberships
       (learning_class_id, provider_user_id, membership_status, joined_at, role_label, notes, created_by_user_id)
       VALUES (?, ?, ?, CASE WHEN ? = 'active' THEN NOW() ELSE NULL END, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         membership_status = VALUES(membership_status),
         role_label = VALUES(role_label),
         notes = VALUES(notes),
         removed_at = CASE WHEN VALUES(membership_status) IN ('removed') THEN NOW() ELSE NULL END`,
      [classId, providerUserId, membershipStatus, membershipStatus, roleLabel, notes, actorUserId]
    );

    // Best-effort: if this season is in a club that already has a club-wide
    // chat thread, attach the new provider so they see it in /messages.
    if (String(membershipStatus).toLowerCase() === 'active') {
      try {
        const [rows] = await pool.execute(
          `SELECT organization_id AS club_id
             FROM learning_program_classes
            WHERE id = ? LIMIT 1`,
          [classId]
        );
        const clubId = rows?.[0]?.club_id ? Number(rows[0].club_id) : null;
        if (clubId) {
          const { ensureUserInClubThread } = await import('../controllers/chat.controller.js');
          await ensureUserInClubThread({ clubId, userId: providerUserId });
        }
      } catch {
        // best-effort
      }
    }
  }

  static async listClientMembers(classId) {
    const id = toInt(classId);
    if (!id) return [];
    const [rows] = await pool.execute(
      `SELECT m.*, c.full_name AS client_name, c.initials AS client_initials
       FROM learning_class_client_memberships m
       INNER JOIN clients c ON c.id = m.client_id
       WHERE m.learning_class_id = ?
       ORDER BY c.full_name ASC, c.initials ASC, c.id ASC`,
      [id]
    );
    return rows || [];
  }

  static async listProviderMembers(classId) {
    const id = toInt(classId);
    if (!id) return [];
    const [rows] = await pool.execute(
      `SELECT m.*, u.first_name, u.last_name, u.email
       FROM learning_class_provider_memberships m
       INNER JOIN users u ON u.id = m.provider_user_id
       WHERE m.learning_class_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`,
      [id]
    );
    return rows || [];
  }

  static async listResources(classId) {
    const id = toInt(classId);
    if (!id) return [];
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_class_resources
       WHERE learning_class_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [id]
    );
    return (rows || []).map(normalizeResource);
  }

  static async createResource({
    classId,
    resourceType = 'document',
    title,
    description = null,
    filePath = null,
    externalUrl = null,
    sortOrder = 0,
    isPublished = true,
    visibleToClients = true,
    visibleToProviders = true,
    metadataJson = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_class_resources
       (learning_class_id, resource_type, title, description, file_path, external_url, sort_order,
        is_published, visible_to_clients, visible_to_providers, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        classId,
        resourceType,
        title,
        description,
        filePath,
        externalUrl,
        sortOrder,
        isPublished ? 1 : 0,
        visibleToClients ? 1 : 0,
        visibleToProviders ? 1 : 0,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM learning_class_resources WHERE id = ? LIMIT 1`, [result.insertId]);
    return normalizeResource(rows?.[0] || null);
  }

  static async updateResource(resourceId, patch = {}) {
    const id = toInt(resourceId);
    if (!id) return null;
    const mapping = {
      resourceType: 'resource_type',
      title: 'title',
      description: 'description',
      filePath: 'file_path',
      externalUrl: 'external_url',
      sortOrder: 'sort_order',
      isPublished: 'is_published',
      visibleToClients: 'visible_to_clients',
      visibleToProviders: 'visible_to_providers',
      metadataJson: 'metadata_json'
    };
    const setParts = [];
    const values = [];
    for (const [k, col] of Object.entries(mapping)) {
      if (patch[k] === undefined) continue;
      if (k === 'isPublished' || k === 'visibleToClients' || k === 'visibleToProviders') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? 1 : 0);
        continue;
      }
      if (k === 'metadataJson') {
        setParts.push(`${col} = ?`);
        values.push(patch[k] ? JSON.stringify(patch[k]) : null);
        continue;
      }
      setParts.push(`${col} = ?`);
      values.push(patch[k]);
    }
    if (!setParts.length) {
      const [rows] = await pool.execute(`SELECT * FROM learning_class_resources WHERE id = ? LIMIT 1`, [id]);
      return normalizeResource(rows?.[0] || null);
    }
    values.push(id);
    await pool.execute(`UPDATE learning_class_resources SET ${setParts.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute(`SELECT * FROM learning_class_resources WHERE id = ? LIMIT 1`, [id]);
    return normalizeResource(rows?.[0] || null);
  }

  static async deleteResource(resourceId) {
    const id = toInt(resourceId);
    if (!id) return false;
    const [result] = await pool.execute(`DELETE FROM learning_class_resources WHERE id = ?`, [id]);
    return Number(result?.affectedRows || 0) > 0;
  }
}

export default LearningProgramClass;
