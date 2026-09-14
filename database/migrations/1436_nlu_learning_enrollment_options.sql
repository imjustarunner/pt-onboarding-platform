-- Activate NLU provider choice and a learning-specific enrollment entrance.
-- JSON merge preserves unrelated branding and custom layout settings.
UPDATE agencies
SET theme_settings = JSON_MERGE_PATCH(COALESCE(theme_settings, JSON_OBJECT()),
  '{"joinLanding":{"tutoring":{"showChooseProvider":true,"quickTitle":"Learning Interest Form","fullTitle":"Full Learning Enrollment","quickBullets":["Learner and guardian contact","Program, grade, subjects, and goals","Provider and package preferences"],"fullBullets":["Learner and guardian information","Learning goals and optional academic reflection","Provider preferences, funding, and agreements"],"fullFooter":"Our team reviews your plan, provider match, and funding before services begin.","enrollmentSubjects":{"myself":true,"dependent":true,"couple":false,"family":false}},"counseling":{"showChooseProvider":true}}}')
WHERE slug = 'nlu';
UPDATE agency_public_service_types s JOIN agencies a ON a.id=s.agency_id
SET s.display_name='Learning services', s.intro_blurb='Tutoring, academic acceleration, and cognitive and emotional enrichment.'
WHERE a.slug='nlu' AND s.service_type='tutoring';
