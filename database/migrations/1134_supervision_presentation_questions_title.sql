-- Migration 1133: rename the default "Engagement with Questions" case-presentation
-- section to "Questions". Only touches rows still using the old default title so
-- any presenter who already customized this section keeps their own wording.
UPDATE supervision_presentation_slides
SET title = 'Questions'
WHERE section_key = 'engagement_questions'
  AND title = 'Engagement with Questions';
