-- Imported frequency can contain the original provider's full narrative.
ALTER TABLE clinical_treatment_plans MODIFY COLUMN prescribed_frequency MEDIUMTEXT NULL;
