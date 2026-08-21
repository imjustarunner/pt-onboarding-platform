-- Migration 1268: Provider Update section audiences, amendment plans, demo testing helpers

ALTER TABLE provider_update_pushes
  ADD COLUMN section_audience_json JSON NULL
    COMMENT 'Per-section audience: { sectionKey: { mode: all|selected|auto, userIds: [] } }',
  ADD COLUMN amendment_plan_json JSON NULL
    COMMENT 'Attached amendment plan: templateId, effectiveDate, title, audience';

ALTER TABLE provider_update_recipients
  ADD COLUMN role_snapshot VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'Role at send time for QA (provider, provider_plus, CPA, etc.)',
  ADD COLUMN is_demo_snapshot TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 if demo/Hogwarts test identity at send time';
