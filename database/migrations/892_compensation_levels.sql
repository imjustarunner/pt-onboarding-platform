-- Migration 892: Structured compensation level system
-- 3 categories x 5 levels per agency, each with direct/indirect/fee-for-service rates
-- Category 1: Bachelors, Interns, QBHA, Peer Professionals
-- Category 2: Pre-licensed & Unlicensed Masters Level
-- Category 3: Licensed Professionals

CREATE TABLE payroll_compensation_levels (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  agency_id     INT           NOT NULL,
  category      TINYINT       NOT NULL COMMENT '1=Bachelors/Interns/QBHA/Peer, 2=Pre-licensed/Unlicensed Masters, 3=Licensed',
  level         TINYINT       NOT NULL COMMENT '1-5',
  label         VARCHAR(120)  NULL DEFAULT NULL COMMENT 'Optional custom label, e.g. "Staff Counselor II"',
  direct_rate   DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Hourly direct service rate',
  indirect_rate DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Hourly indirect service rate',
  ffs_rate      DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Fee-for-service rate (per unit)',
  has_ffs       TINYINT(1)    NOT NULL DEFAULT 0 COMMENT 'Whether this level uses fee-for-service',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_cat_level (agency_id, category, level)
);

CREATE TABLE payroll_user_compensation_levels (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  agency_id          INT      NOT NULL,
  user_id            INT      NOT NULL,
  category           TINYINT  NOT NULL COMMENT '1-3',
  level              TINYINT  NOT NULL COMMENT '1-5',
  assigned_by_user_id INT     NULL DEFAULT NULL,
  assigned_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_user (agency_id, user_id)
);
