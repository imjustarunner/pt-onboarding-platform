import pool from '../config/database.js';

const parseJson = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

class TutoringAiArtifact {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      input_ref_json: parseJson(row.input_ref_json, {}),
      retrieved_sources_json: parseJson(row.retrieved_sources_json, []),
      draft_content_json: parseJson(row.draft_content_json, {})
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId = null,
      studentSubjectId = null,
      artifactType,
      modelName = 'rules-v1',
      promptVersion = '1',
      inputRef = {},
      retrievedSources = [],
      draftContent = {},
      draftText = null,
      status = 'draft'
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO tutoring_ai_artifacts
       (agency_id, client_id, student_subject_id, artifact_type, model_name, prompt_version,
        input_ref_json, retrieved_sources_json, draft_content_json, draft_text, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        artifactType,
        modelName,
        promptVersion,
        JSON.stringify(inputRef || {}),
        JSON.stringify(retrievedSources || []),
        JSON.stringify(draftContent || {}),
        draftText,
        status,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_ai_artifacts WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async approve(id, actorUserId) {
    await pool.execute(
      `UPDATE tutoring_ai_artifacts
       SET status = 'approved', approved_at = NOW(), approved_by_user_id = ?
       WHERE id = ?`,
      [actorUserId || null, id]
    );
    return this.findById(id);
  }

  static async reject(id, actorUserId) {
    await pool.execute(
      `UPDATE tutoring_ai_artifacts SET status = 'rejected', approved_by_user_id = ? WHERE id = ?`,
      [actorUserId || null, id]
    );
    return this.findById(id);
  }
}

class TutoringEvaluationItem {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      choices_json: parseJson(row.choices_json, []),
      correct_answer_json: parseJson(row.correct_answer_json, {}),
      rubric_json: parseJson(row.rubric_json, {}),
      misconception_tags_json: parseJson(row.misconception_tags_json, []),
      metadata_json: parseJson(row.metadata_json, {})
    };
  }

  static async list({ subjectKey = null, gradeBand = null, agencyId = null, status = 'active' } = {}) {
    const clauses = ['status = ?'];
    const params = [status];
    if (subjectKey) {
      clauses.push('subject_key = ?');
      params.push(subjectKey);
    }
    if (gradeBand) {
      clauses.push('(grade_band IS NULL OR grade_band = ?)');
      params.push(gradeBand);
    }
    if (agencyId) {
      clauses.push('(agency_id IS NULL OR agency_id = ?)');
      params.push(agencyId);
    } else {
      clauses.push('agency_id IS NULL');
    }
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_evaluation_items WHERE ${clauses.join(' AND ')} ORDER BY difficulty ASC, id ASC`,
      params
    );
    return rows.map((r) => this.normalize(r));
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_evaluation_items WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }
}

class TutoringEvaluationResponse {
  static async createMany(evaluationSummaryId, responses = []) {
    const out = [];
    for (let i = 0; i < responses.length; i += 1) {
      const r = responses[i];
      const [result] = await pool.execute(
        `INSERT INTO tutoring_evaluation_responses
         (evaluation_summary_id, item_id, prompt_snapshot, response_json, score_value, rating,
          misconception_tags_json, tutor_verified, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          evaluationSummaryId,
          r.itemId || null,
          r.promptSnapshot || null,
          JSON.stringify(r.response || {}),
          r.scoreValue ?? null,
          r.rating || null,
          JSON.stringify(r.misconceptionTags || []),
          r.tutorVerified ? 1 : 0,
          r.sortOrder ?? i
        ]
      );
      out.push(result.insertId);
    }
    return out;
  }

  static async listByEvaluation(evaluationSummaryId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_evaluation_responses WHERE evaluation_summary_id = ? ORDER BY sort_order ASC, id ASC`,
      [evaluationSummaryId]
    );
    return rows.map((row) => ({
      ...row,
      response_json: parseJson(row.response_json, {}),
      misconception_tags_json: parseJson(row.misconception_tags_json, [])
    }));
  }
}

class TutoringProgressAlert {
  static async create(payload) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      alertType,
      severity = 'medium',
      title,
      detail = null,
      relatedGoalId = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO tutoring_progress_alerts
       (agency_id, client_id, student_subject_id, alert_type, severity, title, detail, related_goal_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, clientId, studentSubjectId, alertType, severity, title, detail, relatedGoalId]
    );
    const [rows] = await pool.execute(`SELECT * FROM tutoring_progress_alerts WHERE id = ?`, [result.insertId]);
    return rows[0] || null;
  }

  static async listOpenBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_progress_alerts WHERE student_subject_id = ? AND status = 'open' ORDER BY created_at DESC`,
      [studentSubjectId]
    );
    return rows;
  }

  static async acknowledge(id, actorUserId) {
    await pool.execute(
      `UPDATE tutoring_progress_alerts
       SET status = 'acknowledged', acknowledged_by_user_id = ?, acknowledged_at = NOW()
       WHERE id = ?`,
      [actorUserId || null, id]
    );
  }
}

