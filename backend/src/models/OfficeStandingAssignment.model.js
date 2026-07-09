import pool from '../config/database.js';

class OfficeStandingAssignment {
  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM office_standing_assignments WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async create({
    officeLocationId,
    roomId,
    providerId,
    weekday,
    hour,
    assignedFrequency = 'WEEKLY',
    recurrenceGroupId = null,
    createdByUserId
  }) {
    // Same provider already holding this physical slot (any frequency): reuse that
    // row. Approving Grace's BIWEEKLY intake while she already has WEEKLY on the
    // same Fri 2pm must update frequency, not hit the active-slot unique key.
    const [ownActiveRows] = await pool.execute(
      `SELECT id FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND provider_id = ?
         AND weekday = ?
         AND hour = ?
         AND is_active = TRUE
       ORDER BY id DESC
       LIMIT 1`,
      [officeLocationId, roomId, providerId, weekday, hour]
    );
    if (ownActiveRows?.[0]?.id) {
      return this.reactivateOwnSlotRow({
        existingId: ownActiveRows[0].id,
        officeLocationId,
        assignedFrequency,
        recurrenceGroupId,
        createdByUserId
      });
    }

    const activeConflicts = await this.findActiveConflictsBySlot({
      officeLocationId,
      roomId,
      weekday,
      hour
    });
    if (activeConflicts.length) throw this.conflictError(activeConflicts[0]);

    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO office_standing_assignments
          (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, recurrence_group_id, availability_mode, available_since_date, last_two_week_confirmed_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NOW(), ?)`,
        [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, recurrenceGroupId, createdByUserId]
      );
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
        // Two unique keys can fire here:
        // 1) same provider+frequency historical row (often inactive)
        // 2) active physical slot key (office/room/weekday/hour) held by anyone
        const resolved = await this.resolveDuplicateSlotInsert({
          officeLocationId,
          roomId,
          providerId,
          weekday,
          hour,
          assignedFrequency,
          recurrenceGroupId,
          createdByUserId,
          originalError: e
        });
        if (resolved) return resolved;
        throw this.conflictError(null);
      }
      // Backward compatible with environments before migration 382.
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      try {
        [result] = await pool.execute(
          `INSERT INTO office_standing_assignments
            (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, availability_mode, available_since_date, last_two_week_confirmed_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NOW(), ?)`,
          [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, createdByUserId]
        );
      } catch (insErr) {
        if (insErr?.code === 'ER_DUP_ENTRY' || insErr?.errno === 1062) {
          const resolved = await this.resolveDuplicateSlotInsert({
            officeLocationId,
            roomId,
            providerId,
            weekday,
            hour,
            assignedFrequency,
            recurrenceGroupId: null,
            createdByUserId,
            originalError: insErr
          });
          if (resolved) return resolved;
          throw this.conflictError(null);
        }
        throw insErr;
      }
      return this.findById(result.insertId);
    }
  }

  /**
   * Reactivate / realign an existing standing row for the same provider.
   * If flipping is_active=TRUE collides with the active physical-slot unique key,
   * clear the orphan blocker (or reuse the same-provider active row) instead of
   * surfacing a raw MySQL Duplicate entry error.
   */
  static async reactivateOwnSlotRow({
    existingId,
    officeLocationId,
    assignedFrequency,
    recurrenceGroupId = null,
    createdByUserId
  }) {
    const apply = async () => {
      await pool.execute(
        `UPDATE office_standing_assignments
         SET is_active                  = TRUE,
             office_location_id         = ?,
             assigned_frequency         = ?,
             recurrence_group_id        = COALESCE(?, recurrence_group_id),
             availability_mode          = 'AVAILABLE',
             temporary_until_date       = NULL,
             temporary_extension_count  = 0,
             available_since_date       = CURDATE(),
             last_two_week_confirmed_at = NOW(),
             last_forfeit_warning_at    = NULL,
             created_by_user_id         = ?,
             updated_at                 = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [officeLocationId, assignedFrequency, recurrenceGroupId, createdByUserId, existingId]
      );
      return this.findById(existingId);
    };

    try {
      return await apply();
    } catch (e) {
      if (e?.code !== 'ER_DUP_ENTRY' && e?.errno !== 1062) throw e;

      const existing = await this.findById(existingId);
      if (!existing) throw e;

      const [blockers] = await pool.execute(
        `SELECT id, provider_id
         FROM office_standing_assignments
         WHERE office_location_id = ?
           AND room_id = ?
           AND weekday = ?
           AND hour = ?
           AND is_active = TRUE
           AND id <> ?
         ORDER BY id ASC`,
        [existing.office_location_id, existing.room_id, existing.weekday, existing.hour, existingId]
      );

      for (const blocker of blockers || []) {
        if (Number(blocker.provider_id) === Number(existing.provider_id)) {
          // Same provider already active on another row at this slot — prefer that row.
          await pool.execute(
            `UPDATE office_standing_assignments
             SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [existingId]
          );
          return this.reactivateOwnSlotRow({
            existingId: blocker.id,
            officeLocationId,
            assignedFrequency,
            recurrenceGroupId,
            createdByUserId
          });
        }

        const [liveRows] = await pool.execute(
          `SELECT 1
           FROM office_events
           WHERE room_id = ?
             AND start_at >= NOW()
             AND HOUR(start_at) = ?
             AND DAYOFWEEK(start_at) = ?
             AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
             AND (
               standing_assignment_id = ?
               OR booked_provider_id = ?
               OR assigned_provider_id = ?
             )
           LIMIT 1`,
          [
            existing.room_id,
            existing.hour,
            Number(existing.weekday) + 1,
            blocker.id,
            blocker.provider_id,
            blocker.provider_id
          ]
        );
        if ((liveRows || []).length) {
          const conflicts = await this.findActiveConflictsBySlot({
            officeLocationId: existing.office_location_id,
            roomId: existing.room_id,
            weekday: existing.weekday,
            hour: existing.hour,
            excludeAssignmentId: existingId
          });
          throw this.conflictError(conflicts[0] || blocker);
        }

        await pool.execute(
          `UPDATE office_standing_assignments
           SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [blocker.id]
        );
      }

      try {
        return await apply();
      } catch (retryErr) {
        if (retryErr?.code === 'ER_DUP_ENTRY' || retryErr?.errno === 1062) {
          throw this.conflictError(null);
        }
        throw retryErr;
      }
    }
  }

  /**
   * Handle ER_DUP_ENTRY on standing-assignment insert.
   * Prefer reactivating the same provider's historical row; otherwise take over an
   * orphaned active physical slot (no live future events) so approvals don't fail
   * with a raw unique-key error while the grid looks empty.
   */
  static async resolveDuplicateSlotInsert({
    officeLocationId,
    roomId,
    providerId,
    weekday,
    hour,
    assignedFrequency,
    recurrenceGroupId = null,
    createdByUserId,
    originalError = null
  }) {
    const reactivateOwn = (existingId) => this.reactivateOwnSlotRow({
      existingId,
      officeLocationId,
      assignedFrequency,
      recurrenceGroupId,
      createdByUserId
    });

    // 1) Same provider + frequency (historical unique key)
    const [ownFreqRows] = await pool.execute(
      `SELECT id FROM office_standing_assignments
       WHERE room_id = ? AND provider_id = ? AND weekday = ? AND hour = ? AND assigned_frequency = ?
       ORDER BY is_active DESC, id DESC
       LIMIT 1`,
      [roomId, providerId, weekday, hour, assignedFrequency]
    );
    if (ownFreqRows?.[0]?.id) {
      return reactivateOwn(ownFreqRows[0].id);
    }

    // 2) Same provider any frequency at this physical slot
    const [ownSlotRows] = await pool.execute(
      `SELECT id FROM office_standing_assignments
       WHERE office_location_id = ? AND room_id = ? AND provider_id = ? AND weekday = ? AND hour = ?
       ORDER BY is_active DESC, id DESC
       LIMIT 1`,
      [officeLocationId, roomId, providerId, weekday, hour]
    );
    if (ownSlotRows?.[0]?.id) {
      return reactivateOwn(ownSlotRows[0].id);
    }

    // 3) Active physical-slot key held by another provider with no live future events
    const [activeRows] = await pool.execute(
      `SELECT a.id, a.provider_id
       FROM office_standing_assignments a
       WHERE a.office_location_id = ?
         AND a.room_id = ?
         AND a.weekday = ?
         AND a.hour = ?
         AND a.is_active = TRUE
       ORDER BY a.id ASC
       LIMIT 1`,
      [officeLocationId, roomId, weekday, hour]
    );
    const blocker = activeRows?.[0] || null;
    if (!blocker?.id) {
      return null;
    }

    const [liveRows] = await pool.execute(
      `SELECT 1
       FROM office_events
       WHERE room_id = ?
         AND start_at >= NOW()
         AND HOUR(start_at) = ?
         AND DAYOFWEEK(start_at) = ?
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
         AND (
           standing_assignment_id = ?
           OR booked_provider_id = ?
           OR assigned_provider_id = ?
         )
       LIMIT 1`,
      [roomId, hour, Number(weekday) + 1, blocker.id, blocker.provider_id, blocker.provider_id]
    );
    if ((liveRows || []).length) {
      // Real conflict — surface a clean 409 instead of the raw MySQL unique-key error.
      const conflicts = await this.findActiveConflictsBySlot({
        officeLocationId,
        roomId,
        weekday,
        hour
      });
      throw this.conflictError(conflicts[0] || blocker);
    }

    // Orphaned active assignment: deactivate it, then create/reactivate for the new provider.
    await pool.execute(
      `UPDATE office_standing_assignments
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blocker.id]
    );

    // Prefer any historical row for the new provider at this slot; else insert fresh.
    const [reuseRows] = await pool.execute(
      `SELECT id FROM office_standing_assignments
       WHERE office_location_id = ? AND room_id = ? AND provider_id = ? AND weekday = ? AND hour = ?
       ORDER BY id DESC
       LIMIT 1`,
      [officeLocationId, roomId, providerId, weekday, hour]
    );
    if (reuseRows?.[0]?.id) {
      return reactivateOwn(reuseRows[0].id);
    }

    try {
      const [ins] = await pool.execute(
        `INSERT INTO office_standing_assignments
          (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, recurrence_group_id,
           availability_mode, available_since_date, temporary_until_date, temporary_extension_count,
           last_two_week_confirmed_at, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NULL, 0, NOW(), TRUE, ?)`,
        [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, recurrenceGroupId, createdByUserId]
      );
      return this.findById(ins.insertId);
    } catch (retryErr) {
      if (retryErr?.code === 'ER_DUP_ENTRY' || retryErr?.errno === 1062) {
        const [retryRows] = await pool.execute(
          `SELECT id FROM office_standing_assignments
           WHERE office_location_id = ? AND room_id = ? AND provider_id = ? AND weekday = ? AND hour = ?
           ORDER BY id DESC
           LIMIT 1`,
          [officeLocationId, roomId, providerId, weekday, hour]
        );
        if (retryRows?.[0]?.id) return reactivateOwn(retryRows[0].id);
        throw this.conflictError(null);
      }
      throw originalError || retryErr;
    }
  }

  static async findActiveBySlot({ officeLocationId, roomId, weekday, hour }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND weekday = ?
         AND hour = ?
         AND is_active = TRUE
       LIMIT 1`,
      [officeLocationId, roomId, weekday, hour]
    );
    return rows?.[0] || null;
  }

  static async findActiveConflictsBySlot({ officeLocationId, roomId, weekday, hour, excludeAssignmentId = null }) {
    const params = [officeLocationId, roomId, weekday, hour];
    let excludeSql = '';
    if (excludeAssignmentId) {
      excludeSql = 'AND a.id <> ?';
      params.push(excludeAssignmentId);
    }
    const [rows] = await pool.execute(
      `SELECT
         a.*,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_standing_assignments a
       JOIN users u ON u.id = a.provider_id
       WHERE a.office_location_id = ?
         AND a.room_id = ?
         AND a.weekday = ?
         AND a.hour = ?
         AND a.is_active = TRUE
         ${excludeSql}
       ORDER BY a.id ASC`,
      params
    );
    return rows || [];
  }

  static conflictError(conflict = null) {
    const providerName = conflict
      ? `${conflict.provider_first_name || ''} ${conflict.provider_last_name || ''}`.trim()
      : '';
    const err = new Error(providerName
      ? `That recurring office slot is already assigned to ${providerName}.`
      : 'That recurring office slot is already assigned.');
    err.status = 409;
    err.code = 'STANDING_SLOT_CONFLICT';
    err.conflict = conflict || null;
    return err;
  }

  static async findAnyBySlotProviderFrequency({
    officeLocationId,
    roomId,
    providerId,
    weekday,
    hour,
    assignedFrequency = 'WEEKLY'
  }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND provider_id = ?
         AND weekday = ?
         AND hour = ?
         AND assigned_frequency = ?
       ORDER BY is_active DESC, id DESC
       LIMIT 1`,
      [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency]
    );
    return rows?.[0] || null;
  }

  static async listByOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT
         a.*,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_standing_assignments a
       JOIN users u ON a.provider_id = u.id
       WHERE a.office_location_id = ?
         AND a.is_active = TRUE`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async update(id, updates = {}) {
    const allowed = [
      'room_id',
      'weekday',
      'hour',
      'assigned_frequency',
      'availability_mode',
      'temporary_until_date',
      'temporary_extension_count',
      'available_since_date',
      'last_two_week_confirmed_at',
      'last_six_week_checked_at',
      'last_forfeit_warning_at',
      'recurrence_group_id',
      'is_active'
    ];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (k in updates) {
        fields.push(`${k} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE office_standing_assignments SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeStandingAssignment;

