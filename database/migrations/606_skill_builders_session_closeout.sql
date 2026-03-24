-- Daily closeout: missed attendance + auto checkout at session end when check-in exists without check-out.

ALTER TABLE skill_builders_client_session_attendance
  ADD COLUMN missed_at DATETIME NULL DEFAULT NULL
    COMMENT 'Set when session had started but client had no check-in after closeout job'
    AFTER updated_by_user_id,
  ADD COLUMN check_out_auto TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 when check_out_at was applied by session closeout (forgotten checkout)'
    AFTER missed_at,
  ADD COLUMN auto_checkout_at DATETIME NULL DEFAULT NULL
    COMMENT 'Same as check_out_at when auto-applied (audit trail)'
    AFTER check_out_auto;
