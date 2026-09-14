import pool from '../config/database.js';
import BookingPackage from '../models/BookingPackage.model.js';
import {quoteBookingPackage} from './bookingPackagePricing.service.js';
// Curated public fields only. Tenant ownership is resolved from the published page source,
// never from query parameters or the visitor's current organization.
export async function publicCoachingCatalog(slug){
 const [rows]=await pool.execute(`SELECT a.id,a.account_owner_user_id FROM public_marketing_pages p
 JOIN public_marketing_page_sources s ON s.page_id=p.id AND s.source_type='agency' AND s.is_active=1
 JOIN agencies a ON a.id=s.source_id AND a.organization_type='life_coach' AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
 WHERE p.slug=? AND p.is_active=1`,[slug]);
 if(rows.length!==1)return null;
 const agency=rows[0];
 const packages=await BookingPackage.listForAgency(agency.id,{includeInactive:false});
 return {packages:await Promise.all(packages.filter(p=>p.isActive&&p.isPublic&&p.businessType==='coaching').sort((a,b)=>{const order=['clarity','momentum','transformation','accountability'];const rank=p=>{const i=order.indexOf(p.domainConfig?.website?.key);return i<0?99:i;};return rank(a)-rank(b);}).map(async p=>{
  let amountCents=null;
  try{amountCents=(await quoteBookingPackage({agencyId:agency.id,pkg:p,providerId:agency.account_owner_user_id})).amountCents??null;}catch(e){if(e.status!==400)throw e;}
  const w=p.domainConfig?.website||{};
  return {id:p.id,key:String(w.key||''),name:p.name,description:p.description,sessionCount:p.sessionCount,minutes:p.domainConfig?.pricing?.minutes||p.domainConfig?.sessionMinutes||60,
   amountCents,discountPercent:p.domainConfig?.pricing?.mode==='provider-discount'?p.domainConfig.pricing.discountPercent:null,
   format:p.domainConfig?.pricing?.format||null,subtitle:String(w.subtitle||''),items:Array.isArray(w.items)?w.items.filter(i=>typeof i==='string'):[],icon:String(w.icon||'leaf')};
 }))};
}
