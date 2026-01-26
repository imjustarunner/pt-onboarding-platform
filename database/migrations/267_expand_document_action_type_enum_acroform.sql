-- Migration: Expand document_action_type enums to include acroform
-- Description: Support AcroForm wizard workflows by allowing 'acroform' in tasks and document templates.

-- Expand tasks.document_action_type
ALTER TABLE tasks
MODIFY COLUMN document_action_type ENUM('signature', 'review', 'acroform')
DEFAULT 'signature';

-- Expand document_templates.document_action_type
ALTER TABLE document_templates
MODIFY COLUMN document_action_type ENUM('signature', 'review', 'acroform')
DEFAULT 'signature';

