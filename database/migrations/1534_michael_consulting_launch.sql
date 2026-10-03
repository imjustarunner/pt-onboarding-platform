-- Michael consulting: public identity and the actual practitioner payment catalog.
-- Idempotent inserts preserve existing package prices and administrator decisions.
SET @michael_agency_id := (SELECT id FROM agencies WHERE slug='michael' AND organization_type='consultant' LIMIT 1);
SET @michael_owner_id := (SELECT u.id FROM users u JOIN agencies a ON a.account_owner_user_id=u.id WHERE a.id=@michael_agency_id AND LOWER(u.first_name)='michael' AND LOWER(u.last_name)='mendez' LIMIT 1);
UPDATE agencies SET website_url='https://plottwisthq.com/michael',
 support_team_email=COALESCE(NULLIF(support_team_email,''),'michael@plottwistco.com'),
 color_palette=JSON_OBJECT('primary','#243e35','secondary','#f9f7f1','accent','#b04a2c')
 WHERE id=@michael_agency_id;
INSERT INTO agency_business_types (agency_id,business_type,is_enabled,sort_order)
 SELECT @michael_agency_id,'consulting',1,0 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM agency_business_types WHERE agency_id=@michael_agency_id AND business_type='consulting');

INSERT INTO public_marketing_pages (slug,title,is_active,page_type,hero_title,hero_subtitle,branding_json)
 SELECT 'michael','Michael V. Mendez Consulting',1,'consulting_website','Your vision. A real plan. Let’s build it.',
 'Creator and orchestrator of Plot Twist HQ. Private practice launch and scaling, AI apps, business growth, and nonprofit expansion.',
 JSON_OBJECT('logoUrl','https://plottwisthq.com/assets/michael/monogram.svg')
 WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public_marketing_pages WHERE slug='michael');
INSERT INTO public_marketing_page_sources (page_id,source_type,source_id,is_active)
 SELECT p.id,'agency',@michael_agency_id,1 FROM public_marketing_pages p
 WHERE p.slug='michael' AND @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM public_marketing_page_sources s WHERE s.page_id=p.id AND s.source_type='agency' AND s.source_id=@michael_agency_id);
INSERT INTO public_website_support_sites (slug,name,website_url,support_agency_id,relationship_type,industries_json,logo_url,accent_color,chat_enabled)
 SELECT 'michael','Michael V. Mendez Consulting','https://plottwisthq.com/michael',@michael_agency_id,'associate',
 JSON_ARRAY('Consulting · Private practice launch & scaling','AI & app development','Business & nonprofit growth'),
 'https://plottwisthq.com/assets/michael/monogram.svg','#243e35',0
 WHERE @michael_agency_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public_website_support_sites WHERE slug='michael');

