-- Add language_code to document_templates so admins can mark a template
-- as English (default) or Spanish. The field drives the document-translation
-- map in intake_links: when an English form is linked to a Spanish form,
-- the per-document EN→ES mapping lets each English document point to its
-- Spanish counterpart from the linked form's document list.
--
-- Default NULL is treated as 'en' by the application layer so existing
-- templates are unaffected.

ALTER TABLE document_templates
  ADD COLUMN language_code VARCHAR(10) NULL DEFAULT NULL
    COMMENT 'ISO 639-1 language code: null/"en" = English, "es" = Spanish'
    AFTER description;
