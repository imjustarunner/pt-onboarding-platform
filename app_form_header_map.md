# App Form Header Map (Paste-Ready)

This file standardizes **field keys (headers)** across all intake/onboarding forms so legacy data can be mapped into a single set of variables without duplicates.

---

## 1) Main Onboarding & Profile Setup (Newest / Best)

### Row 1 headers (paste into Excel row 1)
```tsv
work_location	research_past_topics	research_interest	npi_status	npi_number	availability_mon	availability_tue	availability_wed	availability_thu	availability_fri	availability_sat	availability_sun	itsco_position	provider_description	ideal_client_general	how_help_general	build_empathy_general	certs_general	work_exp_general	avoid_clients_general	specialties_general	top3_specialties_general	license_type_number	license_issued	license_expires	license_upload	caqh_provider_id	medicaid_location_id	medicaid_revalidation	psych_today_status	pt_gender_ethnicity	ideal_client_clinical	how_help_clinical	build_empathy_clinical	top3_specialties_clinical	group_interest	pt_specialties_max25	pt_top3_specialties	mental_health	sexuality	other_issues	modality	age_specialty	groups	treatment_prefs_max15	certs_clinical	work_exp_clinical	avoid_clients_clinical	clients_expectations	inspires_concerns	challenges_finished	fun_questions	philosophies	why_counselor_itsco	personal_info	goals_aspirations	passions	team_activities	favorite_quotes	other_info
```

### Key → Question mapping (TSV)
```tsv
field_key	question_text
work_location	Which location will you be working at?
research_past_topics	Have you conducted any research? If so, what were the topics?
research_interest	Are you interested in conducting research?
npi_status	Do you have an NPI?
npi_number	Please list your NPI number. If we are making you one, you may leave blank and we will be in contact.
availability_mon	Please select your available days and times [Monday]
availability_tue	Please select your available days and times [Tuesday]
availability_wed	Please select your available days and times [Wednesday]
availability_thu	Please select your available days and times [Thursday]
availability_fri	Please select your available days and times [Friday]
availability_sat	Please select your available days and times [Saturday]
availability_sun	Please select your available days and times [Sunday]
itsco_position	Please select your position with ITSCO
provider_description	Description (optional)
ideal_client_general	Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why?
how_help_general	How can you help your client/s? What can you offer?
build_empathy_general	How can you build empathy and invite the potential client to reach out to you?
certs_general	Do you have any certifications?
work_exp_general	Any work experience you would like to share?
avoid_clients_general	Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them?
specialties_general	Do you have any Specialties?
top3_specialties_general	What are your top three specialities from the above?
license_type_number	What is/are your license/s and provide us the #/s (i.e., LPCC #00154326)
license_issued	Date License Issued
license_expires	Date License Expires
license_upload	Please upload a copy of your practicing license (LPCC, etc.)
caqh_provider_id	Do you have a CAQH account? If so, what is your provider ID number?
medicaid_location_id	What is your medicaid location ID Number? Or write, "I don't have a medicaid account."
medicaid_revalidation	If you have an account and know your location ID, please list your revalidation date.
psych_today_status	We may establish a psychology today profile for you if you don't already have one. Please let us know which is most accurate below.
pt_gender_ethnicity	Your gender/ethnicity (used for the psych today profile for clients with a preference to choose you) if applicable.
ideal_client_clinical	Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why? (Clinical)
how_help_clinical	How can you help your client/s? Talk about your speciality and what you offer.
build_empathy_clinical	How can you build empathy and invite the potential client to reach out to you? (Clinical)
top3_specialties_clinical	What are your top three specialities from the above?
group_interest	Are you interested in leading groups? If so, please list what types of groups you're interested in.
pt_specialties_max25	Do you have any Specialties? Max 25
pt_top3_specialties	What are your top three specialities from the above?
mental_health	Mental Health
sexuality	Sexuality
other_issues	Other Issues
modality	Modality
age_specialty	Client Focus - Age Specialty
groups	Groups
treatment_prefs_max15	Treatment Preferences or Strategies. Max 15
certs_clinical	Do you have any certifications? (Clinical)
work_exp_clinical	Any work experience you would like to share? (Clinical)
avoid_clients_clinical	Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them? (Clinical)
clients_expectations	What is one thing you wish all clients knew? What can clients expect of you?
inspires_concerns	What inspires you? What concerns you?
challenges_finished	What challenges do you help people with or feel confident in helping people with? How do you know when a client is finished with counseling?
fun_questions	What do you want to be when you grow up? What is one item you can’t live without? What was the last thing you did for the first time? What makes you feel truly alive?
philosophies	Any philosophies you would like shared?
why_counselor_itsco	Why did you choose to become a counselor? Why did you choose ITSCO?
personal_info	Any personal info you want shared with the world?
goals_aspirations	Do you have any goals or aspirations you'd like to share with ITSCO admin? We'd love to hear about them!
passions	What are your passions?
team_activities	Please indicate the team activities you are interested in participating with other ITSCO members!
favorite_quotes	Do you have any favorite quotes?
other_info	Any other information you would like to share? Please do so here!
```

