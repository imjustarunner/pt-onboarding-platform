import pool from '../config/database.js';

const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
export default class NarrivaGeneratorSettings {
  static async get(db = pool) {
    try {
      const [[row]] = await db.execute('SELECT version,configuration_json,updated_at,updated_by_user_id FROM narriva_generator_settings WHERE id=1');
      return { version: Number(row?.version) || 0, configuration: parse(row?.configuration_json), updatedAt: row?.updated_at || null, schemaReady: true };
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return { version: 0, configuration: {}, updatedAt: null, schemaReady: false };
      throw error;
    }
  }
  static async save({ configuration, expectedVersion, reason, actorUserId }) {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      const [result] = await db.execute('UPDATE narriva_generator_settings SET version=version+1,configuration_json=?,updated_by_user_id=? WHERE id=1 AND version=?', [JSON.stringify(configuration), actorUserId, expectedVersion]);
      if (!result.affectedRows) throw Object.assign(new Error('Narriva settings changed. Refresh before saving your changes.'), { status: 409 });
      await db.execute('INSERT INTO narriva_generator_settings_versions (version,configuration_json,change_reason,actor_user_id) VALUES (?,?,?,?)', [expectedVersion + 1, JSON.stringify(configuration), reason, actorUserId]);
      await db.commit();
      return await this.get();
    } catch (error) {
      await db.rollback();
      if (error.code === 'ER_NO_SUCH_TABLE') throw Object.assign(new Error('Apply migration 1847 before saving Narriva platform settings.'), { status: 409 });
      throw error;
    } finally { db.release(); }
  }
  static async feedback({ toolId, settingsVersion, feedback, actorUserId }) {
    try {
      const [result] = await pool.execute('INSERT INTO narriva_generator_feedback (tool_id,settings_version,feedback_text,created_by_user_id) VALUES (?,?,?,?)', [toolId, settingsVersion, feedback, actorUserId]);
      return { id: result.insertId };
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') throw Object.assign(new Error('Apply migration 1847 before saving feedback.'), { status: 409 });
      throw error;
    }
  }
  static async history() {
    try {
      const [versions] = await pool.execute('SELECT version,change_reason,actor_user_id,created_at FROM narriva_generator_settings_versions ORDER BY version DESC LIMIT 20');
      const [feedback] = await pool.execute('SELECT id,tool_id,settings_version,feedback_text,created_by_user_id,created_at FROM narriva_generator_feedback ORDER BY id DESC LIMIT 50');
      return { versions, feedback };
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return { versions: [], feedback: [] };
      throw error;
    }
  }
}
