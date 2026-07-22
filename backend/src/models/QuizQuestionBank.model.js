import pool from '../config/database.js';

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapBank(row) {
  if (!row) return null;
  return {
    id: row.id,
    agencyId: row.agency_id,
    title: row.title,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    questionCount: row.question_count != null ? Number(row.question_count) : undefined
  };
}

function mapQuestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    bankId: row.bank_id,
    questionText: row.question_text,
    questionType: row.question_type,
    options: parseJson(row.options_json, []),
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    remediationHtml: row.remediation_html,
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class QuizQuestionBank {
  static async findAll({ agencyId = null } = {}) {
    const params = [];
    let sql = `
      SELECT b.*,
        (SELECT COUNT(*) FROM quiz_bank_questions q WHERE q.bank_id = b.id) AS question_count
      FROM quiz_question_banks b`;
    if (agencyId != null && agencyId !== '' && agencyId !== 'null') {
      sql += ' WHERE (b.agency_id IS NULL OR b.agency_id = ?)';
      params.push(Number(agencyId));
    }
    sql += ' ORDER BY b.updated_at DESC, b.title ASC';
    const [rows] = await pool.execute(sql, params);
    return rows.map(mapBank);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_question_banks WHERE id = ? LIMIT 1',
      [id]
    );
    return mapBank(rows[0]);
  }

  static async create({ agencyId = null, title, description = null, createdByUserId = null }) {
    const [result] = await pool.execute(
      `INSERT INTO quiz_question_banks (agency_id, title, description, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [agencyId || null, title, description, createdByUserId || null]
    );
    return this.findById(result.insertId);
  }

  static async update(id, { title, description, agencyId }) {
    const updates = [];
    const values = [];
    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (agencyId !== undefined) {
      updates.push('agency_id = ?');
      values.push(agencyId || null);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE quiz_question_banks SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM quiz_question_banks WHERE id = ?',
      [id]
    );
    return result.affectedRows > 0;
  }

  static async listQuestions(bankId) {
    const [rows] = await pool.execute(
      `SELECT * FROM quiz_bank_questions
       WHERE bank_id = ?
       ORDER BY order_index ASC, id ASC`,
      [bankId]
    );
    return rows.map(mapQuestion);
  }

  static async findQuestionById(questionId) {
    const [rows] = await pool.execute(
      'SELECT * FROM quiz_bank_questions WHERE id = ? LIMIT 1',
      [questionId]
    );
    return mapQuestion(rows[0]);
  }

  static async addQuestion(bankId, data) {
    const [countRows] = await pool.execute(
      'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM quiz_bank_questions WHERE bank_id = ?',
      [bankId]
    );
    const orderIndex = data.orderIndex != null ? data.orderIndex : Number(countRows[0]?.next_order || 0);
    const [result] = await pool.execute(
      `INSERT INTO quiz_bank_questions
        (bank_id, question_text, question_type, options_json, correct_answer, explanation, remediation_html, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        bankId,
        data.questionText,
        data.questionType || 'multiple_choice',
        data.options != null ? JSON.stringify(data.options) : null,
        data.correctAnswer ?? null,
        data.explanation ?? null,
        data.remediationHtml ?? null,
        orderIndex
      ]
    );
    return this.findQuestionById(result.insertId);
  }

  static async updateQuestion(questionId, data) {
    const updates = [];
    const values = [];
    const fields = {
      questionText: 'question_text',
      questionType: 'question_type',
      correctAnswer: 'correct_answer',
      explanation: 'explanation',
      remediationHtml: 'remediation_html',
      orderIndex: 'order_index'
    };
    for (const [key, col] of Object.entries(fields)) {
      if (data[key] !== undefined) {
        updates.push(`${col} = ?`);
        values.push(data[key]);
      }
    }
    if (data.options !== undefined) {
      updates.push('options_json = ?');
      values.push(data.options != null ? JSON.stringify(data.options) : null);
    }
    if (!updates.length) return this.findQuestionById(questionId);
    values.push(questionId);
    await pool.execute(
      `UPDATE quiz_bank_questions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findQuestionById(questionId);
  }

  static async deleteQuestion(questionId) {
    const [result] = await pool.execute(
      'DELETE FROM quiz_bank_questions WHERE id = ?',
      [questionId]
    );
    return result.affectedRows > 0;
  }

  /** Convert bank questions into quiz content_data question shape */
  static toQuizQuestions(bankQuestions) {
    return (bankQuestions || []).map((q) => ({
      question: q.questionText,
      type: q.questionType,
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      remediationHtml: q.remediationHtml || ''
    }));
  }
}

export default QuizQuestionBank;
