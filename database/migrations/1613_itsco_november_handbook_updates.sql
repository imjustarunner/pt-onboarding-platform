-- Prepare November only. Do not publish, replace the current handbook, or alter October's provider update.
-- Additive and retry-safe: existing monthly edits and published editions are never overwritten.
INSERT INTO workplace_handbook_digests (agency_id, title, period_label, status, notes)
SELECT a.id, 'November 2026 Workplace Handbook Updates', 'November 2026', 'draft', 'itsco-november-2026-role-pathways-v1'
FROM agencies a WHERE LOWER(a.slug) = 'itsco'
AND NOT EXISTS (SELECT 1 FROM workplace_handbook_digests d WHERE d.agency_id = a.id AND d.notes = 'itsco-november-2026-role-pathways-v1');

INSERT INTO workplace_handbook_digest_entries
(digest_id, agency_id, sort_order, subject, rationale, changed_content, handbook_section_slug, change_kind, previous_content)
SELECT d.id, d.agency_id, 1, 'Role development, compensation, and benefit eligibility', 'Separate career development from compensation categories and levels and from benefit eligibility, so similarly numbered structures are not mistaken for one another.', '<p>ITSCO uses role development pathways to describe professional growth and responsibilities. Role development, compensation placement, and benefit eligibility are separate decisions.</p><ul><li><strong>Role and development pathway:</strong> the position, responsibilities, qualifications, supervision, and professional development appropriate to the individual.</li><li><strong>Compensation category and level:</strong> the placement and rates documented in the individual''s applicable compensation schedule. Use the category and level compensation rate schedule, not a separate career tier or career level, to identify pay.</li><li><strong>Benefit eligibility:</strong> the applicable benefit policy and work-status or workload requirements. A role title or compensation level does not by itself establish eligibility.</li></ul><p>Role labels do not authorize practice beyond the individual''s qualifications, applicable credential, supervision, approved scope, or program requirements. Individual expectations, approved additional duties, and the associated compensation must be documented in the applicable agreement or written amendment.</p>', 'career-pathways-job-titles-service-focus-and-compensation-structure', 'updated', '<p>ITSCO utilizes structured career pathways to define job titles, role progression, and default compensation structures across clinical and clinical support roles. Career pathways are designed to promote clarity, consistency, transparency, and professional development while maintaining flexibility to meet programmatic, regulatory, and operational needs.</p>
<p>Placement within a career pathway is determined by a combination of education, credentials, licensure or certification status, experience, supervision requirements, assigned Service Focus, and organizational need. Advancement within or between pathways is not automatic and may require management review and approval.</p>
<p>This section establishes career tiers, job titles, levels, and default compensation reference rates only.</p>
<p>Role-specific authority, scope of practice, supervision obligations, documentation standards, and service limitations are governed by the Role-Based Practice Expectations section of this Handbook and applicable agreements.</p>
<p>Nothing in this section constitutes a guarantee of compensation, promotion, advancement, hours, or continued employment.</p>'
FROM workplace_handbook_digests d JOIN agencies a ON a.id = d.agency_id
WHERE LOWER(a.slug) = 'itsco' AND d.notes = 'itsco-november-2026-role-pathways-v1' AND d.status = 'draft'
AND NOT EXISTS (SELECT 1 FROM workplace_handbook_digest_entries e WHERE e.digest_id = d.id AND e.handbook_section_slug = 'career-pathways-job-titles-service-focus-and-compensation-structure');

