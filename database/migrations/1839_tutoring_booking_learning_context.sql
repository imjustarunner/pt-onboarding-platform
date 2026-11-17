-- Preserve the selected academic service/subject independently of customer prices.
ALTER TABLE appointments ADD COLUMN learning_context_json JSON NULL;
