import {requireNarrivaAgency,positiveId,narrivaError} from '../services/narrivaAccess.service.js';
import {searchClinicalDiagnoses} from '../services/clinicalDiagnosisSearch.service.js';

export async function searchDiagnosisCatalog(req,res,next) {
 res.set('Cache-Control','no-store');
 try {
  const agencyId=positiveId(req.body.agencyId || req.query.agencyId);
  await requireNarrivaAgency(req.user,agencyId);
  if(Object.keys(req.body).some(key=>!['agencyId','query','dateOfService'].includes(key)))throw narrivaError(422,'Use only the diagnosis search fields.');
  if(typeof req.body.query!=='string'||req.body.query.length>100)throw narrivaError(422,'Enter a diagnosis name or code of up to 100 characters.');
  const date=req.body.dateOfService;
  if(date && (typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw narrivaError(422,'Choose a valid service date.');
  res.json(searchClinicalDiagnoses(req.body.query,{dateOfService:date}));
 } catch(error){next(Object.assign(error,{quiet:true}));}
}
