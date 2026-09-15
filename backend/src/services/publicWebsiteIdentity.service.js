import pool from '../config/database.js';
import {resolveOrgLogoUrl} from './publicFormBranding.service.js';
const parse=(v,fallback)=>{try{return typeof v==='string'?JSON.parse(v):v||fallback;}catch{return fallback;}};
export async function getPublicWebsiteIdentity(slug,{includeComingSoon=false}={}) {
 const [rows]=await pool.execute(`SELECT s.*,p.branding_json,a.logo_path,a.logo_url AS agency_logo_url
 FROM public_website_support_sites s LEFT JOIN public_marketing_pages p ON p.slug=s.slug AND p.is_active=1
 JOIN agencies a ON a.id=s.support_agency_id AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
 WHERE s.slug=? AND (p.id IS NOT NULL OR (?=1 AND s.coming_soon=1)) LIMIT 1`,[slug,includeComingSoon?1:0]);
 const row=rows[0];if(!row)return null;
 const branding=parse(row.branding_json,{});
 const agencyLogo=resolveOrgLogoUrl({logo_path:row.logo_path,logo_url:row.agency_logo_url},{baseUrl:row.website_url});
 return {...row,logoUrl:row.logo_url||branding.logoUrl||(Number(row.support_agency_id)!==1||slug==='ptco'?agencyLogo:null),industries:parse(row.industries_json,[])};
}
export async function listPublicWebsiteIdentities() {
 const [rows]=await pool.execute('SELECT slug FROM public_website_support_sites WHERE relationship_type IS NOT NULL ORDER BY coming_soon, name');
 const sites=await Promise.all(rows.map(r=>getPublicWebsiteIdentity(r.slug,{includeComingSoon:true})));
 return sites.filter(Boolean).map(s=>({slug:s.slug,name:s.name,url:s.website_url,logoUrl:s.logoUrl,relationship:s.relationship_type,industries:s.industries,comingSoon:!!s.coming_soon}));
}
