// Payroll no longer starts office-confirmation or expiry cycles. Reservation use
// is assessed by the office watchdog, separately from payroll publication.
export class OfficeScheduleReviewService {
  static async listProvidersNeedingBiweeklyReview() { return []; }
  static async emitBiweeklyReviewNotifications() { return { ok: true, providers: 0, notificationsSent: 0, retired: true }; }
}
