import { assertRelaySettingsActor, readRelaySettings, saveRelaySettings } from '../services/providerSmsRelaySettings.service.js';
export async function providerSmsRelaySettings(req,res,next) {
  try {
    const userId=Number(req.params.userId), agencyId=Number(req.query.agencyId);
    await assertRelaySettingsActor(req.user,userId,agencyId);
    const result=req.method==='PUT' ? await saveRelaySettings({actor:req.user,userId,agencyId,
      enabled:req.body.enabled,phone:req.body.phone,numberId:Number(req.body.numberId),consent:req.body.consent})
      : await readRelaySettings(userId,agencyId);
    res.json(result);
  } catch(error) { if(error.status) return res.status(error.status).json({error:error.message}); next(error); }
}
