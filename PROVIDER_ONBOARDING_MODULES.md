System Instruction: Create the following distinct modules for the "New Employee Onboarding & Profile Setup" flow. Each module must contain the specific data fields and selection options listed below.

Module 1: Identity & NPI Setup
Description: Collects location, research interests, and federal provider identification.

Fields:

Location Selection: (Single Select)

Options: [Load current ITSCO locations]

Research Status:

Have you conducted research? If so, what topics? (Text Area)

Are you interested in conducting research? (Boolean: Yes/No)

NPI Configuration:

Do you have an NPI? (Single Select)

Option 1: Yes

Option 2: No, but I have registered and will list the number below and have added ITSCO as a surrogate.

Option 3: Yes, I will list the number below and have added ITSCO as a surrogate.

Option 4: No, and ITSCO can make me one (please contact me).

Logic Note: Display taxonomy codes if "No" is selected: LPC/LPCC: 101YP2500X, MFT/MFTC: 106H00000X, LSW:LCSW 104100000X.

NPI Number Input: (Text Field - Optional if ITSCO is creating one)

Module 2: Position & Role
Description: Determines the logic flow for the rest of the profile.

Field: Select your position with ITSCO (Single Select).

Option 1: Mental Health Provider (Master's or Doctorate Level)

Option 2: Intern Mental Health Provider (Enrolled in Master's Level Program)

Option 3: Mental Health Facilitator (Primarily Skill Builders | QBHA or Bachelors Level)

Option 4: Mental Health Provider (Bachelor's Level with Approval for Counseling/Therapeutic Services)

Module 3: Work Schedule
System Directive: The time schedule should be implemented as discussed prior with selections that integrate directly with the profile that is a module of its own.

Module 4: Counseling Profile (General)
Description: General counseling approach and specialty identification.

Essay Fields:

Imagine your ideal client. What are their issues, needs, and goals? What do they want and why?

How can you help your client/s? What can you offer?

How can you build empathy and invite the potential client to reach out to you?

Do you have any certifications?

Work experience to share?

Are there any clients we should absolutely avoid scheduling with you?

Specialties Selection: (Multi-Select Checkbox)

Options: ADHD, Adoption, Anger Management, Anxiety, Asperger's Syndrome, Autism, Behavioral Issues, Bipolar Disorder, Eating Disorders, Education and Learning Disabilities, Family Conflict, Mood Disorders, LGBTQ+, Obesity, Obsessive-Compulsive (OCD), Peer Relationships, Racial Identity, School Issues, Self Esteem, Self-Harming, Sports Performance, Stress, Teen Violence, Transgender, Trauma and PTSD, Traumatic Brain Injury (TBI), Video Game Addiction.

Top 3 Specialties: (Text Input)

Module 5: Clinical Credentialing
Description: License and insurance registration details.

Fields:

License Details:

License Type and Number (e.g., LPCC #00154326). Note: List states if multiple.

Date License Issued (Date Picker).

Date License Expires (Date Picker).

Document Upload: Upload copy of practicing license (File Upload).

CAQH & Medicaid:

Do you have a CAQH account? (Yes/No). If yes, provide Provider ID.

Medicaid Location ID Number (or text entry "I don't have a medicaid account").

Revalidation Date (Date Picker - if applicable).

Module 6: External Marketing Profile (Psychology Today)
Description: Data specifically for the website bio and Psychology Today profile.

Profile Setup:

Psychology Today Status: (Single Select)

Yes and I have a profile already.

Yes and I do not yet have a profile.

No and I would prefer not to have a profile or will manage my own.

Gender/Ethnicity for profile display.

Clinical Bio Essays:

Ideal Client (Clinical Focus).

How you help/Specialty offer.

Building Empathy (Clinical Focus).

Top 3 Specialties (re-confirm for this profile).

Group Therapy:

Interested in leading groups? (Text/List types).

Detailed Clinical Categories: (Multi-Select Checkboxes)

Issues/Specialties (Max 25): Addiction, ADHD, Adoption, Alcohol Use, Alzheimer's, Anger Management, Antisocial Personality, Anxiety, Asperger's Syndrome, Autism, Behavioral Issues, Bipolar Disorder, Borderline Personality (BPD), Career Counseling, Child, Chronic Illness, Chronic Impulsivity, Chronic Pain, Codependency, Coping Skills, Depression, Developmental Disorders, Divorce, Domestic Violence/Abuse, Drug Abuse, Eating Disorders, Education/Learning Disabilities, Family Conflict, Gambling, Grief, Hoarding, Infertility, Infidelity, Mood Disorders, LGBTQ+, Life Coaching, Life Transitions, Men's Issues, Narcissistic Personality (NPD), Obesity, OCD, ODD, Parenting, Peer Relationships, Pregnancy/Prenatal/Postpartum, Racial Identity, Relationship Issues, School Issues, Self Esteem, Self-Harming, Sex Therapy, Sexual Abuse, Sexual Addiction, Sleep/Insomnia, Spirituality, Sports Performance, Stress, Substance Use, Teen Violence, Transgender, Trauma and PTSD, TBI, Video Game Addiction, Weight Loss, Women's Issues.

Mental Health Categories: Dissociative Disorders (DID), Elderly Persons Disorders, Impulse Control Disorders, Mood Disorders, Personality Disorders, Psychosis, Thinking Disorders.

Sexuality: Bisexual, Lesbian, LGBTQ+.

Focus: Couples, Families, Groups, Individuals.

Age Specialty: Toddler (0-5), Children (6-10), Preteen (11-13), Teen (14-18), Adults (18+), Seniors (65+).

Communities/Allied: Aviation Professionals, Bisexual Allied, Blind Allied, Body Positivity, Cancer, Deaf Allied, Gay Allied, HIV/AIDS Allied, Immuno-disorders, Intersex Allied, Lesbian Allied, Little Person Allied, Non-Binary Allied, Open Relationships Non-Monogamy, Queer Allied, Racial Justice Allied, Sex Worker Allied, Sex-Positive/Kink Allied, Single Mother, Transgender Allied, Veterans.

Treatment Modalities: (Multi-Select Checkbox - Max 15)

Options: Acceptance and Commitment (ACT), Adlerian, AEDP, Applied Behavioral Analysis (ABA), Art Therapy, Attachment-Based, Biofeedback, Brainspotting, Christian Counseling, Clinical Supervision, Coaching, CBT, CPT, Compassion Focused, Culturally Sensitive, Dance Movement Therapy, DBT, Eclectic, EMDR, Emotionally Focused, Energy Psychology, Existential, Experiential Therapy, Exposure Response Prevention (ERP), Family/Marital, Family Systems, Feminist, Forensic Psychology, Gestalt, Gottman Method, Humanistic, Hypnotherapy, Integrative, IFS, Interpersonal, Intervention, Jungian, Mindfulness-Based (MBCT), Motivational Interviewing, Multicultural, Music Therapy, Narrative, Neuro-Linguistic (NLP), Neurofeedback, Parent-Child Interaction (PCIT), Person-Centered, Play Therapy, Positive Psychology, Prolonged Exposure Therapy, Psychoanalytic, Psychobiological Approach Couple Therapy, Psychodynamic, Psychological Testing and Evaluation, REBT, Reality Therapy, Relational, Sandplay, Schema Therapy, Solution Focused Brief (SFBT), Somatic, Strength-Based, Structural Family Therapy, Transpersonal, Trauma Focused, Synergetic Play Therapy.

Module 7: Culture & Bio ("Getting to Know You")
Description: Personal questions for company culture and internal bios.

Essay Fields:

One thing you wish all clients knew / What can clients expect?

What inspires you? What concerns you?

Challenges you help with / Definition of "finished" with counseling.

"Fun" Questions (Grow up to be / Item can't live without / First time / What makes you feel alive).

Philosophies to share.

Why become a counselor? Why ITSCO?

Personal info to share with the world.

Goals/Aspirations to share with Admin.

Interests:

What are your passions?

Favorite quotes?

Team Activities Selection: (Multi-Select Checkbox)

Options: Top Golf, Hiking, Road Trips, Camping, Paddle Boarding, UFC nights (Saturdays), Switchbacks (Soccer), Dinners/Evening events, Running, Fitness, Aerobic activities (swimming/cycling).