---

## 2) Provider Credentialing Sheet (Short Form)

### Row 1 headers
```tsv
first_name	last_name	date_of_birth	first_client_date	npi_number	npi_id	itsco_password	taxonomy_code	zipcode	license_type_number	license_issued	license_expires	medicaid_provider_type	tax_id	medicaid_location_id	medicaid_effective_date	medicaid_revalidation	medicare_number	caqh_provider_id	employee_id	employee_password	ssn_last4	personal_email	cell_number	medicaid_login	medicaid_password
```

### Key → Question mapping (TSV)
```tsv
field_key	question_text
first_name	First name
last_name	Last Name
date_of_birth	Birthday
first_client_date	Date of 1st client
npi_number	NPI
npi_id	NPI ID
itsco_password	Password
taxonomy_code	Taxonomy
zipcode	ZipCode
license_type_number	License #
license_issued	License Issued
license_expires	License Expiration
medicaid_provider_type	Medicaid Provider Type
tax_id	TAX ID
medicaid_location_id	Medicaid Location #
medicaid_effective_date	Medicaid Effective Date
medicaid_revalidation	Revalidation Date
medicare_number	Medicare number
caqh_provider_id	CAQH #
employee_id	ID
employee_password	Password
ssn_last4	Last 4
personal_email	Personal Email
cell_number	Cell Number
medicaid_login	Medicaid Login
medicaid_password	Password
```

---

## 3) Employment + Clinical Onboarding (Timestamp / Start / Reviews)

### Row 1 headers
```tsv
timestamp	full_name	start_date	renewal_date	probationary_period	performance_review_date	resume_cv_upload	date_of_birth	state_of_birth	personal_email	mailing_address	cell_number	education_history	research_past_topics	research_interest	license_type_number	license_issued	license_expires	license_upload	npi_status	npi_number	caqh_provider_id	medicaid_location_id	medicaid_revalidation	psych_today_outside_school_interest	outside_school_availability	school_days_preference	headshot_upload	ideal_client_clinical	how_help_clinical	build_empathy_clinical	pt_specialties_max25	pt_top3_specialties	group_interest	mental_health	certs_general	sexuality	other_issues	modality	age_specialty	groups	languages_spoken	work_exp_general	treatment_prefs_max15	avoid_clients_general	philosophies	personal_info	goals_aspirations	passions	favorite_quotes	team_activities	other_info	pt_gender_ethnicity	why_counselor_itsco	clients_expectations	inspires_concerns	challenges_finished	fun_questions	itsco_position	ideal_client_general	how_help_general	build_empathy_general	certs_clinical	work_exp_clinical	avoid_clients_clinical	specialties_general	previous_address	work_location	email_address	grad_program_info
```

### Key → Question mapping (TSV)
```tsv
field_key	question_text
timestamp	Timestamp
full_name	Name
start_date	Start Date
renewal_date	Renewal Date
probationary_period	Probationary Period
performance_review_date	Performance Review Date
resume_cv_upload	Please upload Resume, Curriculum Vitae, and/or Work History
date_of_birth	Birthdate
state_of_birth	State of Birth
personal_email	Personal Email
mailing_address	Mailing Address
cell_number	Cell Phone Number
education_history	Education information: Please list all degrees, areas of specialization/emphasis (if applicable), years conferred.
research_past_topics	Have you conducted any research? If so, what were the topics?
research_interest	Are you interested in conducting research?
license_type_number	What is/are your license/s and provide us the #/s (i.e., LPCC #00154326)
license_issued	Date License Issued
license_expires	Date License Expires
license_upload	Please upload a copy of your practicing license (LPCC, etc.)
npi_status	Do you have an NPI?
npi_number	Please list your NPI number. If we are making you one, you may leave blank and we will be in contact.
caqh_provider_id	Do you have a CAQH account? If so, what is your provider ID number?
medicaid_location_id	What is your medicaid location ID Number? Or write, "I don't have a medicaid account."
medicaid_revalidation	If you have an account and know your location ID, please list your revalidation date.
psych_today_outside_school_interest	Are you interested in seeing clients outside of schools at our offices? If so, we may establish a psychology today profile for you if you don't already have one. (Licensed Clinicians Only)
outside_school_availability	If you answered "YES" to the above question, please list what days and times you'd like to open your schedule for outside-school hours.
school_days_preference	Please select the days you are looking to be in schools.
headshot_upload	Please attach a professional headshot. We will use this for our website, social media, etc.
ideal_client_clinical	Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why?
how_help_clinical	How can you help your client/s? Talk about your speciality and what you offer.
build_empathy_clinical	How can you build empathy and invite the potential client to reach out to you?
pt_specialties_max25	Do you have any Specialties? Max 25
pt_top3_specialties	What are your top three specialities from the above?
group_interest	Are you interested in leading groups? If so, please list what types of groups you're interested in.
mental_health	Mental Health
certs_general	Do you have any certifications?
sexuality	Sexuality
other_issues	Other Issues
modality	Modality
age_specialty	Client Focus - Age Specialty
groups	Groups
languages_spoken	Languages Spoken
work_exp_general	Any work experience you would like to share?
treatment_prefs_max15	Treatment Preferences or Strategies. Max 15
avoid_clients_general	Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them?
philosophies	Any philosophies you would like shared?
personal_info	Any personal info you want shared with the world?
goals_aspirations	Do you have any goals or aspirations you'd like to share with ITSCO admin? We'd love to hear about them!
passions	What are your passions?
favorite_quotes	Do you have any favorite quotes?
team_activities	Please indicate the team activities you are interested in participating with other ITSCO members!
other_info	Any other information you would like to share? Please do so here!
pt_gender_ethnicity	Your gender/ethnicity (used for the psych today profile for clients with a preference to choose you)
why_counselor_itsco	Why did you choose to become a counselor? Why did you choose ITSCO?
clients_expectations	What is one thing you wish all clients knew? What can clients expect of you?
inspires_concerns	What inspires you? What concerns you?
challenges_finished	What challenges do you help people with or feel confident in helping people with? How do you know when a client is finished with counseling?
fun_questions	What do you want to be when you grow up? What is one item you can’t live without? What was the last thing you did for the first time? What makes you feel truly alive?
itsco_position	Please select your position with ITSCO
ideal_client_general	Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why?
how_help_general	How can you help your client/s? What can you offer?
build_empathy_general	How can you build empathy and invite the potential client to reach out to you?
certs_clinical	Do you have any certifications? (Clinical)
work_exp_clinical	Any work experience you would like to share? (Clinical)
avoid_clients_clinical	Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them? (Clinical)
specialties_general	Do you have any Specialties?
previous_address	Previous Address
work_location	Which location will you be working at?
email_address	Email Address
grad_program_info	Interns only: Provide info about your graduate program
```

