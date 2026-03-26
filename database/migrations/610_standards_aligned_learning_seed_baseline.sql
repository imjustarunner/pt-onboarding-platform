-- Seed baseline standards-aligned learning catalog entries.
-- Safe to run repeatedly (INSERT IGNORE + unique constraints).

INSERT IGNORE INTO learning_standards_domains
  (code, title, description, source_framework, version, is_active)
VALUES
  ('ELA', 'Literacy (ELA)', 'Reading, writing, speaking, and language competencies.', 'CAS', 'v1', 1),
  ('MATH', 'Mathematics', 'Numeracy, operations, algebraic reasoning, and problem solving.', 'CAS', 'v1', 1),
  ('SCI', 'Science', 'Inquiry, life science, physical science, and earth systems.', 'CAS', 'v1', 1),
  ('SEL', 'Social-Emotional', 'Behavioral, emotional regulation, and interpersonal competencies.', 'InternalBehavioral', 'v1', 1);

INSERT IGNORE INTO learning_standards_subdomains
  (domain_id, code, title, description, source_framework, version, is_active)
SELECT d.id, x.code, x.title, x.description, x.source_framework, 'v1', 1
FROM learning_standards_domains d
JOIN (
  SELECT 'ELA' AS domain_code, 'READ_COMP' AS code, 'Reading Comprehension' AS title, 'Understand and analyze grade-level text.' AS description, 'CAS' AS source_framework
  UNION ALL SELECT 'ELA', 'WRITING', 'Writing', 'Compose organized writing for audience and purpose.', 'CAS'
  UNION ALL SELECT 'MATH', 'NUM_SENSE', 'Number Sense', 'Understand numbers, magnitude, and operations.', 'CAS'
  UNION ALL SELECT 'MATH', 'ALGEBRAIC', 'Algebraic Thinking', 'Patterns, expressions, and equation reasoning.', 'CAS'
  UNION ALL SELECT 'SCI', 'INQUIRY', 'Scientific Inquiry', 'Ask questions, model, test, and explain evidence.', 'CAS'
  UNION ALL SELECT 'SCI', 'EARTH_SYS', 'Earth Systems', 'Explain interactions among earth systems.', 'CAS'
  UNION ALL SELECT 'SEL', 'SELF_MGMT', 'Self-Management', 'Regulate behavior, focus, and task persistence.', 'InternalBehavioral'
  UNION ALL SELECT 'SEL', 'REL_SKILLS', 'Relationship Skills', 'Communication, cooperation, and conflict navigation.', 'InternalBehavioral'
) x ON x.domain_code = d.code
WHERE d.version = 'v1';

INSERT IGNORE INTO learning_standards
  (domain_id, subdomain_id, code, title, description, grade_band, source_framework, version, is_active)
SELECT
  d.id,
  sd.id,
  x.standard_code,
  x.standard_title,
  x.standard_description,
  x.grade_band,
  x.source_framework,
  'v1',
  1
FROM learning_standards_domains d
JOIN learning_standards_subdomains sd
  ON sd.domain_id = d.id
