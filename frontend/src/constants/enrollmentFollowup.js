export const ENROLLMENT_FOLLOWUP_REASONS = [
  { key: 'insurance', label: 'Insurance could not be identified', text: 'We have not yet been able to identify or confirm your insurance. Please reply with your insurance information so we can review the next steps.' },
  { key: 'tricare', label: 'A provider who accepts TRICARE is needed', text: 'We do not currently have a school-based provider available who can accept TRICARE for this enrollment.' },
  { key: 'office', label: 'Offer in-office care options', text: 'Would you be interested in discussing in-office care options? Please reply and we can help you explore availability.' },
  { key: 'school_waitlist', label: 'Keep on the school waitlist while seeking a TRICARE provider', text: 'We can keep you on the school waitlist while we look for a school-based provider who accepts TRICARE. Please let us know whether you would also like to explore in-office care in the meantime.' },
  { key: 'grant', label: 'Working with MH4Kidz on grant funding', text: 'We are working with MH4Kidz to explore grant funding that may help with services. Funding and availability are not yet confirmed, and we would be happy to discuss the current options with you.' },
  { key: 'paperwork', label: 'Enrollment paperwork is still missing', text: 'We are still missing paperwork needed to start services. Please reply if you would like help identifying or completing the remaining forms.' },
  { key: 'provider_connection', label: 'Ask whether they want help connecting with a provider', text: 'Would you like us to help connect you with a provider? Please reply so we can discuss your needs and the next steps.' }
];

export function enrollmentFollowupDraft({ schoolName = '', agencyName = 'ITSCO', reasons = [], disposition = 'inactive' } = {}) {
  const selected = new Set(reasons);
  const location = schoolName ? ` at ${schoolName}` : '';
  return {
    subject: `Checking in about starting services${location}`,
    text: [
      'Hello,',
      `We wanted to reach out one last time about starting services with ${agencyName}${location}. We know getting started can take time, and we would like to help.`,
      ...ENROLLMENT_FOLLOWUP_REASONS.filter(reason => selected.has(reason.key)).map(reason => reason.text),
      disposition === 'waitlist'
        ? 'Your enrollment will remain on the school waitlist. Please reply to this email if you would like to discuss these options or update your information.'
        : 'We are making this enrollment inactive for now. If you would still like to explore services, please reply to this email. Your reply will reopen your existing enrollment for our team to review; you do not need to submit a new enrollment.',
      'Reply to this email to reach our Schools Team. We would be glad to hear from you.',
      `Warmly,\n${agencyName} Schools Team`
    ].join('\n\n')
  };
}