-- Clarity Session: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'Clarity Session','One 60-minute session. Work through a specific question before committing to a bigger project. Includes: A brief pre-session questionnaire; One 60-minute working session; A written decision summary and next steps. A focused advisory session. Implementation is scoped separately.',1,25000,'PAY_IN_FULL',25000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,0,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='Clarity Session');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','Clarity Session','One 60-minute session. Work through a specific question before committing to a bigger project. Includes: A brief pre-session questionnaire; One 60-minute working session; A written decision summary and next steps. A focused advisory session. Implementation is scoped separately.','prepaid_bundle',1,25000,
 JSON_OBJECT('website',JSON_OBJECT('key','clarity','scope','A focused advisory session. Implementation is scoped separately.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Clarity Session');

-- Practice Launch Sprint: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'Practice Launch Sprint','4 weeks · 4 working sessions. Connect your offer, client experience, and operations into a realistic launch plan. Includes: Service positioning and pricing worksheet; Inquiry-to-payment client journey; Technology and workflow recommendations; A prioritized launch checklist and handoff. One practice and one primary service model. Filing, credentialing, legal review, and software subscriptions are separate.',4,250000,'PAY_IN_FULL',250000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,1,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='Practice Launch Sprint');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','Practice Launch Sprint','4 weeks · 4 working sessions. Connect your offer, client experience, and operations into a realistic launch plan. Includes: Service positioning and pricing worksheet; Inquiry-to-payment client journey; Technology and workflow recommendations; A prioritized launch checklist and handoff. One practice and one primary service model. Filing, credentialing, legal review, and software subscriptions are separate.','consulting_project',4,250000,
 JSON_OBJECT('website',JSON_OBJECT('key','practice','scope','One practice and one primary service model. Filing, credentialing, legal review, and software subscriptions are separate.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Practice Launch Sprint');

-- Practice Scaling Sprint: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'Practice Scaling Sprint','8 weeks · 6 working sessions. Grow beyond a full caseload with an operating model that supports your team and the people you serve. Includes: Practice capacity, referral, and client-flow assessment; Solo-to-group or team-expansion model and role map; One priority intake, scheduling, or billing workflow redesign; 90-day growth plan with hiring assumptions and measures. One practice and one growth scenario. Recruiting, payer credentialing, legal review, new-location setup, and implementation are separate.',6,500000,'PAY_IN_FULL',500000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,2,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='Practice Scaling Sprint');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','Practice Scaling Sprint','8 weeks · 6 working sessions. Grow beyond a full caseload with an operating model that supports your team and the people you serve. Includes: Practice capacity, referral, and client-flow assessment; Solo-to-group or team-expansion model and role map; One priority intake, scheduling, or billing workflow redesign; 90-day growth plan with hiring assumptions and measures. One practice and one growth scenario. Recruiting, payer credentialing, legal review, new-location setup, and implementation are separate.','consulting_project',6,500000,
 JSON_OBJECT('website',JSON_OBJECT('key','scale','scope','One practice and one growth scenario. Recruiting, payer credentialing, legal review, new-location setup, and implementation are separate.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Practice Scaling Sprint');

-- AI Product Blueprint: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'AI Product Blueprint','6 weeks · 6 working sessions. Define a useful first version before investing in custom development. Includes: User and workflow discovery; Product requirements and key screen flows; Architecture, data, and AI review plan; Build phases, priorities, and an implementation estimate. One product concept. A production application is a separately scoped build.',6,500000,'PAY_IN_FULL',500000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,3,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='AI Product Blueprint');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','AI Product Blueprint','6 weeks · 6 working sessions. Define a useful first version before investing in custom development. Includes: User and workflow discovery; Product requirements and key screen flows; Architecture, data, and AI review plan; Build phases, priorities, and an implementation estimate. One product concept. A production application is a separately scoped build.','consulting_project',6,500000,
 JSON_OBJECT('website',JSON_OBJECT('key','ai','scope','One product concept. A production application is a separately scoped build.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='AI Product Blueprint');

-- Growth Systems Sprint: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'Growth Systems Sprint','8 weeks · 6 working sessions. Find the operational constraints and design a model your team can repeat. Includes: Capacity and bottleneck assessment; Roles, handoffs, and priority workflow map; One expansion or partnership opportunity plan; 90-day execution plan with owners and measures. One business unit and one growth priority. Hiring, rollout, and ongoing management are scoped separately.',6,500000,'PAY_IN_FULL',500000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,4,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='Growth Systems Sprint');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','Growth Systems Sprint','8 weeks · 6 working sessions. Find the operational constraints and design a model your team can repeat. Includes: Capacity and bottleneck assessment; Roles, handoffs, and priority workflow map; One expansion or partnership opportunity plan; 90-day execution plan with owners and measures. One business unit and one growth priority. Hiring, rollout, and ongoing management are scoped separately.','consulting_project',6,500000,
 JSON_OBJECT('website',JSON_OBJECT('key','growth','scope','One business unit and one growth priority. Hiring, rollout, and ongoing management are scoped separately.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Growth Systems Sprint');

-- Impact Expansion Lab: written scope is agreed before a private payment invitation.
INSERT INTO practitioner_session_packages
 (agency_id,name,description,session_count,price_cents,payment_mode_default,pay_in_full_price_cents,allowed_payment_modes_json,missed_session_policy_json,is_active,sort_order,created_by_user_id)
 SELECT @michael_agency_id,'Impact Expansion Lab','90 days · 6 leadership working sessions. Translate a strong local program into a responsible expansion plan. Includes: Readiness assessment and up to 3 stakeholder interviews; Repeatable program and delivery model; Partnership map and pilot budget assumptions; Board-ready roadmap, measures, and pilot recommendation. One program and one expansion scenario. Grant writing, fundraising, travel, and pilot delivery are separate.',6,750000,'PAY_IN_FULL',750000,
 JSON_ARRAY('PAY_IN_FULL'),JSON_OBJECT('type','custom','freeRebooks',0,'feeCents',0,'note','Rescheduling, cancellation, and refund terms are confirmed in the written engagement agreement before purchase.'),1,5,@michael_owner_id
 WHERE @michael_agency_id IS NOT NULL AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM practitioner_session_packages WHERE agency_id=@michael_agency_id AND name='Impact Expansion Lab');
INSERT INTO booking_packages
 (agency_id,business_type,name,description,package_type,session_count,price_cents,domain_config_json,allowed_tenant_service_ids_json,consume_on,is_active,is_public)
 SELECT @michael_agency_id,'consulting','Impact Expansion Lab','90 days · 6 leadership working sessions. Translate a strong local program into a responsible expansion plan. Includes: Readiness assessment and up to 3 stakeholder interviews; Repeatable program and delivery model; Partnership map and pilot budget assumptions; Board-ready roadmap, measures, and pilot recommendation. One program and one expansion scenario. Grant writing, fundraising, travel, and pilot delivery are separate.','consulting_project',6,750000,
 JSON_OBJECT('website',JSON_OBJECT('key','impact','scope','One program and one expansion scenario. Grant writing, fundraising, travel, and pilot delivery are separate.')),JSON_ARRAY(),'complete',1,1
 WHERE @michael_agency_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM booking_packages WHERE agency_id=@michael_agency_id AND name='Impact Expansion Lab');

INSERT INTO staff_service_assignments (agency_id,tenant_service_id,user_id,is_active)
 SELECT @michael_agency_id,s.id,@michael_owner_id,1 FROM tenant_services s
 WHERE s.agency_id=@michael_agency_id AND s.service_code='MICHAEL_CLARITY' AND @michael_owner_id IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM staff_service_assignments a WHERE a.tenant_service_id=s.id AND a.user_id=@michael_owner_id);
