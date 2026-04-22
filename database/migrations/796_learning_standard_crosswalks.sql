-- 796_learning_standard_crosswalks.sql
--
-- Introduces a lightweight crosswalk table that maps learning_standards rows
-- (currently seeded primarily as CAS — Colorado Academic Standards) to their
-- corresponding codes in other frameworks, especially Common Core State
-- Standards (CCSS) and US Department of Education domain areas.
--
-- This lets the AI tutor, agents.controller, and guardian portal reason about
-- the same learning objective across frameworks. For example:
--   - Teacher sets a CAS-aligned goal (MATH.A.1)
--   - AI transcript analysis logs evidence against that CAS standard
--   - Guardian portal shows progress mapped to the CCSS equivalent
--     (e.g., CCSS.MATH.CONTENT.6.EE.B.7) so out-of-state families recognize it
--   - Homework PDFs can cite both CAS and CCSS codes for credibility
--
-- Mapping quality values:
--   'exact'        — 1:1 semantic match
--   'close'        — Strong overlap, minor wording differences
--   'partial'      — Covers part of the target standard
--   'related'      — Thematically related, different depth
--
-- We intentionally keep this as a row-per-mapping table (one source standard
-- may map to multiple targets in CCSS/NGSS/etc.) rather than denormalized
-- columns, so it scales as more frameworks are added.

CREATE TABLE IF NOT EXISTS learning_standard_crosswalks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  from_standard_id INT NOT NULL,
  to_framework VARCHAR(64) NOT NULL,
  to_code VARCHAR(191) NOT NULL,
  to_title VARCHAR(255) NULL,
  to_description TEXT NULL,
  mapping_quality ENUM('exact', 'close', 'partial', 'related') NOT NULL DEFAULT 'close',
  notes VARCHAR(500) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_learning_standard_crosswalks_from
    FOREIGN KEY (from_standard_id) REFERENCES learning_standards(id) ON DELETE CASCADE,
  UNIQUE KEY uq_learning_standard_crosswalk (from_standard_id, to_framework, to_code),
  KEY idx_learning_standard_crosswalk_framework (to_framework, to_code),
  KEY idx_learning_standard_crosswalk_quality (mapping_quality, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed crosswalks for the current CAS baseline standards (IDs 1-8 from migration 610).
-- Uses INSERT IGNORE so re-running is safe; if seed IDs differ in any environment
-- the missing rows simply won't insert (FK will reject).
INSERT IGNORE INTO learning_standard_crosswalks
  (from_standard_id, to_framework, to_code, to_title, mapping_quality, notes)
VALUES
  -- ELA.RC.1 (CAS) Determine central idea / supporting details
  (1, 'CCSS', 'CCSS.ELA-LITERACY.RI.4.2',
   'Determine the main idea of a text and explain how it is supported by key details',
   'exact', 'Grade 4 CCSS Reading Informational equivalent to CAS ELA.RC.1 (3-5)'),
  (1, 'USDoE', 'ELA/Reading: Key Ideas and Details',
   'US Department of Education — English Language Arts domain anchor',
   'close', 'Federal reporting domain used in ESSA / NAEP'),

  -- ELA.W.1 (CAS) Produce coherent writing for purpose
  (2, 'CCSS', 'CCSS.ELA-LITERACY.W.4.4',
   'Produce clear and coherent writing appropriate to task, purpose, and audience',
   'exact', 'Grade 4 CCSS Writing equivalent to CAS ELA.W.1 (3-5)'),
  (2, 'USDoE', 'ELA/Writing: Production and Distribution of Writing',
   'US Department of Education — ELA Writing strand',
   'close', 'Federal reporting domain'),

  -- MATH.A.1 (CAS) Represent and analyze patterns
  (3, 'CCSS', 'CCSS.MATH.CONTENT.5.OA.B.3',
   'Generate two numerical patterns using two given rules and identify relationships',
   'close', 'Grade 5 CCSS Operations and Algebraic Thinking aligns to CAS MATH.A.1 (4-6)'),
  (3, 'CCSS', 'CCSS.MATH.CONTENT.6.EE.B.7',
   'Solve real-world and mathematical problems by writing and solving equations of the form x + p = q and px = q',
   'partial', 'Covers linear equation subset of CAS MATH.A.1'),
  (3, 'USDoE', 'Mathematics: Algebra and Functions',
   'US Department of Education — Mathematics domain (NAEP framework)',
   'close', 'Federal reporting domain'),

  -- MATH.NS.1 (CAS) Place value and operations
  (4, 'CCSS', 'CCSS.MATH.CONTENT.4.NBT.B.4',
   'Fluently add and subtract multi-digit whole numbers using the standard algorithm',
   'exact', 'Grade 4 CCSS Number & Operations in Base Ten'),
  (4, 'CCSS', 'CCSS.MATH.CONTENT.5.NBT.A.1',
   'Recognize that in a multi-digit number, a digit in one place represents 10 times as much as the place to its right',
   'close', 'Grade 5 place-value equivalent'),
  (4, 'USDoE', 'Mathematics: Number Properties and Operations',
   'US Department of Education — Mathematics domain (NAEP framework)',
   'exact', 'Federal reporting domain'),

  -- SCI.ES.1 (CAS) Earth system interactions
  (5, 'NGSS', '5-ESS2-1',
   'Develop a model using an example to describe ways the geosphere, biosphere, hydrosphere, and/or atmosphere interact',
   'exact', 'Next Generation Science Standards Grade 5 Earth Systems'),
  (5, 'USDoE', 'Science: Earth and Space Sciences',
   'US Department of Education — Science domain (NAEP framework)',
   'close', 'Federal reporting domain'),

  -- SCI.I.1 (CAS) Plan and carry out investigations
  (6, 'NGSS', 'SEP-3',
   'Planning and Carrying Out Investigations (Science and Engineering Practice)',
   'exact', 'NGSS Science and Engineering Practice 3'),
  (6, 'USDoE', 'Science: Scientific Inquiry and Practices',
   'US Department of Education — cross-cutting science practice',
   'close', 'Federal reporting domain');

-- Helpful comment to keep context with the table
ALTER TABLE learning_standard_crosswalks
  COMMENT = 'Maps CAS learning_standards rows to CCSS / NGSS / US DoE codes so the AI tutor and guardian portal can present standards across frameworks (Colorado, Common Core, federal NAEP).';