class TutoringProgressReport {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      content_json: parseJson(row.content_json, {}),
      shared_with_json: parseJson(row.shared_with_json, [])
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      learningPlanId = null,
      reportType,
      title,
      periodStart = null,
      periodEnd = null,
      content = {},
      contentHtml = null,
      status = 'draft',
      sessionNoteId = null,
      aiArtifactId = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO tutoring_progress_reports
       (agency_id, client_id, student_subject_id, learning_plan_id, report_type, title,
        period_start, period_end, content_json, content_html, status, session_note_id,
        ai_artifact_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        learningPlanId,
        reportType,
        title,
        periodStart,
        periodEnd,
        JSON.stringify(content || {}),
        contentHtml,
        status,
        sessionNoteId,
        aiArtifactId,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_progress_reports WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async listBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_progress_reports WHERE student_subject_id = ? ORDER BY created_at DESC`,
      [studentSubjectId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async publish(id, actorUserId) {
    await pool.execute(
      `UPDATE tutoring_progress_reports
       SET status = 'published', published_at = NOW(), published_by_user_id = ?
       WHERE id = ?`,
      [actorUserId || null, id]
    );
    return this.findById(id);
  }
}

class TutoringCasStandard {
  static async search({ subjectKey = null, gradeBand = null, q = null, versionKey = null } = {}) {
    const clauses = [`status = 'active'`];
    const params = [];
    if (subjectKey) {
      clauses.push('subject_key = ?');
      params.push(subjectKey);
    }
    if (gradeBand) {
      clauses.push('(grade_band IS NULL OR grade_band = ?)');
      params.push(gradeBand);
    }
    if (versionKey) {
      clauses.push('version_key = ?');
      params.push(versionKey);
    }
    if (q) {
      clauses.push('(standard_code LIKE ? OR title LIKE ? OR description LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_cas_standards WHERE ${clauses.join(' AND ')} ORDER BY standard_code ASC LIMIT 200`,
      params
    );
    return rows.map((row) => ({
      ...row,
      evidence_outcomes_json: parseJson(row.evidence_outcomes_json, [])
    }));
  }
}

