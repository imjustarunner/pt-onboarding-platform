const image = name => `/assets/ptco/${name}.webp`;
export const ptcoNav = [['Home',''],['About','about'],['Services','services'],['Plot Twist HQ','hq'],['Industries','industries'],['Resources','resources']];
export const ptcoServices = [
  {id:'business-setup', title:'Business Setup', icon:'rocket', body:'Turn your vision into a solid foundation.', detail:'Map your launch, clarify responsibilities, and organize the practical steps of starting your business.'},
  {id:'credentialing', title:'Credentialing', icon:'document', body:'Navigate the process with confidence.', detail:'Organize provider information, track requirements, and coordinate credentialing work with your team.'},
  {id:'payroll', title:'Payroll', icon:'wallet', body:'Bring clarity to every pay cycle.', detail:'Connect your people, pay schedules, approvals, and payroll operations in a consistent workflow.'},
  {id:'people', title:'People Operations', icon:'people', body:'Build and support a thriving team.', detail:'Create a clear path from hiring and onboarding to ongoing team support, training, and communication.'},
  {id:'marketing', title:'Media & Marketing', icon:'megaphone', body:'Share your mission and grow your reach.', detail:'Plan your message, coordinate campaigns, and build a public presence that reflects your business.'},
  {id:'website', title:'Website Management', icon:'screen', body:'A professional online presence, always.', detail:'Bring your brand to life through responsive public pages, useful content, and connected intake experiences.'},
  {id:'operations', title:'Operational Support', icon:'settings', body:'Smoother systems. Stronger operations.', detail:'Find the friction in everyday work and build processes your team can understand and use.'}
];
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
  {id:'clients',title:'Clients & care',icon:'people',body:'Keep client and guardian workflows connected.', bullets:['Client and guardian portals','Intake, documents, and assigned tasks','Treatment, coaching, and learning workflows'],steps:['Collect intake','Review information','Coordinate care']},
  {id:'scheduling',title:'Scheduling & programs',icon:'calendar',body:'Connect the work on your calendar to the people you serve.',bullets:['Appointments and provider availability','Packages, programs, and events','Tutoring, coaching, and consulting sessions'],steps:['Set availability','Book a session','Follow through']},
  {id:'team',title:'People & operations',icon:'settings',body:'Give your team a clear place to start and a repeatable way to work.',bullets:['Team onboarding and training','Documents and operational tasks','Payroll schedules and approval workflows'],steps:['Invite your team','Assign onboarding','Track completion']},
  {id:'billing',title:'Billing & payments',icon:'wallet',body:'Bring billing responsibilities and payment workflows together.',bullets:['Responsible payer and guardian permissions','Insurance and payment information','Invoices, receipts, and payment tasks'],steps:['Confirm responsibility','Review charges','Record payment']},
  {id:'brand',title:'Your brand & workspace',icon:'screen',body:'Your business keeps its identity, with a workspace organized around it.',bullets:['Tenant branding and public pages','Service catalogs and feature settings','Affiliated schools and programs managed separately'],steps:['Build your profile','Choose services','Connect your locations']}
];
export const ptcoResources = [
  {id:'launch',title:'Your business launch checklist',intro:'A useful starting point for your first conversation.',items:['Define who you serve and the services you offer.','Identify the people responsible for business, clinical, and financial decisions.','Gather business identity, contact, and location information.','List the systems, documents, and processes you use today.','Decide what needs to be ready for your first client.']},
  {id:'transition',title:'Planning a system transition',intro:'Make the move deliberately, with your team involved.',items:['Inventory current workflows and decide who owns each one.','Identify the information that must move and who may access it.','Agree on migration, verification, and training responsibilities.','Test the experience with a small set of sample records.','Choose a launch window and a process for resolving issues.']},
  {id:'workspace',title:'Companies, schools, and programs',intro:'Keep ownership and affiliation clear.',items:['Your company is the tenant: it owns its workspace, branding, billing, and team access.','Schools and programs are affiliated organizations connected to a tenant.','An affiliation does not make a school a separate company account.','Access must be assigned explicitly for each organization and role.']}
];
