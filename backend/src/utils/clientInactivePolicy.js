const fake=/^\s*(fake|demo|test|testing|synthetic)(\s+(client|account|record|packet))?[.!]?\s*$|\b(fake|demo|test|synthetic)\s+(client|account|record|packet)\b|\bexample\s+testing\s+packet\b/i;
export const realInactiveClientSql=`(LOWER(COALESCE(cs.status_key,'')) IN ('inactive','terminated')
 AND COALESCE(c.is_demo,0)=0 AND COALESCE(c.created_via_dev_fill,0)=0
 AND NOT (LOWER(COALESCE(c.termination_reason,'')) REGEXP '(^[[:space:]]*(fake|demo|test|testing|synthetic)([[:space:]]+(client|account|record|packet))?[.!]?[[:space:]]*$|(^|[^a-z])(fake|demo|test|synthetic)[[:space:]]+(client|account|record|packet)([^a-z]|$)|(^|[^a-z])example[[:space:]]+testing[[:space:]]+packet([^a-z]|$))'))`;
export function isRealInactiveClient(client){return !!client&&['inactive','terminated'].includes(String(client.client_status_key||'').toLowerCase())&&!Number(client.is_demo)&&!Number(client.created_via_dev_fill)&&!fake.test(client.termination_reason||'');}