class TutoringPackageMilestone {
  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      subscriptionId = null,
      milestoneType,
      dueAfterSessionCount = null,
      dueOn = null,
      notes = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO tutoring_package_milestones
       (agency_id, client_id, student_subject_id, subscription_id, milestone_type,
        due_after_session_count, due_on, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        subscriptionId,
        milestoneType,
        dueAfterSessionCount,
        dueOn,
        notes,
        actorUserId || null
      ]
    );
    const [rows] = await pool.execute(`SELECT * FROM tutoring_package_milestones WHERE id = ?`, [result.insertId]);
    return rows[0] || null;
  }

  static async listBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_package_milestones WHERE student_subject_id = ? ORDER BY id ASC`,
      [studentSubjectId]
    );
    return rows;
  }

  static async complete(id, sessionId = null) {
    await pool.execute(
      `UPDATE tutoring_package_milestones
       SET status = 'completed', session_id = COALESCE(?, session_id), completed_at = NOW()
       WHERE id = ?`,
      [sessionId, id]
    );
  }
}

class TutoringOralReadingProbe {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      errors_json: parseJson(row.errors_json, []),
      stt_draft_scores_json: parseJson(row.stt_draft_scores_json, {})
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      evaluationSummaryId = null,
      sessionId = null,
      passageTitle = null,
      passageText = null,
      wordsCorrect = null,
      wordsTotal = null,
      errors = [],
      wpm = null,
      accuracyPct = null,
      sttTranscript = null,
      sttDraftScores = {},
      notes = null
    } = payload;

    const [result] = await pool.execute(
      `INSERT INTO tutoring_oral_reading_probes
       (agency_id, client_id, student_subject_id, evaluation_summary_id, session_id, passage_title,
        passage_text, words_correct, words_total, errors_json, wpm, accuracy_pct, stt_transcript,
        stt_draft_scores_json, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        evaluationSummaryId,
        sessionId,
        passageTitle,
        passageText,
        wordsCorrect,
        wordsTotal,
        JSON.stringify(errors || []),
        wpm,
        accuracyPct,
        sttTranscript,
        JSON.stringify(sttDraftScores || {}),
        notes,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_oral_reading_probes WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async verify(id, actorUserId, overrides = {}) {
    const updates = ['tutor_verified = 1', 'tutor_verified_by_user_id = ?', 'tutor_verified_at = NOW()'];
    const values = [actorUserId || null];
    if (overrides.wordsCorrect != null) {
      updates.push('words_correct = ?');
      values.push(overrides.wordsCorrect);
    }
    if (overrides.wordsTotal != null) {
      updates.push('words_total = ?');
      values.push(overrides.wordsTotal);
    }
    if (overrides.wpm != null) {
      updates.push('wpm = ?');
      values.push(overrides.wpm);
    }
    if (overrides.accuracyPct != null) {
      updates.push('accuracy_pct = ?');
      values.push(overrides.accuracyPct);
    }
    values.push(id);
    await pool.execute(`UPDATE tutoring_oral_reading_probes SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

class TutoringDocumentExtraction {
  static normalize(row) {
    if (!row) return null;
    return { ...row, extracted_json: parseJson(row.extracted_json, {}) };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId = null,
      sourceLabel = 'other',
      sourceDocumentId = null,
      rawTextExcerpt = null,
      extracted = {},
      aiArtifactId = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO tutoring_document_extractions
       (agency_id, client_id, student_subject_id, source_label, source_document_id,
        raw_text_excerpt, extracted_json, ai_artifact_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        sourceLabel,
        sourceDocumentId,
        rawTextExcerpt,
        JSON.stringify(extracted || {}),
        aiArtifactId,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_document_extractions WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async confirm(id, actorUserId, extracted = null) {
    if (extracted) {
      await pool.execute(
        `UPDATE tutoring_document_extractions
         SET status = 'confirmed', confirmed_by_user_id = ?, confirmed_at = NOW(), extracted_json = ?
         WHERE id = ?`,
        [actorUserId || null, JSON.stringify(extracted), id]
      );
    } else {
      await pool.execute(
        `UPDATE tutoring_document_extractions
         SET status = 'confirmed', confirmed_by_user_id = ?, confirmed_at = NOW()
         WHERE id = ?`,
        [actorUserId || null, id]
      );
    }
    return this.findById(id);
  }
}

class TutoringPracticeAssignment {
  static normalize(row) {
    if (!row) return null;
    const practiceItems = parseJson(row.practice_items_json, []);
    return { ...row, practice_items_json: practiceItems, practiceItems };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      clientId,
      studentSubjectId,
      learningPlanId = null,
      planGoalId = null,
      sessionId = null,
      sessionNoteId = null,
      title,
      instructions = null,
      practiceItems = [],
      status = 'assigned',
      dueAt = null,
      aiArtifactId = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO tutoring_practice_assignments
       (agency_id, client_id, student_subject_id, learning_plan_id, plan_goal_id, session_id,
        session_note_id, title, instructions, practice_items_json, status, due_at, ai_artifact_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        studentSubjectId,
        learningPlanId,
        planGoalId,
        sessionId,
        sessionNoteId,
        title,
        instructions,
        JSON.stringify(practiceItems || []),
        status,
        dueAt,
        aiArtifactId,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_practice_assignments WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async listByClient(clientId, { status = null, limit = 30 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const params = [clientId];
    let sql = `SELECT * FROM tutoring_practice_assignments WHERE client_id = ?`;
    if (status) {
      sql += ` AND status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC LIMIT ${lim}`;
    const [rows] = await pool.execute(sql, params);
    return rows.map((r) => this.normalize(r));
  }

  static async listBySubject(studentSubjectId) {
    const [rows] = await pool.execute(
      `SELECT * FROM tutoring_practice_assignments WHERE student_subject_id = ? ORDER BY created_at DESC`,
      [studentSubjectId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async complete(id) {
    await pool.execute(
      `UPDATE tutoring_practice_assignments SET status = 'completed', completed_at = NOW() WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }
}

class TutoringAssessmentBlueprint {
  static normalize(row) {
    if (!row) return null;
    return {
      ...row,
      skill_keys_json: parseJson(row.skill_keys_json, []),
      item_types_json: parseJson(row.item_types_json, []),
      selected_item_ids_json: parseJson(row.selected_item_ids_json, [])
    };
  }

  static async create(payload, actorUserId) {
    const {
      agencyId,
      studentSubjectId = null,
      title,
      subjectKey,
      gradeBand = null,
      evaluationPath = 'quick',
      skillKeys = [],
      itemTypes = [],
      itemCount = 5,
      difficultyMax = null,
      selectedItemIds = [],
      status = 'draft'
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO tutoring_assessment_blueprints
       (agency_id, student_subject_id, title, subject_key, grade_band, evaluation_path,
        skill_keys_json, item_types_json, item_count, difficulty_max, selected_item_ids_json,
        status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        studentSubjectId,
        title,
        subjectKey,
        gradeBand,
        evaluationPath,
        JSON.stringify(skillKeys || []),
        JSON.stringify(itemTypes || []),
        itemCount,
        difficultyMax,
        JSON.stringify(selectedItemIds || []),
        status,
        actorUserId || null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM tutoring_assessment_blueprints WHERE id = ? LIMIT 1`, [id]);
    return this.normalize(rows[0] || null);
  }

  static async update(id, payload) {
    const map = {
      title: 'title',
      gradeBand: 'grade_band',
      evaluationPath: 'evaluation_path',
      itemCount: 'item_count',
      difficultyMax: 'difficulty_max',
      status: 'status',
      studentSubjectId: 'student_subject_id'
    };
    const updates = [];
    const values = [];
    Object.keys(map).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${map[key]} = ?`);
        values.push(payload[key]);
      }
    });
    for (const [key, col] of [
      ['skillKeys', 'skill_keys_json'],
      ['itemTypes', 'item_types_json'],
      ['selectedItemIds', 'selected_item_ids_json']
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        updates.push(`${col} = ?`);
        values.push(JSON.stringify(payload[key] || []));
      }
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE tutoring_assessment_blueprints SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export {
  TutoringAiArtifact,
  TutoringEvaluationItem,
  TutoringEvaluationResponse,
  TutoringProgressAlert,
  TutoringProgressReport,
  TutoringCasStandard,
  TutoringPackageMilestone,
  TutoringOralReadingProbe,
  TutoringDocumentExtraction,
  TutoringPracticeAssignment,
  TutoringAssessmentBlueprint
};