JOIN (
  SELECT 'ELA' AS domain_code, 'READ_COMP' AS sub_code, 'ELA.RC.1' AS standard_code, 'Determine central idea and supporting details' AS standard_title, 'Identify main ideas and evidence from text.' AS standard_description, '3-5' AS grade_band, 'CAS' AS source_framework
  UNION ALL SELECT 'ELA', 'WRITING', 'ELA.W.1', 'Produce coherent writing for purpose', 'Organize writing with clear structure and evidence.', '3-5', 'CAS'
  UNION ALL SELECT 'MATH', 'NUM_SENSE', 'MATH.NS.1', 'Apply place value and operations', 'Use operations with whole numbers and decimals.', '3-5', 'CAS'
  UNION ALL SELECT 'MATH', 'ALGEBRAIC', 'MATH.A.1', 'Represent and analyze patterns', 'Use expressions and equations to model patterns.', '4-6', 'CAS'
  UNION ALL SELECT 'SCI', 'INQUIRY', 'SCI.I.1', 'Plan and carry out investigations', 'Collect and analyze evidence from investigations.', '3-8', 'CAS'
  UNION ALL SELECT 'SCI', 'EARTH_SYS', 'SCI.ES.1', 'Describe earth system interactions', 'Explain interactions among geosphere, hydrosphere, atmosphere, biosphere.', '4-8', 'CAS'
  UNION ALL SELECT 'SEL', 'SELF_MGMT', 'SEL.SM.1', 'Demonstrate self-regulation', 'Sustain attention and regulate impulses in structured settings.', 'K-12', 'InternalBehavioral'
  UNION ALL SELECT 'SEL', 'REL_SKILLS', 'SEL.RS.1', 'Demonstrate positive relationship skills', 'Use respectful communication and collaboration strategies.', 'K-12', 'InternalBehavioral'
) x
  ON x.domain_code = d.code
 AND x.sub_code = sd.code
WHERE d.version = 'v1' AND sd.version = 'v1';

INSERT IGNORE INTO learning_skills
  (domain_id, subdomain_id, standard_id, code, title, description, grade_level, skill_order, is_active)
SELECT
  d.id,
  sd.id,
  st.id,
  x.skill_code,
  x.skill_title,
  x.skill_description,
  x.grade_level,
  x.skill_order,
  1
FROM learning_standards_domains d
JOIN learning_standards_subdomains sd
  ON sd.domain_id = d.id
JOIN learning_standards st
  ON st.domain_id = d.id
 AND st.subdomain_id = sd.id
JOIN (
  SELECT 'ELA' AS domain_code, 'READ_COMP' AS sub_code, 'ELA.RC.1' AS standard_code, 'ELA.RC.1A' AS skill_code, 'Identify main idea' AS skill_title, 'Identify main idea in a grade-level passage.' AS skill_description, '3' AS grade_level, 10 AS skill_order
  UNION ALL SELECT 'ELA', 'READ_COMP', 'ELA.RC.1', 'ELA.RC.1B', 'Use textual evidence', 'Cite supporting evidence from text.', '4', 20
  UNION ALL SELECT 'ELA', 'WRITING', 'ELA.W.1', 'ELA.W.1A', 'Write clear paragraph responses', 'Write focused paragraph responses with supporting details.', '4', 10
  UNION ALL SELECT 'MATH', 'NUM_SENSE', 'MATH.NS.1', 'MATH.NS.1A', 'Fluency with multi-digit addition/subtraction', 'Solve multi-digit operations accurately.', '4', 10
  UNION ALL SELECT 'MATH', 'ALGEBRAIC', 'MATH.A.1', 'MATH.A.1A', 'Model patterns with expressions', 'Represent pattern relationships with expressions.', '5', 10
  UNION ALL SELECT 'SCI', 'INQUIRY', 'SCI.I.1', 'SCI.I.1A', 'Design controlled investigations', 'Plan investigations with variable control.', '5', 10
  UNION ALL SELECT 'SCI', 'EARTH_SYS', 'SCI.ES.1', 'SCI.ES.1A', 'Explain earth system interactions', 'Explain impacts across earth systems.', '6', 10
  UNION ALL SELECT 'SEL', 'SELF_MGMT', 'SEL.SM.1', 'SEL.SM.1A', 'Sustain task focus', 'Maintain task focus with minimal prompts.', 'K-12', 10
  UNION ALL SELECT 'SEL', 'REL_SKILLS', 'SEL.RS.1', 'SEL.RS.1A', 'Use respectful communication', 'Use respectful language and turn-taking during collaboration.', 'K-12', 10
) x
  ON x.domain_code = d.code
 AND x.sub_code = sd.code
 AND x.standard_code = st.code
WHERE d.version = 'v1' AND sd.version = 'v1' AND st.version = 'v1';
