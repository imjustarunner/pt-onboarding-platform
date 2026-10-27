export const familyBillingRoutes = [
  {path:'/admin/family-billing',name:'UnscopedFamilyBillingDesk',component:()=>import('../views/admin/FamilyBillingDesk.vue'),meta:{requiresAuth:true,requiresRole:['admin','agency_admin','super_admin','support','staff','backoffice_admin']}},
  {path:'/:organizationSlug/admin/family-billing',name:'FamilyBillingDesk',component:()=>import('../views/admin/FamilyBillingDesk.vue'),meta:{requiresAuth:true,organizationSlug:true,requiresRole:['admin','agency_admin','super_admin','support','staff','backoffice_admin']}},
  {path:'/admin/account-support',name:'AccountSupport',component:()=>import('../views/admin/AccountSupportView.vue'),meta:{requiresAuth:true,requiresRole:['admin','super_admin','support']}},
  {path:'/:organizationSlug/admin/account-support',name:'OrganizationAccountSupport',component:()=>import('../views/admin/AccountSupportView.vue'),meta:{requiresAuth:true,organizationSlug:true,requiresRole:['admin','super_admin','support']}},
];
