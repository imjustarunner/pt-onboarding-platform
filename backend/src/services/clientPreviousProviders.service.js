import pool from '../config/database.js';
import {realInactiveClientSql} from '../utils/clientInactivePolicy.js';
export async function previousProviderOptionsForAgencies(agencyIds,{db=pool}={}){
 const ids=[...new Set(agencyIds.map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))];if(!ids.length)return [];
 const scope=`c.agency_id IN (${ids.map(()=>'?').join(',')}) AND ${realInactiveClientSql} AND c.compliance_archived_at IS NULL`;
 const clients='FROM clients c JOIN client_statuses cs ON cs.id=c.client_status_id';
 const branches=[
  `SELECT p.provider_user_id provider_id ${clients} JOIN client_provider_assignments p ON p.client_id=c.id WHERE ${scope}`,
  `SELECT c.provider_id ${clients} WHERE ${scope} AND c.provider_id IS NOT NULL`,
  `SELECT c.termination_last_provider_id ${clients} WHERE ${scope} AND c.termination_last_provider_id IS NOT NULL`,
  ...['from_value','to_value'].map(field=>`SELECT CAST(h.${field} AS UNSIGNED) ${clients} JOIN client_status_history h ON h.client_id=c.id AND h.field_changed='provider_id' WHERE ${scope} AND h.${field} REGEXP '^[0-9]+$'`)
 ];
 const [rows]=await db.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM (${branches.join(' UNION ')}) previous JOIN users u ON u.id=previous.provider_id ORDER BY name,u.id`,branches.flatMap(()=>ids));
 return rows;
}
export async function attachPreviousClientProviders(rows,{db=pool}={}){
 const ids=[...new Set(rows.map(r=>Number(r.id)).filter(Boolean))];if(!ids.length)return rows;
 const placeholders=ids.map(()=>'?').join(',');
 const [history]=await db.execute(`SELECT p.client_id,u.id provider_id,CONCAT_WS(' ',u.first_name,u.last_name) provider_name FROM client_provider_assignments p JOIN users u ON u.id=p.provider_user_id WHERE p.client_id IN (${placeholders})
 UNION SELECT c.id,u.id,CONCAT_WS(' ',u.first_name,u.last_name) FROM clients c JOIN users u ON u.id=c.termination_last_provider_id OR u.id=c.provider_id WHERE c.id IN (${placeholders})
 UNION SELECT h.client_id,u.id,CONCAT_WS(' ',u.first_name,u.last_name) FROM client_status_history h JOIN users u ON u.id=CAST(h.from_value AS UNSIGNED) OR u.id=CAST(h.to_value AS UNSIGNED) WHERE h.field_changed='provider_id' AND h.client_id IN (${placeholders})`,[...ids,...ids,...ids]);
 return rows.map(row=>({...row,previous_providers:history.filter(h=>Number(h.client_id)===Number(row.id)).map(h=>({id:Number(h.provider_id),name:h.provider_name}))}));
}
