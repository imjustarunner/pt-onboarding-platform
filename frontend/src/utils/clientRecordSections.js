export const CLIENT_RECORD_SECTIONS = [
  { key: 'comments', label: 'Patient comments', placeholder: 'Patient Comments\nPaste administrative comments…', rows: 4, hint: 'Saved to Administrative note on the overview. Accessible to assigned providers, support, and administrators.' },
  { key: 'demographics', label: 'Patient info', placeholder: 'Patient Information\nLegal Name\nDate of Birth\n…' },
  { key: 'contacts', label: 'Additional contacts', placeholder: 'Paste Contacts, including names, relationships, phones, email, and other details…', hint: 'Paste the parent and other contact cards below Patient info. Source ROI and reminder details remain available for review.' },
  { key: 'insurance', label: 'Insurance', placeholder: 'Paste the coverage’s carrier, member ID, policy holder and payer details from TherapyNotes…', hint: 'Paste primary and secondary coverage separately. Known payer routes link automatically and coverage checks run through the agency’s configured verification service. Unresolved results go to billing review.' },
  { key: 'payer', label: 'Payer information', placeholder: 'Payer Information\nPayer Name\nNetwork\nBilling Method\nInsurance Type\nPayer ID\nAddress', hint: 'After import, confirm the matching electronic payer below. A TherapyNotes payer ID alone does not verify the route.' },
  { key: 'billingComments', label: 'Billing comments', placeholder: 'Billing Comments\nPaste billing comments…', rows: 4 },
  { key: 'intake', label: 'Intake', placeholder: 'Paste intake note text…', rows: 8 },
  { key: 'plan', label: 'Treatment plan', placeholder: 'Paste treatment plan text…', rows: 8 }
];
