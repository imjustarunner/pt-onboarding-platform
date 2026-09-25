// Shared chart access never includes explicitly private psychotherapy process
// notes or restricted records; those require a separate disclosure workflow.
export const sharedNotePredicate = alias => `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata_json,'$.privatePsychotherapyNote')),'false') <> 'true'
  AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata_json,'$.restricted')),'false') <> 'true'`;
