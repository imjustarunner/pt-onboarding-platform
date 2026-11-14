export function officeBookingProgressText(job) {
  const total = Number(job.total) || 1, done = Number(job.completed) || 0;
  const label = ({ preparing: 'Preparing your reserved dates', checking: 'Checking room and appointment conflicts',
    saving: 'Saving client sessions', finishing: 'Setting up reminders and calendar copies', complete: 'Sessions scheduled' })[job.phase] || 'Scheduling sessions';
  return `${label}: ${done} of ${total}.${job.status === 'queued' ? ' Queued to continue.' : ''} Your booking continues if you close this window.`;
}

/** The POST queues durable work. Polling observes it; it never resubmits a series. */
export async function submitOfficeBooking(api, payload, { onProgress = () => {}, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now } = {}) {
  const response = await api.post('/office-schedule/booking-requests', { ...payload, asyncOwnedSession: true });
  if (response.data?.kind !== 'booking_job') return response;
  let job = response.data.job;
  const deadline = now() + 20 * 60 * 1000;
  while (true) {
    onProgress(officeBookingProgressText(job));
    if (job.status === 'completed') return { data: job.result };
    if (job.status === 'failed') throw new Error(job.error || 'Scheduling paused. Submit the same booking to continue safely.');
    if (now() >= deadline) throw new Error('This booking is still processing in the background. Reopen the same booking to check its progress; do not create a different booking.');
    await pause(2000);
    try { job = (await api.get(`/office-schedule/booking-jobs/${job.id}`, { skipGlobalLoading: true, timeout: 15000 })).data.job; }
    catch { throw new Error('Could not check booking progress. Your booking continues in the background. Reopen the same booking to check it.'); }
  }
}