---

## 4) NLU / Inner Strength Institute Multi-Track Form (Men’s MH / Sports / Teaching)

### Row 1 headers
```tsv
timestamp	full_name	resume_cv_upload	headshot_upload	date_of_birth	state_of_birth	personal_email	mailing_address	previous_address	cell_number	education_level	education_history	license_type_number	license_issued	license_expires	license_upload	primary_affiliation	nlu_position	isi_focus	mensmh_inspired	mensmh_challenges	mensmh_safe_environment	mensmh_specialized_approaches	mensmh_personal_experiences	mensmh_stay_informed	mensmh_masculinity_role	mensmh_enjoy_most	mensmh_measure_success	athletecoach_influence	athlete_unique_challenges	athlete_balance_pressures	athlete_level_specialty	sports_played_coached	athlete_build_trust	athlete_example_connection	athlete_overcome_setbacks	athlete_retirement_transition	athlete_advice_prioritize_mh	teaching_experience_years_levels	teaching_specialized_courses	teaching_effective_methods	teaching_confident_subjects	teaching_curriculum_contributions	teaching_future_topics_passion	teaching_individual_needs	teaching_active_learning_strategies	teaching_challenging_situation_example	teaching_pd_cert_interest	npi_status	npi_number	caqh_provider_id	medicaid_location_id	medicaid_revalidation	ideal_client_clinical	how_help_clinical	build_empathy_clinical	pt_specialties_max25	pt_top3_specialties	group_interest	mental_health	certs_general	sexuality	other_issues	modality	age_specialty	languages_spoken	work_exp_general	treatment_prefs_max15	avoid_clients_general	job_title	prior_industries_roles	excitement_new_role	unique_skills_strengths	guiding_value_philosophy	problem_solving_approach	work_style_three_words	outside_of_work_interests	personal_info	goals_aspirations	passions	favorite_quotes	team_activities	other_info
```

(Questions are exactly as provided in your prompt; keys above remain the standardized variable names.)

---

## 5) HR / Reference + Authorization Form

### Row 1 headers
```tsv
timestamp	email_address	personal_email	full_legal_name	prior_names	preferred_name_credentials	preferred_email_format	date_of_birth	state_of_birth	mailing_address	cell_number	previous_addresses	resume_cv_upload	education_history	headshot_upload	job_description_understanding_rating	job_description_selected	job_description_clarification_requests	acknowledgement	reference1_name	reference1_relationship	reference1_organization	reference1_email	reference1_phone	reference1_context	reference2_name	reference2_relationship	reference2_organization	reference2_email	reference2_phone	reference2_context	reference3_name	reference3_relationship	reference3_organization	reference3_email	reference3_phone	reference3_context	authorization_release_ack
```

---

## 6) Gear / Supplies Tracking

### Row 1 headers
```tsv
first_name	last_name	windchime_keys	school_cart	tote_bag	tshirt	pullover	polo	team_number	group_number
```
