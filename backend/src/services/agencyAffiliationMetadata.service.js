import pool from '../config/database.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

// Agency lists are on the dashboard startup path. Enrich the requested rows in
// batches instead of serial queries for each organization and each parent.
export async function attachAgencyAffiliationMetadata(orgs, { database = pool, affiliations = OrganizationAffiliation } = {}) {
  const list=Array.isArray(orgs)?orgs:[];
  const ids=[...new Set(list.map(o=>Number(o?.id)).filter(id=>id>0))];
  if(!ids.length)return list;
  try {
    const [tables]=await database.execute("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'organization_affiliations'");
    if(!Number(tables?.[0]?.cnt))return list;
    const [rows]=await database.execute(`SELECT organization_id,agency_id FROM organization_affiliations
      WHERE is_active=TRUE AND organization_id IN (${ids.map(()=>'?').join(',')}) ORDER BY updated_at DESC,id DESC`,ids);
    const byOrg=new Map();
    for(const r of rows||[])if(!byOrg.has(Number(r.organization_id)))byOrg.set(Number(r.organization_id),Number(r.agency_id)||null);
    for(const o of list)if(o?.id)o.affiliated_agency_id=byOrg.get(Number(o.id))||null;
    const parentIds=[...new Set(list.filter(o=>o?.id&&String(o.organization_type||'').toLowerCase()!=='clinical')
      .map(o=>String(o.organization_type||'').toLowerCase()==='agency'?Number(o.id):Number(o.affiliated_agency_id||o.id)).filter(id=>id>0))];
    const flags=await affiliations.batchAgencyClinicalLearningFlags(parentIds);
    for(const o of list){
      if(!o?.id)continue;
      const type=String(o.organization_type||'').toLowerCase();
      const id=type==='agency'?Number(o.id):Number(o.affiliated_agency_id||o.id);
      o.hasClinicalOrg=type==='clinical'||flags.get(id)?.hasClinicalOrg===true;
      o.hasLearningOrg=type!=='clinical'&&flags.get(id)?.hasLearningOrg===true;
    }
    const inheritedIds=[...new Set(list.map(o=>Number(o?.affiliated_agency_id)).filter(id=>id>0))];
    if(inheritedIds.length){
      const [parents]=await database.execute(`SELECT id,slug,portal_url,color_palette,theme_settings FROM agencies WHERE id IN (${inheritedIds.map(()=>'?').join(',')})`,inheritedIds);
      const parentMap=new Map((parents||[]).map(p=>[Number(p.id),p]));
      for(const o of list){
        const parent=parentMap.get(Number(o?.affiliated_agency_id));if(!parent)continue;
        o.parent_slug=parent.slug||parent.portal_url||null;
        let palette=o.color_palette;
        if(typeof palette==='string'){try{palette=JSON.parse(palette);}catch{palette=null;}}
        if(!(palette?.primary||palette?.secondary||palette?.accent)&&parent.color_palette)o.color_palette=parent.color_palette;
        if(!o.theme_settings&&parent.theme_settings)o.theme_settings=parent.theme_settings;
      }
    }
  } catch { /* Same best-effort metadata contract; authorization stays server-side. */ }
  return list;
}
