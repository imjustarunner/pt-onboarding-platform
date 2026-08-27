-- Migration 1321: Session guide JSON on briefs + expanded CAS seed for tutoring alignment

ALTER TABLE tutoring_session_briefs
  ADD COLUMN guide_json JSON NULL
    COMMENT 'Teaching sequence, prompts, misconceptions, CFU, interventions, objective, standardsAlignment'
  AFTER materials_json;

-- Expanded Colorado Academic Standards subset (illustrative / instructional alignment — not a full CDE import)
INSERT INTO tutoring_cas_standards
  (version_key, subject_key, grade_band, standard_code, title, description, source_label)
VALUES
  ('CAS-MA-2018', 'mathematics', '3-5', '5.NF.B.4', 'Multiply a fraction or whole number by a fraction',
   'Apply and extend previous understandings of multiplication to multiply a fraction or whole number by a fraction. Interpret products using visual fraction models.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '3-5', '5.NF.B.6', 'Solve real-world problems involving multiplication of fractions',
   'Solve real world problems involving multiplication of fractions and mixed numbers, e.g., by using visual fraction models or equations.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '3-5', '5.NF.A.1', 'Add and subtract fractions with unlike denominators',
   'Add and subtract fractions with unlike denominators (including mixed numbers) by replacing given fractions with equivalent fractions.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '3-5', '4.NF.B.3', 'Understand a fraction a/b with a > 1 as a sum of unit fractions',
   'Understand addition and subtraction of fractions as joining and separating parts referring to the same whole.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '6-8', '6.EE.B.5', 'Understand solving equations as a process of reasoning',
   'Understand solving an equation or inequality as a process of answering which values make the equation true.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'mathematics', '6-8', '7.EE.B.4', 'Use variables to represent quantities and construct equations',
   'Use variables to represent quantities in a real-world or mathematical problem, and construct simple equations and inequalities.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-MA-2018', 'algebra', '9-12', 'A-REI.B.3', 'Solve linear equations and inequalities in one variable',
   'Solve linear equations and inequalities in one variable, including equations with coefficients represented by letters.',
   'Colorado Academic Standards — Mathematics'),
  ('CAS-RW-2024', 'reading', '3-5', 'RW.5.2.1', 'Quote accurately when explaining text',
   'Quote accurately from a text when explaining what the text says explicitly and when drawing inferences.',
   'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'reading', '3-5', 'RW.5.2.4', 'Determine meaning of words and phrases',
   'Determine the meaning of words and phrases as they are used in a text, including figurative language.',
   'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'reading', 'K-2', 'RW.2.2.1', 'Ask and answer questions about key details',
   'Ask and answer such questions as who, what, where, when, why, and how to demonstrate understanding of key details in a text.',
   'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'writing', '6-8', 'RW.7.3.1', 'Write arguments to support claims',
   'Write arguments to support claims with clear reasons and relevant evidence.',
   'Colorado Academic Standards — RWC'),
  ('CAS-RW-2024', 'writing', '3-5', 'RW.5.3.2', 'Write informative/explanatory texts',
   'Write informative/explanatory texts to examine a topic and convey ideas and information clearly.',
   'Colorado Academic Standards — RWC');
