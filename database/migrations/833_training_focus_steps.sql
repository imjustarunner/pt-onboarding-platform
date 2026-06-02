-- Migration 833: Unified training focus steps, progress, and time logs

CREATE TABLE IF NOT EXISTS training_focus_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    training_focus_id INT NOT NULL,
    step_type ENUM('module', 'checklist_item', 'document') NOT NULL,
    reference_id INT NOT NULL COMMENT 'module id, checklist item id, or document template id',
    order_index INT NOT NULL DEFAULT 0,
    document_action_type ENUM('signature', 'review') NULL COMMENT 'For document steps only',
    due_date_days INT NULL COMMENT 'Days from assignment to set due date',
    title_override VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    UNIQUE KEY unique_focus_step_ref (training_focus_id, step_type, reference_id),
    INDEX idx_focus_order (training_focus_id, order_index)
);

CREATE TABLE IF NOT EXISTS user_training_focus_progress (
    user_id INT NOT NULL,
    training_focus_id INT NOT NULL,
    agency_id INT NOT NULL,
    status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
    current_step_id INT NULL,
    total_time_spent_seconds INT NOT NULL DEFAULT 0,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    payroll_claim_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, training_focus_id, agency_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (current_step_id) REFERENCES training_focus_steps(id) ON DELETE SET NULL,
    INDEX idx_focus_status (training_focus_id, status),
    INDEX idx_payroll_claim (payroll_claim_id)
);

CREATE TABLE IF NOT EXISTS user_training_focus_step_progress (
    user_id INT NOT NULL,
    agency_id INT NOT NULL,
    step_id INT NOT NULL,
    status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
    time_spent_seconds INT NOT NULL DEFAULT 0,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, agency_id, step_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES training_focus_steps(id) ON DELETE CASCADE,
    INDEX idx_step_status (step_id, status)
);

CREATE TABLE IF NOT EXISTS training_focus_time_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    agency_id INT NOT NULL,
    training_focus_id INT NOT NULL,
    step_id INT NOT NULL,
    session_start TIMESTAMP NOT NULL,
    session_end TIMESTAMP NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
    FOREIGN KEY (training_focus_id) REFERENCES training_tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (step_id) REFERENCES training_focus_steps(id) ON DELETE CASCADE,
    INDEX idx_user_focus (user_id, training_focus_id, agency_id),
    INDEX idx_session_start (session_start)
);

-- Backfill steps from track_modules (ordered), then focus-level checklist items,
-- then module-nested checklist items immediately after their parent module step.

INSERT INTO training_focus_steps (training_focus_id, step_type, reference_id, order_index)
SELECT tm.track_id, 'module', tm.module_id, tm.order_index
FROM track_modules tm
WHERE NOT EXISTS (
    SELECT 1 FROM training_focus_steps tfs
    WHERE tfs.training_focus_id = tm.track_id
      AND tfs.step_type = 'module'
      AND tfs.reference_id = tm.module_id
);

INSERT INTO training_focus_steps (training_focus_id, step_type, reference_id, order_index)
SELECT
    cci.training_focus_id,
    'checklist_item',
    cci.id,
    (
        COALESCE((
            SELECT MAX(tfs.order_index)
            FROM training_focus_steps tfs
            WHERE tfs.training_focus_id = cci.training_focus_id
        ), -1) + 1 + cci.order_index
    )
FROM custom_checklist_items cci
WHERE cci.training_focus_id IS NOT NULL
  AND cci.module_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM training_focus_steps tfs
      WHERE tfs.training_focus_id = cci.training_focus_id
        AND tfs.step_type = 'checklist_item'
        AND tfs.reference_id = cci.id
  );

INSERT INTO training_focus_steps (training_focus_id, step_type, reference_id, order_index)
SELECT
    m.track_id,
    'checklist_item',
    cci.id,
    (
        COALESCE((
            SELECT tfs.order_index
            FROM training_focus_steps tfs
            WHERE tfs.training_focus_id = m.track_id
              AND tfs.step_type = 'module'
              AND tfs.reference_id = cci.module_id
            LIMIT 1
        ), COALESCE((
            SELECT MAX(tfs2.order_index)
            FROM training_focus_steps tfs2
            WHERE tfs2.training_focus_id = m.track_id
        ), -1)) + 1 + cci.order_index
    )
FROM custom_checklist_items cci
INNER JOIN modules m ON m.id = cci.module_id
WHERE cci.module_id IS NOT NULL
  AND m.track_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM training_focus_steps tfs
      WHERE tfs.training_focus_id = m.track_id
        AND tfs.step_type = 'checklist_item'
        AND tfs.reference_id = cci.id
  );