INSERT INTO workplace_handbook_digest_entries
(digest_id, agency_id, sort_order, subject, rationale, changed_content, handbook_section_slug, change_kind, previous_content)
SELECT d.id, d.agency_id, 2, 'Replace numbered career tiers with role development pathways', 'Remove the separate three-tier, five-level career ladder. Keep development guidance without creating a second pay or benefit classification system.', '<p>Career development is described by the work and qualifications involved, without a separate numbered career-tier or career-level ladder:</p><ul><li><strong>Facilitator and clinical support:</strong> build skills in approved support services, facilitation, documentation, coordination, and other assigned duties within the individual''s authorized scope.</li><li><strong>Provider practice with required supervision:</strong> develop clinical practice, documentation, care coordination, and other approved responsibilities under the supervision required for the individual''s role and credentials.</li><li><strong>Independently licensed provider practice:</strong> develop clinical expertise and, where separately assigned and authorized, mentorship, program, or leadership responsibilities.</li></ul><p>Development goals and additional responsibilities are agreed with the supervisor or People Operations. Titles such as senior, lead, or principal describe an approved role assignment; they do not automatically change compensation, benefit eligibility, or supervisory authority.</p><p>Pay continues to follow the documented compensation category and level and individual compensation schedule. Additional duties, including case management when assigned, must identify the applicable compensation category or service rate in writing. This clarification does not itself change anyone''s rate, work expectations, title, or benefits.</p>', 'career-pathway-overview', 'updated', '<p>ITSCO career pathways are organized into three tiers, with Tier 3 representing the highest level of clinical responsibility and advancement:</p>
<ul>
<li>Tier 1: Clinical Support Track</li>
<li>Tier 2: Pre-Licensed / Unlicensed Master’s Track</li>
<li>Tier 3: Licensed Clinical Track</li>
</ul>
<p>Each tier includes five levels reflecting increasing responsibility, experience, and leadership capacity within the tier’s authorized scope.</p>
<h4>TIER 1: Clinical Support Track</h4>
<p>Focus: Skill Building, Facilitation, and Support Services</p>
<p>This tier applies to Peer Support Professionals, Qualified Behavioral Health Assistants (QBHA), Bachelor’s-level providers, and other clinical support roles operating within Practice-approved programs.</p>
<h5>Job Titles (Tier 1):</h5>
<ul>
<li>Level 1: Mental Health Facilitator I</li>
<li>Level 2: Mental Health Facilitator II</li>
<li>Level 3: Senior Facilitator</li>
<li>Level 4: Lead Facilitator</li>
<li>Level 5: Program Facilitator</li>
</ul>
<h5>Compensation schedule</h5><p>Career-track titles do not set a separate hourly pay schedule. Use <a href="#handbook-role-based-supplemental-compensation-rate-schedule">CATEGORY AND LEVEL COMPENSATION RATE SCHEDULE</a> and the employee’s assigned compensation category, level, service eligibility, and individual agreement.</p><h4>TIER 2: Pre-Licensed / Unlicensed Master’s Track</h4>
<p>Focus: Advanced Clinical Service Provision (Licensed or Unlicensed)</p>
<p>This tier applies to individuals holding a Master’s degree in a mental health–related field who are authorized to provide services under applicable supervision, credentialing, and program requirements. Licensure pursuit may or may not be required depending on role and program assignment.</p>
<p>Authorization to provide services is determined by credentialing status, supervision requirements, payer rules, and program approval—not solely by licensure intent.</p>
<h5>Job Titles (Tier 2):</h5>
<ul>
<li>Level 1: Associate Therapist I</li>
<li>Level 2: Associate Therapist II</li>
<li>Level 3: Advanced Associate</li>
<li>Level 4: Senior Associate</li>
<li>Level 5: Principal Associate</li>
</ul>
<h5>Compensation schedule</h5><p>Career-track titles do not set a separate hourly pay schedule. Use <a href="#handbook-role-based-supplemental-compensation-rate-schedule">CATEGORY AND LEVEL COMPENSATION RATE SCHEDULE</a> and the employee’s assigned compensation category, level, service eligibility, and individual agreement.</p><h5>Optional Licensure Transition</h5>
<p>Individuals who later obtain full licensure may be eligible for transition to Tier 3 at a level determined by the Practice. Transition is not automatic and does not guarantee promotion or compensation adjustment.</p>
<h4>TIER 3: Licensed Clinical Track</h4>
<p>Focus: Clinical Autonomy and Leadership</p>
<p>This tier applies to fully licensed clinicians providing therapeutic services within their licensed scope of practice and, at advanced levels, contributing to supervision, mentorship, and program oversight.</p>
<h5>Job Titles (Tier 3):</h5>
<ul>
<li>Level 1: Staff Clinician I</li>
<li>Level 2: Staff Clinician II</li>
<li>Level 3: Senior Clinician</li>
<li>Level 4: Lead Clinician</li>
<li>Level 5: Principal Clinician</li>
</ul>
<h5>Compensation schedule</h5><p>Career-track titles do not set a separate hourly pay schedule. Use <a href="#handbook-role-based-supplemental-compensation-rate-schedule">CATEGORY AND LEVEL COMPENSATION RATE SCHEDULE</a> and the employee’s assigned compensation category, level, service eligibility, and individual agreement.</p>'
FROM workplace_handbook_digests d JOIN agencies a ON a.id = d.agency_id
WHERE LOWER(a.slug) = 'itsco' AND d.notes = 'itsco-november-2026-role-pathways-v1' AND d.status = 'draft'
AND NOT EXISTS (SELECT 1 FROM workplace_handbook_digest_entries e WHERE e.digest_id = d.id AND e.handbook_section_slug = 'career-pathway-overview');

