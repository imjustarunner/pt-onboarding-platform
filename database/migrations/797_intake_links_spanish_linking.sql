-- Non-school intake forms: allow an English form to point at its Spanish counterpart
-- so one QR code / public URL can serve both languages via an in-page toggle.
-- School portal keeps its existing separate-link model.

ALTER TABLE intake_links
  ADD COLUMN linked_es_form_id INT NULL AFTER language_code,
  ADD COLUMN document_translation_map JSON NULL AFTER linked_es_form_id,
  ADD CONSTRAINT fk_intake_links_linked_es
    FOREIGN KEY (linked_es_form_id) REFERENCES intake_links(id) ON DELETE SET NULL,
  ADD INDEX idx_intake_links_linked_es (linked_es_form_id);

-- document_translation_map shape: { "<english_document_template_id>": <spanish_document_template_id>, ... }
-- Used when the public intake page toggles to Spanish: the form substitutes the
-- Spanish PDF for each matching English document during signing.
