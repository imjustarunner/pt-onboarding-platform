-- Migration 1036: reword materials questions as affirmative "check if you need" statements
UPDATE school_reinit_question_configs
SET
  label = 'We need printed paper packets.',
  help_text = 'Check this if you need paper packets for families or staff.'
WHERE question_key = 'need_paper_packets'
  AND section_key = 'materials';

UPDATE school_reinit_question_configs
SET
  label = 'We need trifold brochures.',
  help_text = 'Check this if you need printed trifold brochures about our services.'
WHERE question_key = 'need_trifolds'
  AND section_key = 'materials';

UPDATE school_reinit_question_configs
SET
  label = 'We need materials delivered to our school.',
  help_text = 'Check this if delivery / drop-off is required for materials.'
WHERE question_key = 'materials_delivery_required'
  AND section_key = 'materials';

UPDATE school_reinit_question_configs
SET
  label = 'Anything else we should know about your materials needs?',
  help_text = 'Quantities, timing, or other requests.'
WHERE question_key = 'materials_notes'
  AND section_key = 'materials';
