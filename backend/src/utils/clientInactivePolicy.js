const fake=/\b(fake|demo|test|testing|synthetic|example)\b/i;
export const realInactiveClientSql=`(LOWER(COALESCE(cs.status_key,'')) IN ('inactive','terminated')
 AND COALESCE(c.is_demo,0)=0 AND COALESCE(c.created_via_dev_fill,0)=0
 AND NOT (LOWER(COALESCE(c.termination_reason,'')) REGEXP '(^|[^a-z])(fake|demo|test|testing|synthetic|example)([^a-z]|$)'))`;
export function isRealInactiveClient(client){return !!client&&['inactive','terminated'].includes(String(client.client_status_key||'').toLowerCase())&&!Number(client.is_demo)&&!Number(client.created_via_dev_fill)&&!fake.test(client.termination_reason||'');}
