const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Task titles and descriptions can contain patient information. Keep them behind sign-in.
export function taskAssignmentMessage(url) {
  return { subject: 'New task assigned',
    text: `New task assigned to you.\n\nSign in with your work account to view it:\n${url}`,
    html: `<h2>New task assigned to you</h2><p>Sign in with your work account to view your task.</p><p><a href="${escapeHtml(url)}">Sign in and view task</a></p>` };
}

export function createTaskAssignmentEmailService(deps) {
  return async ({ task, actorUserId }) => {
    const userId = Number(task?.assigned_to_user_id ?? task?.assignedToUserId);
    const agencyId = Number(task?.assigned_to_agency_id ?? task?.assignedToAgencyId) || null;
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(Number(task?.id)) || Number(task.id) < 1
      || userId === Number(actorUserId) || ['waiting','completed','cancelled','canceled'].includes(task.status)) return { skipped: true, reason: 'not_actionable_assignment' };
    if (agencyId && !await deps.activeMember(userId, agencyId)) return { skipped: true, reason: 'inactive_membership' };
    const user = await deps.user(userId);
    const email = String(user?.work_email || user?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || [false,0,'0'].includes(user?.is_active) || [true,1,'1'].includes(user?.login_is_group_email) || user?.role === 'assistant') return { skipped: true, reason: 'no_individual_work_account' };
    const sender = await deps.sender(agencyId);
    if (!sender || !/^task@/i.test(sender.from_email || '') || Number(sender.agency_id || 0) !== Number(agencyId || 0) || ![true,1,'1'].includes(sender.is_active)) {
      const error=Object.assign(new Error('Configure an approved task@ sender for this organization before sending task assignment email.'), { code: 'TASK_SENDER_NOT_CONFIGURED' });
      await deps.logFailure?.({to:email,subject:'New task assigned',agencyId,userId,generatedByUserId:actorUserId || null,templateType:'custom_task_assigned',deliveryStatus:'failed',errorMessage:error.message,metadata:{taskId:Number(task.id),reason:error.code}});
      throw error;
    }
    const url = await deps.signInUrl(agencyId, Number(task.id));
    return deps.send({ agencyId, userId, to: email, senderIdentityId: sender.id, generatedByUserId: actorUserId || null,
      templateType: 'custom_task_assigned', source: 'auto', ...taskAssignmentMessage(url) });
  };
}

export async function sendTaskAssignmentEmail(input) {
  const [{default:User},{default:Agency},{default:pool},{default:EmailSenderIdentity},{sendEmailFromIdentity,logSkippedOrFailedEmail},{buildPublicAppUrl}] = await Promise.all([
    import('../models/User.model.js'), import('../models/Agency.model.js'), import('../config/database.js'),
    import('../models/EmailSenderIdentity.model.js'), import('./unifiedEmail/unifiedEmailSender.service.js'), import('../utils/publicPortalUrl.js')
  ]);
  return createTaskAssignmentEmailService({ user: id => User.findById(id),
    activeMember: async (userId, agencyId) => (await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1', [userId, agencyId]))[0].length === 1,
    sender: async agencyId => {
      const identities = await EmailSenderIdentity.list({agencyId,includePlatformDefaults:false,onlyActive:true});
      const matches = identities.filter(identity => /^task@/i.test(identity.from_email || ''));
      return matches.length === 1 ? matches[0] : null;
    },
    signInUrl: async (agencyId, taskId) => {
      const agency = agencyId ? await Agency.findById(agencyId) : null;
      const target = new URL(buildPublicAppUrl(agency, `tasks?taskId=${taskId}`));
      const login = new URL(buildPublicAppUrl(agency, 'login'));
      login.searchParams.set('redirect', `${target.pathname}${target.search}`);
      return login.href;
    }, send: sendEmailFromIdentity, logFailure:logSkippedOrFailedEmail })(input);
}