INSERT INTO workplace_handbook_digest_entries
(digest_id, agency_id, sort_order, subject, rationale, changed_content, handbook_section_slug, change_kind, previous_content)
SELECT d.id, d.agency_id, 3, 'Clarify service focus and individual expectations', 'Remove the statement that job title and career level exclusively determine pay. Align service-focus assignments with the category and level compensation schedule and individual agreements.', '<p>A service-focus assignment describes where and how an individual works, including the population served, program, setting, scheduling expectations, approved responsibilities, and supervision. It does not create a separate career tier or level.</p><p>Expected work hours, service expectations, and additional duties should be documented for the individual. A job posting can provide the starting expectations; the individual''s agreement or approved written amendment records any person-specific changes.</p><p>Compensation is determined by the applicable compensation category and level and the individual''s written compensation schedule, including any approved rate for additional duties. A service-focus assignment or development title alone does not change pay. Any proposed change must follow the existing compensation authority and modification process.</p>', 'service-focus-assignment', 'updated', '<p>In addition to Job Title and Level placement, Providers, Facilitators, and Employees may be assigned one or more Service Focus designations identifying the primary programs, environments, or service types they are authorized to support.</p>
<p>Service Focus is used to:</p>
<ul>
<li>Clarify scope of work and program alignment</li>
<li>Guide scheduling, supervision, and assignment decisions</li>
<li>Determine applicable service definitions and operational expectations</li>
</ul>
<p>Service Focus does not determine compensation. Compensation is governed exclusively by Job Title, Level, and applicable compensation structure unless otherwise approved in writing.</p>
<p>Service Focus assignments are operational in nature and may be modified at the Practice’s discretion based on program needs, funding, performance, or organizational requirements.</p>
<h4>Service Focus Categories</h4>
<p>Examples of Service Focus categories include, but are not limited to:</p>
<ul>
<li>School-Based Counseling</li>
<li>Office-Based Counseling</li>
<li>Therapy Plus Tutoring</li>
<li>Skill Builders Program</li>
<li>Social-Emotional Skill Development</li>
<li>Summer Skills Programming</li>
<li>Learning &amp; Wellness Program</li>
<li>Academic Support &amp; Tutoring</li>
<li>Skill Development Coordination</li>
<li>Clinical Supervision and Counseling</li>
<li>Program Leadership</li>
<li>Training and Precepting Support</li>
</ul>
<h4>Special Designations</h4>
<h5>Clinical Supervisor</h5>
<p>Clinical Supervisor is a designation, not a job title. Approved supervision uses the supervisor’s individually contracted hourly rate: direct supervision at 100%, hosting group supervision at 150%, and actual time reviewing and co-signing another provider’s notes at 50%. Use <a href="#handbook-actual-work-time-support-and-corrections">Actual time, support activities and corrections</a> for recording and payroll review. Assignment may be modified based on compliance or program need.</p>
<h5>Interns and Trainees</h5>
<p>Interns and trainees are not part of the formal Career Pathway tiers. These placements are training-based roles governed by separate agreements, program requirements, and supervisory structures. Internship participation does not guarantee employment, tier placement, or compensation eligibility beyond what is expressly approved in writing.</p>
<h4>Classification and compensation assignment</h4><p>People Operations assigns the employee’s career track and compensation category and level based on verified credentials, service eligibility, and the individual agreement. Intern placement remains governed by the applicable training agreement. Use <a href="#handbook-role-based-supplemental-compensation-rate-schedule">CATEGORY AND LEVEL COMPENSATION RATE SCHEDULE</a>; compensation categories, career tracks, and workload benefit tiers are distinct.</p>'
FROM workplace_handbook_digests d JOIN agencies a ON a.id = d.agency_id
WHERE LOWER(a.slug) = 'itsco' AND d.notes = 'itsco-november-2026-role-pathways-v1' AND d.status = 'draft'
AND NOT EXISTS (SELECT 1 FROM workplace_handbook_digest_entries e WHERE e.digest_id = d.id AND e.handbook_section_slug = 'service-focus-assignment');
