const image = name => `/assets/ptco/${name}.webp`;
export const ptcoNav = [['Home',''],['About','about'],['Services','services'],['Products','products'],['Plot Twist HQ','hq'],['Industries','industries'],['Resources','resources']];
export const ptcoServices = [
  {
    id:'medical-billing', title:'Medical Billing & Revenue Cycle', icon:'wallet', label:'Your EHR or AuricWell',
    body:'Claims, payments, denials, patient billing, ERA posting, and revenue cycle follow-through.',
    detail:'Plot Twist Co. manages medical billing in your existing EHR, or through our EHR, AuricWell. Get focused billing support or make it part of a broader back-office partnership.',
    includes:['Claims preparation and submission','Denial follow-up and corrected claims','Payment and ERA posting','Accounts receivable tracking and follow-up','Patient statements and balance workflows','Revenue cycle reporting and regular review'],
    process:['Review your EHR, payer mix, and billing workflow.','Agree on access, responsibilities, reporting, and a custom quote.','Coordinate the transition and ongoing billing follow-through.'],
    pricing:'Billing is quoted for your organization, based on your EHR, claim volume, payer mix, and the support you need. Existing-EHR and AuricWell options are scoped separately.',
    related:['credentialing','financial','operations']
  },
  {
    id:'credentialing', title:'Credentialing & Payer Management', icon:'document', label:'Through Plot Twist Co.',
    body:'Provider enrollment, renewals, document management, and ongoing payer coordination.',
    detail:'Keep provider credentialing and payer enrollment moving with Plot Twist Co. Choose credentialing on its own, pair it with medical billing, or include it in your management partnership.',
    includes:['Provider information and document collection','Payer enrollment application coordination','Application status tracking and follow-up','Renewal and recredentialing calendars','Practice and provider information updates','Coordination between enrollment and billing teams'],
    process:['Identify providers, practice locations, and payers.','Organize required documents and submit agreed applications.','Track responses, follow up, and plan upcoming renewals.'],
    pricing:'Request a credentialing quote based on your providers, payers, locations, and ongoing support needs. Credentialing is scoped separately from billing; payer approval and timing remain with the payer.',
    related:['medical-billing','people','operations']
  },
  {
    id:'people', title:'People Operations', icon:'people', label:'Powered by Plotline',
    body:'Recruiting, hiring, onboarding, training, HR support, and payroll coordination.',
    detail:'Plot Twist Co. supports your people operations through Plotline, connecting the work of hiring, welcoming, supporting, and developing your team.',
    includes:['Recruiting and hiring workflows','Onboarding and company documents','Training and ongoing team development','Handbooks and HR workflow coordination','Payroll schedules, approvals, and benefits coordination','Performance and employee support processes'],
    process:['Map your team’s journey and current responsibilities.','Set up the people workflows and support you need.','Keep onboarding, training, and everyday team operations moving.'],
    pricing:'Choose managed people operations through Plot Twist Co. or explore Plotline as a standalone product. Your managed-service quote defines the work our team handles.',
    product:'plotline', related:['payroll','operations','strategy']
  },
  {
    id:'website', title:'Website & Brand Management', icon:'screen', label:'A clearer public presence',
    body:'Responsive websites, branding, content, and connected intake experiences.',
    detail:'Build a public presence that makes your organization easy to understand and easier to reach. We connect your message, visual identity, website, and intake experience.',
    includes:['Website planning and responsive design','Brand messaging and visual consistency','Service pages and useful content','Connected contact and intake experiences','Website updates and ongoing content care','Coordination with marketing and outreach'],
    process:['Clarify your audience, services, and brand.','Build the pages and paths your visitors need.','Keep the experience current as your organization grows.'],
    pricing:'Request a quote for a focused website project, ongoing management, or website support within a full-service partnership.',
    related:['marketing','strategy','operations']
  },
  {
    id:'operations', title:'Business Operations & Compliance', icon:'settings', label:'Stronger everyday systems',
    body:'Policies, documentation, compliance coordination, internal reviews, and risk management.',
    detail:'Make the work behind your mission clearer and more consistent. We help organize responsibilities, policies, documentation, and the processes your team relies on.',
    includes:['Policy and procedure development','Operational workflow design','HIPAA and 42 CFR Part 2 compliance coordination','Internal reviews and documentation follow-up','Risk tracking and action plans','Cross-team responsibilities and reporting'],
    process:['Identify the gaps and friction in your current operations.','Agree on priorities, owners, and documentation.','Put practical processes in place and review progress.'],
    pricing:'Operational support is scoped to your organization’s workflows and needs, as a focused engagement or part of ongoing management.',
    related:['credentialing','people','strategy']
  },
  {
    id:'marketing', title:'Marketing & Outreach', icon:'megaphone', label:'Grow your reach',
    body:'Strategy, campaigns, social media, community outreach, and content that shares your mission.',
    detail:'Help the right people find and understand your organization. We bring your message, content, and community relationships into a practical outreach plan.',
    includes:['Marketing and communication planning','Campaign and content calendars','Social media coordination','Community and referral outreach','Educational and brand content','Campaign review and next-step planning'],
    process:['Define your audience and the goals that matter.','Build a focused message and outreach plan.','Coordinate delivery and review what comes next.'],
    pricing:'Discuss a campaign, ongoing marketing support, or an outreach plan within your management partnership.',
    related:['website','strategy','operations']
  },
  {
    id:'financial', title:'Financial Management', icon:'chart', label:'Nonprofit support · FundThred',
    body:'Budgets, grant and expense tracking, donor records, and reporting through FundThred.',
    detail:'Connect your financial work to your mission. Plot Twist Co. supports budgeting, financial organization, and reporting, with FundThred for focused nonprofit financial support.',
    includes:['Budget planning and monitoring','Grant and restricted-fund tracking','Expense organization and review','Donor and contribution tracking','Financial reporting coordination','Clear responsibilities and review schedules'],
    process:['Review your funding, reporting needs, and existing records.','Agree on budgets, tracking, and review responsibilities.','Maintain a clearer view of resources and next steps.'],
    pricing:'Financial management can be part of your Plot Twist Co. partnership. If this is the only support you need, explore FundThred as a standalone service and request a tailored scope.',
    product:'fundthred', related:['medical-billing','payroll','strategy']
  },
  {
    id:'strategy', title:'Strategic Support & Growth', icon:'rocket', label:'Plan your next chapter',
    body:'Planning, process improvement, new programs, business setup, and growth support.',
    detail:'Turn your next stage into a practical plan. Whether you are launching, restructuring, or expanding, we help connect your goals to the people, systems, and steps required.',
    includes:['Business launch and setup planning','Organizational priorities and roadmaps','Program development','Process improvement','Growth and restructuring support','Implementation and progress reviews'],
    process:['Define the change you want to make.','Build a plan with responsibilities and realistic milestones.','Work through implementation and adjust as you learn.'],
    pricing:'Start with a focused planning engagement or connect strategic support to your ongoing Plot Twist Co. partnership.',
    related:['business-setup','financial','people']
  },
  {
    id:'business-setup', title:'Business Setup', icon:'rocket', featured:false,
    body:'Turn your vision into a solid foundation.', detail:'Map your launch, clarify responsibilities, and organize the practical steps of starting your business.',
    includes:['Launch planning','Responsibilities and workflow setup','Systems and document organization'],
    process:['Define your services.','Plan the essentials.','Prepare to launch.'], pricing:'Request a scope and quote for your business launch.', related:['strategy','website','credentialing']
  },
  {
    id:'payroll', title:'Payroll Coordination', icon:'wallet', featured:false,
    body:'Bring clarity to every pay cycle.', detail:'Connect your people, pay schedules, approvals, and payroll operations through Plot Twist Co. and Plotline.',
    includes:['Pay schedules and approvals','Payroll workflow coordination','Team records and responsibilities'],
    process:['Review your pay process.','Set responsibilities and approvals.','Coordinate each cycle.'], pricing:'Ask about payroll coordination on its own or within managed people operations.', product:'plotline', related:['people','financial','operations']
  }
];
export const ptcoFeaturedServices = ptcoServices.filter(service => service.featured !== false);
export const ptcoServicePath = id => `/p/ptco/services/${id}`;
export const ptcoFullService = {
  id:'full-service', title:'Full-Service Partnership', icon:'layers',
  detail:'Bring billing, credentialing, people, finances, websites, and operations into one coordinated plan. Plot Twist Co. becomes your dedicated back-office partner, with a scope built around your organization.',
  includes:['A coordinated plan across the services you choose','A primary point of contact','Clear responsibilities and regular reporting','Connected systems where they fit your work','Room to adjust support as your organization grows','Your purpose and identity remain at the center'],
  process:['Talk through your organization and priorities.','Choose the services, systems, responsibilities, and pricing.','Build a transition plan and begin working together.'],
  pricing:'Every partnership is quoted individually. Your agreement identifies the included services, systems, responsibilities, and fees before work begins.',
  related:['medical-billing','people','financial']
};
export const ptcoIntakeServices = [...ptcoServices, {id:'full-service',title:'Full-Service Partnership'}, {id:'hq',title:'Plot Twist HQ'}, {id:'plotline',title:'Plotline · Standalone people operations'}, {id:'fundthred',title:'FundThred · Standalone financial support'}];
export const ptcoIndustries = [
  {id:'mental-health', title:'Mental Health Agencies', image:image('mental-health'), body:'Support the people who care for others, from business operations to connected client workflows.'},
  {id:'consulting', title:'Consultants', image:image('consulting'), body:'Keep engagements, sessions, documents, and the next steps for your clients organized.'},
  {id:'coaching', title:'Coaches', image:image('coaching'), body:'Connect programs, scheduling, client goals, and the work that happens between sessions.'},
  {id:'life-coaching', title:'Life Coaches', image:image('life-coaching'), body:'Create a consistent experience for clients while building a sustainable practice.'},
  {id:'tutoring', title:'Tutors', image:image('tutoring'), body:'Coordinate learners, guardians, sessions, programs, and progress in one place.'},
  {id:'other', title:'Other Service Businesses', image:image('businesses'), body:'Tell us how your business works. Together, we can identify the support that fits.'}
];
export const ptcoPaths = [
  {id:'starting',title:'Starting a Business',icon:'rocket',body:'Get support to turn your vision into a solid foundation.'},
  {id:'operations',title:'Need Operational Support',icon:'settings',body:'Strengthen your systems and get back to what you do best.'},
  {id:'hq',title:'Looking for Plot Twist HQ',icon:'screen',body:'Explore a connected workspace for service businesses.'},
  {id:'growth',title:'Growing or Restructuring',icon:'chart',body:'Plan your next stage with purpose and clarity.'}
];
export const ptcoHqFeatures = [
  {id:'clients',title:'Clients & care',icon:'people',body:'Keep client and guardian workflows connected.', bullets:['Client access and multiple authorized guardians','Configurable public enrollment links and intake','Treatment-goal history and check-in feedback'],steps:['Collect intake','Review information','Coordinate care']},
  {id:'documentation',title:'Practice Notes & supervision',icon:'document',body:'Carry clinical context into guided, clinician-reviewed documentation.',bullets:['AI drafting and authorized transcription','Configurable treatment plans and historical objective ratings','Amendments, review queues and required signatures'],steps:['Set the context','Draft and review','Sign or route for approval']},
  {id:'scheduling',title:'Scheduling & programs',icon:'calendar',body:'Connect the work on your calendar to the people you serve.',bullets:['Provider availability and client confirmation status','Configured text and email reminders','Room reservations, kiosk arrivals and programs'],steps:['Set availability','Book a session','Follow through']},
  {id:'team',title:'People & operations',icon:'settings',body:'Give your team a clear place to start and a repeatable way to work.',bullets:['Team onboarding and training','Documents and operational tasks','Payroll schedules and approval workflows'],steps:['Invite your team','Assign onboarding','Track completion']},
  {id:'billing',title:'Billing & payments',icon:'wallet',body:'Bring billing responsibilities and payment workflows together.',bullets:['Responsible payer and guardian permissions','Insurance and payment information','Invoices, receipts, and payment tasks'],steps:['Confirm responsibility','Review charges','Record payment']},
  {id:'brand',title:'Your brand & workspace',icon:'screen',body:'Your business keeps its identity, with a workspace organized around it.',bullets:['Tenant branding and public pages','Service catalogs and feature settings','Affiliated schools and programs managed separately'],steps:['Build your profile','Choose services','Connect your locations']}
];
export const ptcoResources = [
  {id:'launch',title:'Your business launch checklist',intro:'A useful starting point for your first conversation.',items:['Define who you serve and the services you offer.','Identify the people responsible for business, clinical, and financial decisions.','Gather business identity, contact, and location information.','List the systems, documents, and processes you use today.','Decide what needs to be ready for your first client.']},
  {id:'transition',title:'Planning a system transition',intro:'Make the move deliberately, with your team involved.',items:['Inventory current workflows and decide who owns each one.','Identify the information that must move and who may access it.','Agree on migration, verification, and training responsibilities.','Test the experience with a small set of sample records.','Choose a launch window and a process for resolving issues.']},
  {id:'workspace',title:'Companies, schools, and programs',intro:'Keep ownership and affiliation clear.',items:['Your company is the tenant: it owns its workspace, branding, billing, and team access.','Schools and programs are affiliated organizations connected to a tenant.','An affiliation does not make a school a separate company account.','Access must be assigned explicitly for each organization and role.']}
];
