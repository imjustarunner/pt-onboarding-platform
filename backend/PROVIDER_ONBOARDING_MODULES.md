title: Employee Forms - Sectioned Builder Spec (v1)
notes:
  - All fields write to employee profile by field_key (single source of truth).
  - Shared field_keys across forms MUST map to the same stored profile variable.
  - SSN and passwords excluded (handled externally / restricted vault).

roles:
  - all_staff
  - clinical_provider
  - clinical_intern
  - facilitator
  - admin
  - operations

forms:

  - form_slug: onboarding_profile_main
    title: New Employee Onboarding & Profile Setup
    audience: all_staff
    sections:

      - section_slug: identity_npi_setup
        title: Identity & NPI Setup
        visible_to_roles: [all_staff]
        fields:
          - { field_key: work_location, type: single_select, required: true, options_source: itsco_locations, label: "Which location will you be working at?" }
          - { field_key: research_past_topics, type: textarea, required: false, label: "Have you conducted any research? If so, what were the topics?" }
          - { field_key: research_interest, type: boolean, required: false, label: "Are you interested in conducting research?" }
          - field_key: npi_status
            type: single_select
            required: true
            label: "Do you have an NPI?"
            options_inline:
              - { value: "yes", label: "Yes" }
              - { value: "no_registered_surrogate", label: "No, but I have registered and will list the number below and have added ITSCO as a surrogate." }
              - { value: "yes_surrogate", label: "Yes, I will list the number below and have added ITSCO as a surrogate." }
              - { value: "no_itsco_create", label: "No, and ITSCO can make me one (please contact me)." }
          - { field_key: npi_number, type: text, required: false, label: "Please list your NPI number. If we are making you one, you may leave blank and we will be in contact." }

      - section_slug: work_schedule
        title: Work Schedule
        visible_to_roles: [all_staff]
        fields:
          - { field_key: availability_mon, type: schedule_grid, required: false, label: "Please select your available days and times [Monday]" }
          - { field_key: availability_tue, type: schedule_grid, required: false, label: "Please select your available days and times [Tuesday]" }
          - { field_key: availability_wed, type: schedule_grid, required: false, label: "Please select your available days and times [Wednesday]" }
          - { field_key: availability_thu, type: schedule_grid, required: false, label: "Please select your available days and times [Thursday]" }
          - { field_key: availability_fri, type: schedule_grid, required: false, label: "Please select your available days and times [Friday]" }
          - { field_key: availability_sat, type: schedule_grid, required: false, label: "Please select your available days and times [Saturday]" }
          - { field_key: availability_sun, type: schedule_grid, required: false, label: "Please select your available days and times [Sunday]" }

      - section_slug: position_role
        title: Position & Role
        visible_to_roles: [all_staff]
        fields:
          - field_key: itsco_position
            type: single_select
            required: true
            label: "Please select your position with ITSCO"
            options_inline:
              - { value: "mh_provider_grad", label: "Mental Health Provider (Master's or Doctorate Level)" }
              - { value: "mh_intern", label: "Intern Mental Health Provider (Enrolled in Master's Level Program)" }
              - { value: "mh_facilitator", label: "Mental Health Facilitator (Primarily Skill Builders | QBHA or Bachelors Level)" }
              - { value: "mh_provider_ba_approved", label: "Mental Health Provider (Bachelor's Level with Approval for Counseling/Therapeutic Services)" }

      - section_slug: counseling_profile_general
        title: Counseling Profile (General)
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: provider_description, type: textarea, required: false, label: "Description (optional)" }
          - { field_key: ideal_client_general, type: textarea, required: false, label: "Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why?" }
          - { field_key: how_help_general, type: textarea, required: false, label: "How can you help your client/s? What can you offer?" }
          - { field_key: build_empathy_general, type: textarea, required: false, label: "How can you build empathy and invite the potential client to reach out to you?" }
          - { field_key: certs_general, type: textarea, required: false, label: "Do you have any certifications?" }
          - { field_key: work_exp_general, type: textarea, required: false, label: "Any work experience you would like to share?" }
          - { field_key: avoid_clients_general, type: textarea, required: false, label: "Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them?" }
          - { field_key: specialties_general, type: multi_select, required: false, options_source: specialties_general_list, label: "Do you have any Specialties?" }
          - { field_key: top3_specialties_general, type: text, required: false, label: "What are your top three specialities from the above?" }

      - section_slug: clinical_credentialing
        title: Clinical Credentialing
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: license_type_number, type: text, required: false, label: "What is/are your license/s and provide us the #/s (i.e., LPCC #00154326)" }
          - { field_key: license_issued, type: date, required: false, label: "Date License Issued" }
          - { field_key: license_expires, type: date, required: false, label: "Date License Expires" }
          - { field_key: license_upload, type: file, required: false, label: "Please upload a copy of your practicing license (LPCC, etc.)" }
          - { field_key: caqh_provider_id, type: text, required: false, label: "Do you have a CAQH account? If so, what is your provider ID number?" }
          - { field_key: medicaid_location_id, type: text, required: false, label: "What is your medicaid location ID Number? Or write, \"I don't have a medicaid account.\"" }
          - { field_key: medicaid_revalidation, type: date, required: false, label: "If you have an account and know your location ID, please list your revalidation date." }

      - section_slug: marketing_psych_today
        title: External Marketing Profile (Psychology Today)
        visible_to_roles: [clinical_provider]
        fields:
          - field_key: psych_today_status
            type: single_select
            required: false
            label: "Psychology Today Status"
            options_inline:
              - { value: "yes_existing", label: "Yes and I have a profile already." }
              - { value: "yes_need_profile", label: "Yes and I do not yet have a profile." }
              - { value: "no_prefer_not", label: "No and I would prefer not to have a profile or will manage my own." }
          - { field_key: pt_gender_ethnicity, type: text, required: false, label: "Your gender/ethnicity (used for the psych today profile for clients with a preference to choose you) if applicable." }
          - { field_key: ideal_client_clinical, type: textarea, required: false, label: "Ideal Client (Clinical Focus)." }
          - { field_key: how_help_clinical, type: textarea, required: false, label: "How you help / Specialty offer." }
          - { field_key: build_empathy_clinical, type: textarea, required: false, label: "Building Empathy (Clinical Focus)." }
          - { field_key: top3_specialties_clinical, type: text, required: false, label: "Top 3 Specialties (re-confirm for this profile)." }
          - { field_key: group_interest, type: textarea, required: false, label: "Interested in leading groups? (List types)" }
          - { field_key: pt_specialties_max25, type: multi_select, required: false, max_select: 25, options_source: psych_today_issues_list, label: "Issues/Specialties (Max 25)" }
          - { field_key: pt_top3_specialties, type: text, required: false, label: "Top 3 Specialties (from issues list)" }
          - { field_key: mental_health, type: multi_select, required: false, options_source: psych_today_mental_health_categories, label: "Mental Health Categories" }
          - { field_key: sexuality, type: multi_select, required: false, options_source: psych_today_sexuality_categories, label: "Sexuality" }
          - { field_key: other_issues, type: multi_select, required: false, options_source: psych_today_communities_allied, label: "Communities/Allied" }
          - { field_key: modality, type: multi_select, required: false, options_source: psych_today_modalities_list, label: "Treatment Modalities", max_select: 15 }
          - { field_key: age_specialty, type: multi_select, required: false, options_source: psych_today_age_specialty, label: "Age Specialty" }
          - { field_key: groups, type: multi_select, required: false, options_source: psych_today_focus, label: "Focus (Couples/Families/Groups/Individuals)" }
          - { field_key: treatment_prefs_max15, type: multi_select, required: false, max_select: 15, options_source: psych_today_modalities_list, label: "Treatment Preferences or Strategies. Max 15" }
          - { field_key: certs_clinical, type: textarea, required: false, label: "Do you have any certifications? (Clinical)" }
          - { field_key: work_exp_clinical, type: textarea, required: false, label: "Any work experience you would like to share? (Clinical)" }
          - { field_key: avoid_clients_clinical, type: textarea, required: false, label: "Any clients we should absolutely avoid scheduling with you? (Clinical)" }

      - section_slug: culture_bio
        title: Culture & Bio (Getting to Know You)
        visible_to_roles: [all_staff]
        fields:
          - { field_key: clients_expectations, type: textarea, required: false, label: "One thing you wish all clients knew / what can clients expect?" }
          - { field_key: inspires_concerns, type: textarea, required: false, label: "What inspires you? What concerns you?" }
          - { field_key: challenges_finished, type: textarea, required: false, label: "Challenges you help with / definition of finished." }
          - { field_key: fun_questions, type: textarea, required: false, label: "Fun questions (grow up to be / can't live without / first time / alive)" }
          - { field_key: philosophies, type: textarea, required: false, label: "Philosophies to share." }
          - { field_key: why_counselor_itsco, type: textarea, required: false, label: "Why become a counselor? Why ITSCO?" }
          - { field_key: personal_info, type: textarea, required: false, label: "Personal info to share with the world." }
          - { field_key: goals_aspirations, type: textarea, required: false, label: "Goals/aspirations to share with Admin." }
          - { field_key: passions, type: textarea, required: false, label: "What are your passions?" }
          - { field_key: favorite_quotes, type: textarea, required: false, label: "Favorite quotes?" }
          - { field_key: team_activities, type: multi_select, required: false, options_source: team_activities_list, label: "Team Activities (select all that apply)" }
          - { field_key: other_info, type: textarea, required: false, label: "Any other information you'd like to share?" }

    rules:
      - rule_id: show_taxonomy_when_no_npi
        if_field_key: npi_status
        operator: in
        value: ["no_registered_surrogate", "no_itsco_create"]
        then_action: show_section
        target_section_slug: taxonomy_codes_reference


  - form_slug: initial_job_hire
    title: Initial Job Hire Form
    audience: all_staff
    sections:
      - section_slug: meta_submission
        title: Submission Meta
        visible_to_roles: [all_staff]
        fields:
          - { field_key: timestamp, type: text, required: false, label: "Timestamp" }

      - section_slug: contact_identity
        title: Contact & Identity
        visible_to_roles: [all_staff]
        fields:
          - { field_key: email_address, type: email, required: true, label: "Email Address" }
          - { field_key: personal_email, type: email, required: false, label: "Personal Permanent E-Mail (if different from above)" }
          - { field_key: full_legal_name, type: text, required: true, label: "Full Legal Name" }
          - { field_key: prior_names, type: textarea, required: false, label: "Prior Names" }
          - { field_key: preferred_name_credentials, type: text, required: false, label: "Preferred Name and Credentials (If Applicable)" }
          - { field_key: preferred_email_format, type: text, required: false, label: "Preferred Email Format (Optional and if Available)" }
          - { field_key: date_of_birth, type: date, required: true, label: "Birthdate" }
          - { field_key: state_of_birth, type: text, required: false, label: "State of Birth" }
          - { field_key: mailing_address, type: textarea, required: true, label: "Mailing Address" }
          - { field_key: cell_number, type: phone, required: true, label: "Cell Phone Number" }
          - { field_key: previous_addresses, type: textarea, required: false, label: "Previous Addresses" }

      - section_slug: documents_uploads
        title: Documents & Uploads
        visible_to_roles: [all_staff]
        fields:
          - { field_key: resume_cv_upload, type: file, required: false, label: "Please upload Resume, Curriculum Vitae, and/or Work History" }
          - { field_key: education_history, type: textarea, required: false, label: "Education information: Please list all degrees, areas of specialization/emphasis (if applicable), years conferred." }
          - { field_key: headshot_upload, type: file, required: false, label: "Please attach a professional headshot. We will use this for our website, social media, etc." }

      - section_slug: job_description_review
        title: Job Description Review
        visible_to_roles: [all_staff]
        fields:
          - field_key: job_description_understanding_rating
            type: single_select
            required: false
            label: "Based on your review, how would you rate your understanding of your specific Job Description?"
            options_inline:
              - { value: "1", label: "1" }
              - { value: "2", label: "2" }
              - { value: "3", label: "3" }
              - { value: "4", label: "4" }
              - { value: "5", label: "5" }
          - { field_key: job_description_selected, type: text, required: false, label: "Select which Job Description associated with your application and hiring offer." }
          - { field_key: job_description_clarification_requests, type: textarea, required: false, label: "Are there any areas you would like clarification on before moving forward?" }
          - { field_key: acknowledgement, type: boolean, required: false, label: "Acknowledgement" }

      - section_slug: references
        title: References
        visible_to_roles: [all_staff]
        fields:
          - { field_key: reference1_name, type: text, required: false, label: "Reference Name (#1)" }
          - { field_key: reference1_relationship, type: text, required: false, label: "Relationship to You (#1)" }
          - { field_key: reference1_organization, type: text, required: false, label: "Organization / Setting (#1)" }
          - { field_key: reference1_email, type: email, required: false, label: "Email Address (#1)" }
          - { field_key: reference1_phone, type: phone, required: false, label: "Phone Number (#1)" }
          - { field_key: reference1_context, type: textarea, required: false, label: "Context for This Reference (#1)" }
          - { field_key: reference2_name, type: text, required: false, label: "Reference Name (#2)" }
          - { field_key: reference2_relationship, type: text, required: false, label: "Relationship to You (#2)" }
          - { field_key: reference2_organization, type: text, required: false, label: "Organization / Setting (#2)" }
          - { field_key: reference2_email, type: email, required: false, label: "Email Address (#2)" }
          - { field_key: reference2_phone, type: phone, required: false, label: "Phone Number (#2)" }
          - { field_key: reference2_context, type: textarea, required: false, label: "Context for This Reference (#2)" }
          - { field_key: reference3_name, type: text, required: false, label: "Reference Name (#3)" }
          - { field_key: reference3_relationship, type: text, required: false, label: "Relationship to You (#3)" }
          - { field_key: reference3_organization, type: text, required: false, label: "Organization / Setting (#3)" }
          - { field_key: reference3_email, type: email, required: false, label: "Email Address (#3)" }
          - { field_key: reference3_phone, type: phone, required: false, label: "Phone Number (#3)" }
          - { field_key: reference3_context, type: textarea, required: false, label: "Context for This Reference (#3)" }

      - section_slug: authorization
        title: Authorization & Release
        visible_to_roles: [all_staff]
        fields:
          - { field_key: authorization_release_ack, type: boolean, required: true, label: "Authorization and Release Statement Acknowledgment" }


  - form_slug: new_hire_packet_v1
    title: New Hire Packet (Pre-Onboarding)
    audience: all_staff
    sections:

      - section_slug: submission_meta
        title: Submission Meta
        visible_to_roles: [all_staff]
        fields:
          - { field_key: timestamp, type: text, required: false, label: "Timestamp" }

      - section_slug: contact_identity
        title: Contact & Identity
        visible_to_roles: [all_staff]
        fields:
          - { field_key: email_address, type: email, required: true, label: "Email Address" }
          - { field_key: personal_email, type: email, required: false, label: "Personal Permanent E-Mail (if different from above)" }
          - { field_key: full_legal_name, type: text, required: true, label: "Full Legal Name" }
          - { field_key: prior_names, type: textarea, required: false, label: "Prior Names" }
          - { field_key: preferred_name_credentials, type: text, required: false, label: "Preferred Name and Credentials (If Applicable)" }
          - { field_key: preferred_email_format, type: text, required: false, label: "Preferred Email Format (Optional and if Available)" }
          - { field_key: date_of_birth, type: date, required: true, label: "Birthdate" }
          - { field_key: state_of_birth, type: text, required: false, label: "State of Birth" }
          - { field_key: mailing_address, type: textarea, required: true, label: "Mailing Address" }
          - { field_key: cell_number, type: phone, required: true, label: "Cell Phone Number" }
          - { field_key: previous_addresses, type: textarea, required: false, label: "Previous Addresses" }

      - section_slug: documents_uploads
        title: Documents & Uploads
        visible_to_roles: [all_staff]
        fields:
          - { field_key: resume_cv_upload, type: file, required: false, label: "Please upload Resume, Curriculum Vitae, and/or Work History" }
          - { field_key: education_history, type: textarea, required: false, label: "Education information: Please list all degrees, areas of specialization/emphasis (if applicable), years conferred." }
          - { field_key: headshot_upload, type: file, required: false, label: "Please attach a professional headshot. We will use this for our website, social media, etc." }

      - section_slug: job_description_review
        title: Job Description Review
        visible_to_roles: [all_staff]
        fields:
          - field_key: job_description_understanding_rating
            type: single_select
            required: false
            label: "Based on your review, how would you rate your understanding of your specific Job Description?"
            options_inline:
              - { value: "1", label: "1" }
              - { value: "2", label: "2" }
              - { value: "3", label: "3" }
              - { value: "4", label: "4" }
              - { value: "5", label: "5" }
          - { field_key: job_description_selected, type: text, required: false, label: "Select which Job Description associated with your application and hiring offer." }
          - { field_key: job_description_clarification_requests, type: textarea, required: false, label: "Are there any areas you would like clarification on before moving forward?" }
          - { field_key: acknowledgement, type: boolean, required: false, label: "Acknowledgement" }

      - section_slug: references
        title: References
        visible_to_roles: [all_staff]
        fields:
          - { field_key: reference1_name, type: text, required: false, label: "Reference Name (#1)" }
          - { field_key: reference1_relationship, type: text, required: false, label: "Relationship to You (#1)" }
          - { field_key: reference1_organization, type: text, required: false, label: "Organization / Setting (#1)" }
          - { field_key: reference1_email, type: email, required: false, label: "Email Address (#1)" }
          - { field_key: reference1_phone, type: phone, required: false, label: "Phone Number (#1)" }
          - { field_key: reference1_context, type: textarea, required: false, label: "Context for This Reference (#1)" }
          - { field_key: reference2_name, type: text, required: false, label: "Reference Name (#2)" }
          - { field_key: reference2_relationship, type: text, required: false, label: "Relationship to You (#2)" }
          - { field_key: reference2_organization, type: text, required: false, label: "Organization / Setting (#2)" }
          - { field_key: reference2_email, type: email, required: false, label: "Email Address (#2)" }
          - { field_key: reference2_phone, type: phone, required: false, label: "Phone Number (#2)" }
          - { field_key: reference2_context, type: textarea, required: false, label: "Context for This Reference (#2)" }
          - { field_key: reference3_name, type: text, required: false, label: "Reference Name (#3)" }
          - { field_key: reference3_relationship, type: text, required: false, label: "Relationship to You (#3)" }
          - { field_key: reference3_organization, type: text, required: false, label: "Organization / Setting (#3)" }
          - { field_key: reference3_email, type: email, required: false, label: "Email Address (#3)" }
          - { field_key: reference3_phone, type: phone, required: false, label: "Phone Number (#3)" }
          - { field_key: reference3_context, type: textarea, required: false, label: "Context for This Reference (#3)" }

      - section_slug: authorization_release
        title: Authorization & Release
        visible_to_roles: [all_staff]
        fields:
          - { field_key: authorization_release_ack, type: boolean, required: true, label: "Authorization and Release Statement Acknowledgment" }


  - form_slug: provider_info_core_v1
    title: Provider Info Core (Identity, Schedule, Role)
    audience: all_staff
    sections:

      - section_slug: provider_identity_contact
        title: Identity & Contact
        visible_to_roles: [all_staff]
        fields:
          - { field_key: first_name, type: text, required: false, label: "First Name" }
          - { field_key: last_name, type: text, required: false, label: "Last Name" }
          - { field_key: date_of_birth, type: date, required: false, label: "Birthdate" }
          - { field_key: personal_email, type: email, required: false, label: "Personal Email" }
          - { field_key: email_address, type: email, required: false, label: "Email Address" }
          - { field_key: cell_number, type: phone, required: false, label: "Cell Phone Number" }
          - { field_key: mailing_address, type: textarea, required: false, label: "Mailing Address" }
          - { field_key: previous_addresses, type: textarea, required: false, label: "Previous Addresses" }

      - section_slug: provider_work_assignment
        title: Work Assignment
        visible_to_roles: [all_staff]
        fields:
          - { field_key: work_location, type: single_select, required: false, options_source: itsco_locations, label: "Work location" }
          - field_key: itsco_position
            type: single_select
            required: false
            label: "Please select your position with ITSCO"
            options_inline:
              - { value: "mh_provider_grad", label: "Mental Health Provider (Master's or Doctorate Level)" }
              - { value: "mh_intern", label: "Intern Mental Health Provider (Enrolled in Master's Level Program)" }
              - { value: "mh_facilitator", label: "Mental Health Facilitator (Primarily Skill Builders | QBHA or Bachelors Level)" }
              - { value: "mh_provider_ba_approved", label: "Mental Health Provider (Bachelor's Level with Approval for Counseling/Therapeutic Services)" }

      - section_slug: provider_work_schedule
        title: Work Schedule
        visible_to_roles: [all_staff]
        fields:
          - { field_key: availability_mon, type: schedule_grid, required: false, label: "Please select your available days and times [Monday]" }
          - { field_key: availability_tue, type: schedule_grid, required: false, label: "Please select your available days and times [Tuesday]" }
          - { field_key: availability_wed, type: schedule_grid, required: false, label: "Please select your available days and times [Wednesday]" }
          - { field_key: availability_thu, type: schedule_grid, required: false, label: "Please select your available days and times [Thursday]" }
          - { field_key: availability_fri, type: schedule_grid, required: false, label: "Please select your available days and times [Friday]" }
          - { field_key: availability_sat, type: schedule_grid, required: false, label: "Please select your available days and times [Saturday]" }
          - { field_key: availability_sun, type: schedule_grid, required: false, label: "Please select your available days and times [Sunday]" }

      - section_slug: provider_education_program
        title: Education / Program (if applicable)
        visible_to_roles: [all_staff]
        fields:
          - { field_key: education_history, type: textarea, required: false, label: "Education history" }
          - { field_key: grad_program_info, type: textarea, required: false, label: "Grad program info" }


  - form_slug: clinical_credentialing_v1
    title: Clinical Credentialing (License, NPI, CAQH, Medicaid)
    audience: clinical_provider
    sections:

      - section_slug: clinical_licenses
        title: Licenses
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: license_type_number, type: text, required: false, label: "License type & number" }
          - { field_key: license_issued, type: date, required: false, label: "Date License Issued" }
          - { field_key: license_expires, type: date, required: false, label: "Date License Expires" }
          - { field_key: license_upload, type: file, required: false, label: "License upload" }

      - section_slug: clinical_npi
        title: NPI
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - field_key: npi_status
            type: single_select
            required: false
            label: "Do you have an NPI?"
            options_inline:
              - { value: "yes", label: "Yes" }
              - { value: "no_registered_surrogate", label: "No, but I have registered and will list the number below and have added ITSCO as a surrogate." }
              - { value: "yes_surrogate", label: "Yes, I will list the number below and have added ITSCO as a surrogate." }
              - { value: "no_itsco_create", label: "No, and ITSCO can make me one (please contact me)." }
          - { field_key: npi_number, type: text, required: false, label: "NPI number" }
          - { field_key: taxonomy_code, type: text, required: false, label: "Taxonomy code" }

      - section_slug: clinical_caqh
        title: CAQH
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: caqh_provider_id, type: text, required: false, label: "CAQH provider ID" }

      - section_slug: clinical_medicaid
        title: Medicaid
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: medicaid_provider_type, type: text, required: false, label: "Medicaid provider type" }
          - { field_key: medicaid_location_id, type: text, required: false, label: "Medicaid location ID" }
          - { field_key: medicaid_effective_date, type: date, required: false, label: "Medicaid effective date" }
          - { field_key: medicaid_revalidation, type: date, required: false, label: "Medicaid revalidation date" }

      - section_slug: clinical_medicare
        title: Medicare (if applicable)
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: medicare_number, type: text, required: false, label: "Medicare number" }

      - section_slug: clinical_research
        title: Research (optional)
        visible_to_roles: [clinical_provider, clinical_intern]
        fields:
          - { field_key: research_past_topics, type: textarea, required: false, label: "Past research topics" }
          - { field_key: research_interest, type: boolean, required: false, label: "Interested in research?" }


  - form_slug: clinical_profile_internal_v1
    title: Clinical Profile (Internal Use)
    audience: clinical_provider
    sections:

      - section_slug: clinical_profile_overview
        title: Overview
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: provider_description, type: textarea, required: false, label: "Provider description" }

      - section_slug: clinical_profile_ideal_client
        title: Ideal Client & Approach
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: ideal_client_general, type: textarea, required: false, label: "Ideal client (general)" }
          - { field_key: how_help_general, type: textarea, required: false, label: "How you help (general)" }
          - { field_key: build_empathy_general, type: textarea, required: false, label: "Build empathy (general)" }

      - section_slug: clinical_profile_specialties
        title: Specialties
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: specialties_general, type: multi_select, required: false, options_source: specialties_general_list, label: "Specialties (general)" }
          - { field_key: top3_specialties_general, type: text, required: false, label: "Top 3 specialties (general)" }

      - section_slug: clinical_profile_experience
        title: Experience & Training
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: certs_general, type: textarea, required: false, label: "Certifications (general)" }
          - { field_key: work_exp_general, type: textarea, required: false, label: "Work experience (general)" }

      - section_slug: clinical_profile_scheduling_exclusions
        title: Scheduling Exclusions
        visible_to_roles: [clinical_provider, clinical_intern, facilitator]
        fields:
          - { field_key: avoid_clients_general, type: textarea, required: false, label: "Scheduling exclusions (general)" }


  - form_slug: marketing_directory_v1
    title: Marketing & Directory Profile
    audience: clinical_provider
    sections:

      - section_slug: marketing_psych_today_setup
        title: Psychology Today Setup
        visible_to_roles: [clinical_provider]
        fields:
          - field_key: psych_today_status
            type: single_select
            required: false
            label: "Psychology Today Status"
            options_inline:
              - { value: "yes_existing", label: "Yes and I have a profile already." }
              - { value: "yes_need_profile", label: "Yes and I do not yet have a profile." }
              - { value: "no_prefer_not", label: "No and I would prefer not to have a profile or will manage my own." }
          - { field_key: pt_gender_ethnicity, type: text, required: false, label: "Gender/ethnicity (Psychology Today)" }

      - section_slug: marketing_bio_essays_clinical
        title: Bio Essays (Clinical)
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: ideal_client_clinical, type: textarea, required: false, label: "Ideal client (clinical)" }
          - { field_key: how_help_clinical, type: textarea, required: false, label: "How you help (clinical)" }
          - { field_key: build_empathy_clinical, type: textarea, required: false, label: "Build empathy (clinical)" }

      - section_slug: marketing_specialties
        title: Specialties
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: pt_specialties_max25, type: multi_select, required: false, max_select: 25, options_source: psych_today_issues_list, label: "Issues/Specialties (Max 25)" }
          - { field_key: pt_top3_specialties, type: text, required: false, label: "Top 3 specialties (from issues list)" }
          - { field_key: top3_specialties_clinical, type: text, required: false, label: "Top 3 specialties (clinical)" }

      - section_slug: marketing_focus_populations
        title: Focus & Populations
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: age_specialty, type: multi_select, required: false, options_source: psych_today_age_specialty, label: "Age Specialty" }
          - { field_key: groups, type: multi_select, required: false, options_source: psych_today_focus, label: "Focus (Couples/Families/Groups/Individuals)" }
          - { field_key: mental_health, type: multi_select, required: false, options_source: psych_today_mental_health_categories, label: "Mental Health Categories" }
          - { field_key: sexuality, type: multi_select, required: false, options_source: psych_today_sexuality_categories, label: "Sexuality" }
          - { field_key: other_issues, type: multi_select, required: false, options_source: psych_today_communities_allied, label: "Communities/Allied" }

      - section_slug: marketing_modalities_preferences
        title: Modalities / Preferences
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: modality, type: multi_select, required: false, options_source: psych_today_modalities_list, label: "Treatment Modalities", max_select: 15 }
          - { field_key: treatment_prefs_max15, type: multi_select, required: false, max_select: 15, options_source: psych_today_modalities_list, label: "Treatment Preferences or Strategies. Max 15" }

      - section_slug: marketing_groups_leading
        title: Groups (Leading)
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: group_interest, type: textarea, required: false, label: "Interested in leading groups? (List types)" }

      - section_slug: marketing_experience_exclusions
        title: Experience & Exclusions (Clinical)
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: certs_clinical, type: textarea, required: false, label: "Certifications (clinical)" }
          - { field_key: work_exp_clinical, type: textarea, required: false, label: "Work experience (clinical)" }
          - { field_key: avoid_clients_clinical, type: textarea, required: false, label: "Scheduling exclusions (clinical)" }

      - section_slug: marketing_languages
        title: Languages
        visible_to_roles: [clinical_provider]
        fields:
          - { field_key: languages_spoken, type: text, required: false, label: "Languages spoken" }


  - form_slug: gear_supplies
    title: Gear / Supplies Tracking
    audience: all_staff
    sections:
      - section_slug: gear_tracking
        title: Gear & Items
        visible_to_roles: [all_staff, operations, admin]
        fields:
          - { field_key: windchime_keys, type: boolean, required: false, label: "Windchime Keys" }
          - { field_key: school_cart, type: boolean, required: false, label: "School Cart" }
          - { field_key: tote_bag, type: boolean, required: false, label: "Tote Bag" }
          - { field_key: tshirt, type: text, required: false, label: "T-Shirt (size/notes)" }
          - { field_key: pullover, type: text, required: false, label: "Pullover (size/notes)" }
          - { field_key: polo, type: text, required: false, label: "Polo (size/notes)" }
          - { field_key: team_number, type: text, required: false, label: "Team #" }
          - { field_key: group_number, type: text, required: false, label: "Group #" }

      - section_slug: leave_of_absence
        title: Leave of Absence
        visible_to_roles: [all_staff, admin, operations]
        fields:
          - field_key: leave_type
            type: single_select
            required: false
            label: "Leave type"
            options_inline:
              - { value: "maternity", label: "Maternity" }
              - { value: "paternity", label: "Paternity" }
              - { value: "medical", label: "Medical" }
              - { value: "other", label: "Other" }
          - { field_key: leave_departure_date, type: date, required: false, label: "Departure date" }
          - { field_key: leave_return_date, type: date, required: false, label: "Return date" }
