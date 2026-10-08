export const fundthredPages = {
  home: { title: 'FundThred | Follow the thread of every dollar', description: 'Finance operations for nonprofits. Connect funding, budgets, requests, approvals, spending, and proof in one workspace.' },
  product: { title: 'The FundThred platform | Finance operations', description: 'Explore funding, budgeting, expense approvals, documents, and operational reporting with FundThred.' },
  solutions: { title: 'FundThred solutions | From funding to impact', description: 'Financial workflows for nonprofits, community programs, foundations, and sponsored organizations.' },
  pricing: { title: 'FundThred pricing & bundles', description: 'Explore FundThred plans for one organization or a growing network, with optional PlotTwistCo product bundles.' },
  resources: { title: 'FundThred resources | Clearer financial stewardship', description: 'Practical guides to restricted funding, expense requests, reporting, and reconciliation.' },
  start: { title: 'Meet FundThred | Request a demo', description: 'Tell us about your organization and build a finance operations workspace around your mission.' }
};

export const fundthredModules = [
  { id: 'funds', title: 'Track funding', icon: 'funds', tone: 'green', body: 'Keep grants, donations, restrictions, and received funds in view.', detail: 'Record grant awards and money received separately. Give every fund a purpose, keep its restrictions visible, and connect it to program budgets.' },
  { id: 'budgets', title: 'Budgets & allocations', icon: 'budgets', tone: 'purple', body: 'Give each program a plan and every dollar a purpose.', detail: 'Set approved budgets and assign spending authority to program activities. Track paid expenses and outstanding commitments against what is available.' },
  { id: 'expenses', title: 'Requests & approvals', icon: 'expenses', tone: 'blue', body: 'Submit, review, and follow expenses with the full context.', detail: 'Attach evidence to a request, ask for more information, and follow the review. Approval reserves budget before a payment is recorded.' },
  { id: 'payments', title: 'Spending & payments', icon: 'payments', tone: 'amber', body: 'Record completed payments and follow approved spending.', detail: 'Keep payment dates, external references, and spending decisions together. FundThred records payments made through your payment provider or bank.' },
  { id: 'documents', title: 'Documents & proof', icon: 'documents', tone: 'green', body: 'Keep receipts, invoices, and agreements connected.', detail: 'Attach supporting documents to expenses, grants, and reporting requests. Shared documents and finance-team-only evidence follow organization permissions.' },
  { id: 'reports', title: 'Reporting', icon: 'reports', tone: 'blue', body: 'See spending, follow deadlines, and export your records.', detail: 'Review program budgets, paid expenses, commitments, and grant utilization. Export operational CSV reports for your accountant and reporting process.' },
  { id: 'donations', title: 'Donor receipts', icon: 'donations', tone: 'purple', body: 'Follow confirmed donations and acknowledgment delivery.', detail: 'MH4Kidz can review confirmed gifts and receipt delivery through its configured donation workflow. Additional organization donation setups are reviewed during onboarding.' },
  { id: 'bank', title: 'Reconciliation', icon: 'bank', tone: 'teal', body: 'Match optional bank evidence to recorded spending.', detail: 'With organization consent and bank connectivity enabled, review imported activity and match it to paid expenses. Bank activity does not create duplicate expenses.' }
];

export const fundthredAudiences = [
  { name: 'Nonprofits', icon: 'funds', tone: 'green', body: 'Keep grants, donations, and program spending aligned with your mission.' },
  { name: 'Foundations', icon: 'bank', tone: 'purple', body: 'Connect funding restrictions, program budgets, and reporting evidence.' },
  { name: 'School programs', icon: 'programs', tone: 'blue', body: 'Organize funding and expenses around the programs serving students.' },
  { name: 'Community organizations', icon: 'partners', tone: 'amber', body: 'Bring local projects, shared resources, and financial decisions together.' },
  { name: 'Multi-program teams', icon: 'allocations', tone: 'teal', body: 'Follow individual program budgets inside a common financial workspace.' },
  { name: 'Fiscal sponsors', icon: 'shield', tone: 'purple', body: 'Support authorized organizations while each team sees its own program portal.' }
];

export const fundthredGuides = [
  { id: 'funding', label: '01 / Funding', title: 'Give every fund a clear purpose.', intro: 'Start with the source, the restrictions, and the program it supports.', steps: ['Record the funder and grant agreement.', 'Separate the award amount from cash actually received.', 'Document permitted uses and relevant dates.', 'Assign the funding to approved program budgets.', 'Set reporting deadlines and keep the supporting documents together.'] },
  { id: 'expenses', label: '02 / Spending', title: 'A better expense request.', intro: 'Give the reviewer the context they need to make a decision.', steps: ['Choose the program and describe the purpose.', 'Enter the date, payee, and requested amount.', 'Attach the receipt, invoice, or other supporting evidence.', 'Submit for review and respond to any questions.', 'Record the completed external payment and its reference after approval.'] },
  { id: 'reports', label: '03 / Oversight', title: 'Close the loop with your accountant.', intro: 'Turn connected records into a clear handoff.', steps: ['Review pending requests and approved commitments.', 'Match available bank evidence to recorded payments.', 'Resolve missing receipts and discrepancies.', 'Export expenses, program budgets, and grant utilization as permitted.', 'Have your accountant reconcile the ledger and prepare final financial statements.'] }
];

export const fundthredFaqs = [
  ['Does FundThred replace QuickBooks?', 'FundThred currently manages finance operations: funding, budgets, requests, approvals, proof, and operational reporting. Your accounting software maintains the ledger and financial statements. CSV exports support the handoff; automatic QuickBooks or Xero synchronization is not included today.'],
  ['Can we use FundThred on its own?', 'Yes. FundThred is a focused entrance into the platform. Your team can use finance operations and add other products when they fit your work. PlotTwistHQ brings your enabled products together.'],
  ['Can we combine it with other products?', 'You can request a bundle with Plotline, Conversa, SchoolCareBridge, or broader HQ services. We confirm product access, setup, and the combined price before activation.'],
  ['Can a program team see every organization’s finances?', 'No. The server checks organization membership and finance permissions. Program teams have a limited portal; authorized finance managers oversee the organizations assigned to them.'],
  ['Does an approved request send money?', 'No. Approval reserves budget. A finance manager records the payment after it is completed through your bank or payment provider.'],
  ['What happens when we choose a plan?', 'Choosing a plan sends a request to the team. We review your organization count, setup, and any bundles with you. It does not start a subscription or charge a card.']
];
