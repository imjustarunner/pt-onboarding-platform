import {resolveSectionTraining} from '../services/providerUpdateTraining.service.js';
import {reviewRecipient,requireSection} from './providerUpdateReview.controller.js';

export async function sectionTraining(req,res,next) {
  try {
    const recipient=await reviewRecipient(req);
    requireSection(recipient,req.params.sectionKey);
    res.set('Cache-Control','no-store');
    res.json({guides:await resolveSectionTraining(recipient.section_config_json,req.params.sectionKey,recipient.agency_id)});
  } catch(error) {next(error);}
}
