const normalize = value => String(value || '').trim().toLowerCase();
/** Only authenticated staff work identities qualify; arbitrary recipients and
 * personal-email copies remain subject to their normal opt-out preferences. */
export async function isRequiredProviderWorkEmail({templateType,to,userId,agencyId}, load = async (uid, aid) => {
  const [{default:User},{default:pool}] = await Promise.all([import('../models/User.model.js'),import('../config/database.js')]);
  const user = await User.findById(uid);
  const [rows] = await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1',[uid,aid]);
  return {user,member:rows.length===1};
}) {
  if (templateType!=='client_appointment_reply' || !Number(userId) || !Number(agencyId) || typeof to!=='string') return false;
  const {user,member}=await load(Number(userId),Number(agencyId));
  return !!member && !!user && ['provider','provider_plus','intern','intern_plus','supervisor'].includes(user.role)
    && user.is_active!==false && user.is_active!==0
    && !!normalize(user.work_email || user.email)
    && normalize(to)===normalize(user.work_email || user.email);
}
