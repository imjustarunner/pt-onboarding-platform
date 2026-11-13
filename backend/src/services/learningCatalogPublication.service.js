import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import TenantService from '../models/TenantService.model.js';

// Publish through the same package records used by the family wallet. Saved
// entitlements keep their existing immutable price/policy snapshot.
export async function publishLearningPackages({agencyId,catalog,actorUserId}, {packages=BookingPackage,services=TenantService}={}) {
  const existing=await packages.listForAgency(agencyId,{businessType:'tutoring',includeInactive:true});
  const available=await services.listForAgency(agencyId);
  const results=[];
  for(const source of catalog.packages || []) {
    const old=existing.find(p=>p.domainConfig?.learningCatalogId===source.id);
    const component=source.components?.[0];
    if(source.components?.length!==1 || component?.service!=='tutoring' || component.format==='small-group' || component.pricingMode!=='provider-discount') {
      if(old)await packages.update(old.id,agencyId,{isActive:false,isPublic:false});
      results.push({sourceId:source.id,status:'requires_package_configuration'});continue;
    }
    const modality=component.format==='virtual'?'TELEHEALTH':'IN_PERSON';
    const allowed=available.filter(s=>s.isActive&&s.businessType==='tutoring'&&String(s.serviceCode||'').toUpperCase()==='TUTORING'&&s.packageEligible&&[modality,'EITHER'].includes(s.modality)).map(s=>s.id);
    if(!allowed.length) {
      if(old)await packages.update(old.id,agencyId,{isActive:false,isPublic:false});
      results.push({sourceId:source.id,status:'requires_service_configuration'});continue;
    }
    const body={businessType:'tutoring',name:source.name,packageType:'prepaid_bundle',sessionCount:component.sessions,
      isActive:source.published,isPublic:source.published,consumeOn:'complete',allowedTenantServiceIds:allowed,
      domainConfig:{...(old?.domainConfig||{}),learningCatalogId:source.id,program:source.program,pricing:{mode:'provider-discount',format:component.format,minutes:component.minutes,discountPercent:component.discountPercent}}};
    // Preserve any existing payment/cancellation configuration. No checkout or
    // credit activation occurs when catalog data is saved.
    const saved=old?await packages.update(old.id,agencyId,body):await packages.create(agencyId,body,actorUserId);
    results.push({sourceId:source.id,packageId:saved.id,status:source.published?'published':'draft'});
  }
  const retained=new Set((catalog.packages||[]).map(p=>p.id));
  for(const old of existing)if(old.domainConfig?.learningCatalogId&&!retained.has(old.domainConfig.learningCatalogId))await packages.update(old.id,agencyId,{isActive:false,isPublic:false});
  return results;
}

export async function saveAndPublishLearningCatalog({agencyId,catalog,actorUserId},db=pool) {
  const connection=await db.getConnection(),key=`learning-catalog:${Number(agencyId)}`;
  let locked=false;
  try {
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,10) AS acquired',[key]);
    if(Number(lock?.acquired)!==1)throw Object.assign(new Error('The catalog is being saved. Try again.'),{status:409});
    locked=true;
    await connection.execute('INSERT INTO agency_learning_catalogs (agency_id,catalog_json) VALUES (?,?) ON DUPLICATE KEY UPDATE catalog_json=VALUES(catalog_json)',[agencyId,JSON.stringify(catalog)]);
    return await publishLearningPackages({agencyId,catalog,actorUserId});
  } finally {
    if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[key]);connection.release();
  }
}
