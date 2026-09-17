import pool from '../config/database.js';
import {listPublicWebsiteIdentities} from './publicWebsiteIdentity.service.js';
// Deliberately select public company fields, never internal notes, people or email addresses.
export async function listPublicReferralNetwork({database=pool,identities=listPublicWebsiteIdentities}={}) {
 const [rows]=await database.execute(`SELECT e.id,COALESCE(NULLIF(e.organization_name,''),e.name) AS name,e.website AS url,
 c.name AS category,e.specialties,e.insurances_accepted AS insurance
 FROM referral_directory_entries e JOIN agencies a ON a.id=e.agency_id
 LEFT JOIN referral_directory_categories c ON c.id=e.category_id
 WHERE a.slug='itsco' AND e.is_active=1 AND e.approval_status='approved' ORDER BY name,e.id`);
 const managed=await identities();
 const companies=managed.map(p=>({id:`site-${p.slug}`,name:p.name,url:p.comingSoon?null:p.url,logoUrl:p.logoUrl,category:p.industries.join(' · '),comingSoon:p.comingSoon}));
 const keys=new Set(companies.map(c=>String(c.name).trim().toLowerCase()));
 const hosts=new Set(companies.map(c=>host(c.url)).filter(Boolean));
 for(const row of rows){const key=String(row.name||'').trim().toLowerCase();const h=host(row.url);if(!key||keys.has(key)||(h&&hosts.has(h)))continue;companies.push({...row,id:`referral-${row.id}`});keys.add(key);if(h)hosts.add(h);}
 return companies.sort((a,b)=>a.name.localeCompare(b.name));
}
function host(value){try{return new URL(value).hostname.replace(/^www\./,'');}catch{return '';}}
