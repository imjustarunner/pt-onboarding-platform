import pool from '../config/database.js';
export async function attachPreviousClientProviders(rows,{db=pool}={}){
 const ids=[...new Set(rows.map(r=>Number(r.id)).filter(Boolean))];if(!ids.length)return rows;
 const placeholders=ids.map(()=>'?').join(',');
 const [history]=await db.execute(`SELECT p.client_id,u.id provider_id,CONCAT_WS(' ',u.first_name,u.last_name) provider_name FROM client_provider_assignments p JOIN users u ON u.id=p.provider_user_id WHERE p.client_id IN (${placeholders})
 UNION SELECT c.id,u.id,CONCAT_WS(' ',u.first_name,u.last_name) FROM clients c JOIN users u ON u.id=c.termination_last_provider_id OR u.id=c.provider_id WHERE c.id IN (${placeholders})
 UNION SELECT h.client_id,u.id,CONCAT_WS(' ',u.first_name,u.last_name) FROM client_status_history h JOIN users u ON u.id=CAST(h.from_value AS UNSIGNED) OR u.id=CAST(h.to_value AS UNSIGNED) WHERE h.field_changed='provider_id' AND h.client_id IN (${placeholders})`,[...ids,...ids,...ids]);
 return rows.map(row=>({...row,previous_providers:history.filter(h=>Number(h.client_id)===Number(row.id)).map(h=>({id:Number(h.provider_id),name:h.provider_name}))}));
}
