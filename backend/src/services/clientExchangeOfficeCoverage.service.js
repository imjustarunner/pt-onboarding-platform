import pool from '../config/database.js';
/** Active assigned offices, scoped to this agency. A general in-person toggle or
 * an unpublished calendar never establishes permission to serve another city. */
export async function loadExchangeOfficeCoverage({userId,agencyId,officeIds=null,database=pool}) {
  const [rows]=await database.execute(`SELECT DISTINCT ol.id,COALESCE(physical.city,ol.city) AS city
    FROM user_office_locations uol JOIN office_locations ol ON ol.id=uol.office_location_id
    LEFT JOIN office_locations physical ON physical.id=ol.physical_office_location_id
    WHERE uol.user_id=? AND COALESCE(uol.is_active,1)=1 AND COALESCE(ol.is_active,1)=1
      AND (physical.id IS NULL OR COALESCE(physical.is_active,1)=1)
      AND EXISTS (SELECT 1 FROM office_location_agencies ola WHERE ola.agency_id=?
        AND ola.office_location_id IN (ol.id,physical.id))`,[userId,agencyId]);
  const allowed=rows.filter(row=>!Array.isArray(officeIds)||officeIds.includes(Number(row.id)));
  return {known:true,officeIds:allowed.map(row=>Number(row.id)),cities:[...new Set(allowed.map(row=>String(row.city||'').trim()).filter(Boolean))]};
}
