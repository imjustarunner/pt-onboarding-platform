import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import TrainingTrack from '../models/TrainingTrack.model.js';
import Module from '../models/Module.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import User from '../models/User.model.js';
import UserTrack from '../models/UserTrack.model.js';
import UserProgress from '../models/UserProgress.model.js';
import QuizAttempt from '../models/QuizAttempt.model.js';

async function seedData() {
  try {
    console.log('🌱 Starting seed data generation...\n');

    // Create Agencies (idempotent - check if exists first)
    console.log('Creating agencies...');
    const agencies = {};
    
    let itscoAgency = await Agency.findBySlug('itsco');
    if (!itscoAgency) {
      agencies.itsco = await Agency.create({
        name: 'ITSCO',
        slug: 'itsco',
        colorPalette: { primary: '#1e40af', secondary: '#3b82f6', accent: '#f97316' },
        isActive: true
      });
      console.log(`  ✓ Created agency: ${agencies.itsco.name}`);
    } else {
      agencies.itsco = itscoAgency;
      console.log(`  ✓ Agency already exists: ${agencies.itsco.name}`);
    }

    let innerStrengthAgency = await Agency.findBySlug('inner-strength');
    if (!innerStrengthAgency) {
      agencies.innerStrength = await Agency.create({
        name: 'Inner Strength Institute',
        slug: 'inner-strength',
        colorPalette: { primary: '#7c3aed', secondary: '#a78bfa', accent: '#ec4899' },
        isActive: true
      });
      console.log(`  ✓ Created agency: ${agencies.innerStrength.name}`);
    } else {
      agencies.innerStrength = innerStrengthAgency;
      console.log(`  ✓ Agency already exists: ${agencies.innerStrength.name}`);
    }

    let nextLevelAgency = await Agency.findBySlug('nextlevelup');
    if (!nextLevelAgency) {
      agencies.nextLevel = await Agency.create({
        name: 'NextLevelUp',
        slug: 'nextlevelup',
        colorPalette: { primary: '#059669', secondary: '#10b981', accent: '#f59e0b' },
        isActive: true
      });
      console.log(`  ✓ Created agency: ${agencies.nextLevel.name}\n`);
    } else {
      agencies.nextLevel = nextLevelAgency;
      console.log(`  ✓ Agency already exists: ${agencies.nextLevel.name}\n`);
    }

    // Create Tracks (idempotent - check if exists first)
    console.log('Creating tracks...');
    const tracks = {};

    // Helper to find or create track
    const findOrCreateTrack = async (name, agencyId, data) => {
      const existingTracks = await TrainingTrack.findAll({ agencyId, includeInactive: true });
      const existing = existingTracks.find(t => t.name === name);
      if (existing) {
        return existing;
      }
      return await TrainingTrack.create({ ...data, name, agencyId });
    };

    // ITSCO Tracks
    tracks.itsco_school = await findOrCreateTrack('School-Based Counseling', agencies.itsco.id, {
      description: 'Training for school-based counseling professionals',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 0
    });
    if (tracks.itsco_school.id) {
      console.log(`  ✓ ${tracks.itsco_school.name === 'School-Based Counseling' ? 'Created' : 'Found existing'} track: ${tracks.itsco_school.name}`);
    }

    tracks.itsco_skill = await findOrCreateTrack('Skill Builders', agencies.itsco.id, {
      description: 'Core skill building modules',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 1
    });
    console.log(`  ✓ Track: ${tracks.itsco_skill.name}`);

    tracks.itsco_supervision = await findOrCreateTrack('Supervision', agencies.itsco.id, {
      description: 'Supervision training track',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 2
    });
    console.log(`  ✓ Track: ${tracks.itsco_supervision.name}`);

    // Inner Strength Tracks
    tracks.inner_office = await findOrCreateTrack('Office-Based Counseling', agencies.innerStrength.id, {
      description: 'Training for office-based counseling',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 0
    });
    console.log(`  ✓ Track: ${tracks.inner_office.name}`);

    tracks.inner_docs = await findOrCreateTrack('Documentation Standards', agencies.innerStrength.id, {
      description: 'Documentation and record keeping standards',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 1
    });
    console.log(`  ✓ Track: ${tracks.inner_docs.name}`);

    // NextLevelUp Tracks
    tracks.next_youth = await findOrCreateTrack('Youth Coaching Basics', agencies.nextLevel.id, {
      description: 'Fundamentals of youth coaching',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 0
    });
    console.log(`  ✓ Track: ${tracks.next_youth.name}`);

    tracks.next_safety = await findOrCreateTrack('Safety & Boundaries', agencies.nextLevel.id, {
      description: 'Safety protocols and professional boundaries',
      assignmentLevel: 'agency',
      isActive: true,
      orderIndex: 1
    });
    console.log(`  ✓ Track: ${tracks.next_safety.name}\n`);

    // Create Shared Modules (idempotent)
    console.log('Creating shared modules...');
    const sharedModules = {};

    // Helper to find or create module
    const findOrCreateModule = async (title, agencyId, data) => {
      const existingModules = await Module.findAll(true, { agencyId, isShared: agencyId === null });
      const existing = existingModules.find(m => m.title === title);
      if (existing) {
        return existing;
      }
      return await Module.create({ ...data, title, agencyId });
    };

    sharedModules.ethics = await findOrCreateModule('Ethics in Schools', null, {
      description: 'Ethical guidelines for working in school settings',
      isActive: true,
      orderIndex: 0,
      isShared: true
    });
    console.log(`  ✓ Shared module: ${sharedModules.ethics.title}`);

    sharedModules.documentation = await findOrCreateModule('Documentation Basics', null, {
      description: 'Fundamental documentation practices',
      isActive: true,
      orderIndex: 0,
      isShared: true
    });
    console.log(`  ✓ Shared module: ${sharedModules.documentation.title}\n`);

    // Create Modules for each track (idempotent)
    console.log('Creating track-specific modules...');
    const modules = {};

    // Helper to find or create module and add to track
    const findOrCreateModuleInTrack = async (title, agencyId, trackId, orderIndex, data) => {
      let module = await findOrCreateModule(title, agencyId, { ...data, title, agencyId });
      // Check if module is already in track
      const trackModules = await TrainingTrack.getModules(trackId);
      const inTrack = trackModules.find(m => m.id === module.id);
      if (!inTrack) {
        await TrainingTrack.addModule(trackId, module.id, orderIndex);
      }
      return module;
    };

    // ITSCO School-Based Counseling modules
    modules.school_intro = await findOrCreateModuleInTrack(
      'Introduction to School-Based Counseling',
      agencies.itsco.id,
      tracks.itsco_school.id,
      0,
      {
        description: 'Overview of school-based counseling practices',
        isActive: true
      }
    );

    modules.school_ethics = await findOrCreateModuleInTrack(
      'Ethics in Schools',
      agencies.itsco.id,
      tracks.itsco_school.id,
      1,
      {
        description: 'Ethical guidelines for working in school settings',
        isActive: true
      }
    );

    modules.school_communication = await findOrCreateModuleInTrack(
      'Communication with Students',
      agencies.itsco.id,
      tracks.itsco_school.id,
      2,
      {
        description: 'Effective communication strategies',
        isActive: true
      }
    );

    modules.school_crisis = await findOrCreateModuleInTrack(
      'Crisis Intervention',
      agencies.itsco.id,
      tracks.itsco_school.id,
      3,
      {
        description: 'Handling crisis situations in schools',
        isActive: true
      }
    );

    modules.school_parents = await findOrCreateModuleInTrack(
      'Working with Parents',
      agencies.itsco.id,
      tracks.itsco_school.id,
      4,
      {
        description: 'Collaborating with parents and guardians',
        isActive: true
      }
    );

    modules.school_assessment = await findOrCreateModuleInTrack(
      'Assessment Techniques',
      agencies.itsco.id,
      tracks.itsco_school.id,
      5,
      {
        description: 'Assessment methods for school settings',
        isActive: true
      }
    );
    console.log(`  ✓ Modules for School-Based Counseling`);

    // ITSCO Skill Builders modules
    modules.skill_ethics = await findOrCreateModuleInTrack(
      'Ethics in Schools',
      agencies.itsco.id,
      tracks.itsco_skill.id,
      0,
      {
        description: 'Ethical guidelines for working in school settings',
        isActive: true
      }
    );

    modules.skill_active = await findOrCreateModuleInTrack(
      'Active Listening',
      agencies.itsco.id,
      tracks.itsco_skill.id,
      1,
      {
        description: 'Developing active listening skills',
        isActive: true
      }
    );

    modules.skill_empathy = await findOrCreateModuleInTrack(
      'Building Empathy',
      agencies.itsco.id,
      tracks.itsco_skill.id,
      2,
      {
        description: 'Cultivating empathetic responses',
        isActive: true
      }
    );

    modules.skill_goals = await findOrCreateModuleInTrack(
      'Goal Setting',
      agencies.itsco.id,
      tracks.itsco_skill.id,
      3,
      {
        description: 'Helping clients set and achieve goals',
        isActive: true
      }
    );

    modules.skill_documentation = await findOrCreateModuleInTrack(
      'Documentation Basics',
      agencies.itsco.id,
      tracks.itsco_skill.id,
      4,
      {
        description: 'Fundamental documentation practices',
        isActive: true
      }
    );
    console.log(`  ✓ Modules for Skill Builders`);

    // ITSCO Supervision modules
    modules.super_roles = await findOrCreateModuleInTrack(
      'Supervisor Roles and Responsibilities',
      agencies.itsco.id,
      tracks.itsco_supervision.id,
      0,
      {
        description: 'Understanding supervisory roles',
        isActive: true
      }
    );

    modules.super_feedback = await findOrCreateModuleInTrack(
      'Providing Effective Feedback',
      agencies.itsco.id,
      tracks.itsco_supervision.id,
      1,
      {
        description: 'Techniques for giving constructive feedback',
        isActive: true
      }
    );

    modules.super_ethics = await findOrCreateModuleInTrack(
      'Supervision Ethics',
      agencies.itsco.id,
      tracks.itsco_supervision.id,
      2,
      {
        description: 'Ethical considerations in supervision',
        isActive: true
      }
    );

    modules.super_evaluation = await findOrCreateModuleInTrack(
      'Performance Evaluation',
      agencies.itsco.id,
      tracks.itsco_supervision.id,
      3,
      {
        description: 'Conducting performance evaluations',
        isActive: true
      }
    );
    console.log(`  ✓ Modules for Supervision`);

    // Inner Strength Office-Based modules
    modules.office_intro = await Module.create({
      title: 'Office-Based Counseling Overview',
      description: 'Introduction to office-based practice',
      isActive: true,
      orderIndex: 0,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_office.id, modules.office_intro.id, 0);

    modules.office_setting = await Module.create({
      title: 'Setting Up Your Office',
      description: 'Creating a therapeutic environment',
      isActive: true,
      orderIndex: 1,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_office.id, modules.office_setting.id, 1);

    modules.office_scheduling = await Module.create({
      title: 'Scheduling and Time Management',
      description: 'Managing appointments and time',
      isActive: true,
      orderIndex: 2,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_office.id, modules.office_scheduling.id, 2);

    modules.office_documentation = await Module.create({
      title: 'Documentation Basics',
      description: 'Fundamental documentation practices',
      isActive: true,
      orderIndex: 3,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_office.id, modules.office_documentation.id, 3);

    modules.office_termination = await Module.create({
      title: 'Treatment Termination',
      description: 'Properly ending therapeutic relationships',
      isActive: true,
      orderIndex: 4,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_office.id, modules.office_termination.id, 4);
    console.log(`  ✓ Created 5 modules for Office-Based Counseling`);

    // Inner Strength Documentation modules
    modules.docs_intro = await Module.create({
      title: 'Documentation Standards Introduction',
      description: 'Overview of documentation requirements',
      isActive: true,
      orderIndex: 0,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_docs.id, modules.docs_intro.id, 0);

    modules.docs_soap = await Module.create({
      title: 'SOAP Notes',
      description: 'Writing effective SOAP notes',
      isActive: true,
      orderIndex: 1,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_docs.id, modules.docs_soap.id, 1);

    modules.docs_progress = await Module.create({
      title: 'Progress Notes',
      description: 'Documenting client progress',
      isActive: true,
      orderIndex: 2,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_docs.id, modules.docs_progress.id, 2);

    modules.docs_compliance = await Module.create({
      title: 'Compliance and Legal Requirements',
      description: 'Meeting legal documentation standards',
      isActive: true,
      orderIndex: 3,
      agencyId: agencies.innerStrength.id
    });
    await TrainingTrack.addModule(tracks.inner_docs.id, modules.docs_compliance.id, 3);
    console.log(`  ✓ Created 4 modules for Documentation Standards`);

    // NextLevelUp Youth Coaching modules
    modules.youth_intro = await Module.create({
      title: 'Youth Coaching Fundamentals',
      description: 'Introduction to youth coaching',
      isActive: true,
      orderIndex: 0,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_youth.id, modules.youth_intro.id, 0);

    modules.youth_engagement = await Module.create({
      title: 'Engaging Youth',
      description: 'Strategies for engaging young people',
      isActive: true,
      orderIndex: 1,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_youth.id, modules.youth_engagement.id, 1);

    modules.youth_motivation = await Module.create({
      title: 'Motivation Techniques',
      description: 'Motivating youth participants',
      isActive: true,
      orderIndex: 2,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_youth.id, modules.youth_motivation.id, 2);

    modules.youth_activities = await Module.create({
      title: 'Activity Planning',
      description: 'Planning effective activities for youth',
      isActive: true,
      orderIndex: 3,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_youth.id, modules.youth_activities.id, 3);

    modules.youth_communication = await Module.create({
      title: 'Communication with Youth',
      description: 'Effective communication with young people',
      isActive: true,
      orderIndex: 4,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_youth.id, modules.youth_communication.id, 4);
    console.log(`  ✓ Created 5 modules for Youth Coaching Basics`);

    // NextLevelUp Safety & Boundaries modules
    modules.safety_intro = await Module.create({
      title: 'Safety & Boundaries Overview',
      description: 'Introduction to safety and boundaries',
      isActive: true,
      orderIndex: 0,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_safety.id, modules.safety_intro.id, 0);

    modules.safety_physical = await Module.create({
      title: 'Physical Safety Protocols',
      description: 'Ensuring physical safety in programs',
      isActive: true,
      orderIndex: 1,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_safety.id, modules.safety_physical.id, 1);

    modules.safety_emotional = await Module.create({
      title: 'Emotional Boundaries',
      description: 'Maintaining appropriate emotional boundaries',
      isActive: true,
      orderIndex: 2,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_safety.id, modules.safety_emotional.id, 2);

    modules.safety_reporting = await Module.create({
      title: 'Reporting Procedures',
      description: 'When and how to report safety concerns',
      isActive: true,
      orderIndex: 3,
      agencyId: agencies.nextLevel.id
    });
    await TrainingTrack.addModule(tracks.next_safety.id, modules.safety_reporting.id, 3);
    console.log(`  ✓ Created 4 modules for Safety & Boundaries\n`);

    // Create Users
    console.log('Creating users...');
    const users = {};
    const passwordHash = await bcrypt.hash('password123', 10);

    // ITSCO Users
    users.itsco_user1 = await User.create({
      email: 'john.doe@itsco.com',
      passwordHash,
      firstName: 'John',
      lastName: 'Doe',
      role: 'clinician'
    });
    await User.assignToAgency(users.itsco_user1.id, agencies.itsco.id);
    console.log(`  ✓ Created user: ${users.itsco_user1.email}`);

    users.itsco_user2 = await User.create({
      email: 'jane.smith@itsco.com',
      passwordHash,
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'facilitator'
    });
    await User.assignToAgency(users.itsco_user2.id, agencies.itsco.id);
    console.log(`  ✓ Created user: ${users.itsco_user2.email}`);

    users.itsco_user3 = await User.create({
      email: 'mike.johnson@itsco.com',
      passwordHash,
      firstName: 'Mike',
      lastName: 'Johnson',
      role: 'intern'
    });
    await User.assignToAgency(users.itsco_user3.id, agencies.itsco.id);
    console.log(`  ✓ Created user: ${users.itsco_user3.email}`);

    users.itsco_admin = await User.create({
      email: 'admin@itsco.com',
      passwordHash,
      firstName: 'ITSCO',
      lastName: 'Admin',
      role: 'admin'
    });
    await User.assignToAgency(users.itsco_admin.id, agencies.itsco.id);
    console.log(`  ✓ Created admin: ${users.itsco_admin.email}`);

    // Inner Strength Users
    users.inner_user1 = await User.create({
      email: 'sarah.williams@innerstrength.com',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Williams',
      role: 'clinician'
    });
    await User.assignToAgency(users.inner_user1.id, agencies.innerStrength.id);
    console.log(`  ✓ Created user: ${users.inner_user1.email}`);

    users.inner_user2 = await User.create({
      email: 'david.brown@innerstrength.com',
      passwordHash,
      firstName: 'David',
      lastName: 'Brown',
      role: 'supervisor'
    });
    await User.assignToAgency(users.inner_user2.id, agencies.innerStrength.id);
    console.log(`  ✓ Created user: ${users.inner_user2.email}`);

    users.inner_admin = await User.create({
      email: 'admin@innerstrength.com',
      passwordHash,
      firstName: 'Inner Strength',
      lastName: 'Admin',
      role: 'admin'
    });
    await User.assignToAgency(users.inner_admin.id, agencies.innerStrength.id);
    console.log(`  ✓ Created admin: ${users.inner_admin.email}`);

    // NextLevelUp Users
    users.next_user1 = await User.create({
      email: 'emily.davis@nextlevelup.com',
      passwordHash,
      firstName: 'Emily',
      lastName: 'Davis',
      role: 'facilitator'
    });
    await User.assignToAgency(users.next_user1.id, agencies.nextLevel.id);
    console.log(`  ✓ Created user: ${users.next_user1.email}`);

    users.next_user2 = await User.create({
      email: 'chris.wilson@nextlevelup.com',
      passwordHash,
      firstName: 'Chris',
      lastName: 'Wilson',
      role: 'clinician'
    });
    await User.assignToAgency(users.next_user2.id, agencies.nextLevel.id);
    console.log(`  ✓ Created user: ${users.next_user2.email}`);

    users.next_admin = await User.create({
      email: 'admin@nextlevelup.com',
      passwordHash,
      firstName: 'NextLevelUp',
      lastName: 'Admin',
      role: 'admin'
    });
    await User.assignToAgency(users.next_admin.id, agencies.nextLevel.id);
    console.log(`  ✓ Created admin: ${users.next_admin.email}`);

    // Multi-agency user
    users.multi_user = await User.create({
      email: 'lisa.anderson@example.com',
      passwordHash,
      firstName: 'Lisa',
      lastName: 'Anderson',
      role: 'clinician'
    });
    await User.assignToAgency(users.multi_user.id, agencies.itsco.id);
    await User.assignToAgency(users.multi_user.id, agencies.innerStrength.id);
    console.log(`  ✓ Created multi-agency user: ${users.multi_user.email}\n`);

    // Assign users to tracks
    console.log('Assigning users to tracks...');
    
    // ITSCO assignments
    await UserTrack.assignUserToTrack(users.itsco_user1.id, tracks.itsco_school.id, agencies.itsco.id, users.itsco_admin.id);
    await UserTrack.assignUserToTrack(users.itsco_user1.id, tracks.itsco_skill.id, agencies.itsco.id, users.itsco_admin.id);
    await UserTrack.assignUserToTrack(users.itsco_user2.id, tracks.itsco_school.id, agencies.itsco.id, users.itsco_admin.id);
    await UserTrack.assignUserToTrack(users.itsco_user3.id, tracks.itsco_skill.id, agencies.itsco.id, users.itsco_admin.id);
    await UserTrack.assignUserToTrack(users.itsco_user3.id, tracks.itsco_supervision.id, agencies.itsco.id, users.itsco_admin.id);
    await UserTrack.assignUserToTrack(users.multi_user.id, tracks.itsco_school.id, agencies.itsco.id, users.itsco_admin.id);
    console.log(`  ✓ Assigned ITSCO users to tracks`);

    // Inner Strength assignments
    await UserTrack.assignUserToTrack(users.inner_user1.id, tracks.inner_office.id, agencies.innerStrength.id, users.inner_admin.id);
    await UserTrack.assignUserToTrack(users.inner_user1.id, tracks.inner_docs.id, agencies.innerStrength.id, users.inner_admin.id);
    await UserTrack.assignUserToTrack(users.inner_user2.id, tracks.inner_office.id, agencies.innerStrength.id, users.inner_admin.id);
    await UserTrack.assignUserToTrack(users.multi_user.id, tracks.inner_office.id, agencies.innerStrength.id, users.inner_admin.id);
    console.log(`  ✓ Assigned Inner Strength users to tracks`);

    // NextLevelUp assignments
    await UserTrack.assignUserToTrack(users.next_user1.id, tracks.next_youth.id, agencies.nextLevel.id, users.next_admin.id);
    await UserTrack.assignUserToTrack(users.next_user1.id, tracks.next_safety.id, agencies.nextLevel.id, users.next_admin.id);
    await UserTrack.assignUserToTrack(users.next_user2.id, tracks.next_youth.id, agencies.nextLevel.id, users.next_admin.id);
    console.log(`  ✓ Assigned NextLevelUp users to tracks\n`);

    // Create progress data
    console.log('Creating progress data...');
    
    // Helper function to create progress
    const createProgress = async (userId, moduleId, status, timeMinutes, timeSeconds) => {
      await UserProgress.createOrUpdate(userId, moduleId, { status });
      if (timeMinutes > 0 || timeSeconds > 0) {
        await pool.execute(
          'UPDATE user_progress SET time_spent_minutes = ?, time_spent_seconds = ? WHERE user_id = ? AND module_id = ?',
          [timeMinutes, timeSeconds, userId, moduleId]
        );
      }
    };

    // ITSCO User 1 - School-Based Counseling (mostly complete)
    await createProgress(users.itsco_user1.id, modules.school_intro.id, 'completed', 25, 1500);
    await createProgress(users.itsco_user1.id, modules.school_ethics.id, 'completed', 30, 1800);
    await createProgress(users.itsco_user1.id, modules.school_communication.id, 'completed', 20, 1200);
    await createProgress(users.itsco_user1.id, modules.school_crisis.id, 'in_progress', 15, 900);
    await createProgress(users.itsco_user1.id, modules.school_parents.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user1.id, modules.school_assessment.id, 'not_started', 0, 0);
    
    // ITSCO User 1 - Skill Builders (partial)
    await createProgress(users.itsco_user1.id, modules.skill_ethics.id, 'completed', 28, 1680);
    await createProgress(users.itsco_user1.id, modules.skill_active.id, 'in_progress', 12, 720);
    await createProgress(users.itsco_user1.id, modules.skill_empathy.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user1.id, modules.skill_goals.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user1.id, modules.skill_documentation.id, 'not_started', 0, 0);

    // ITSCO User 2 - School-Based Counseling (in progress)
    await createProgress(users.itsco_user2.id, modules.school_intro.id, 'completed', 22, 1320);
    await createProgress(users.itsco_user2.id, modules.school_ethics.id, 'in_progress', 18, 1080);
    await createProgress(users.itsco_user2.id, modules.school_communication.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user2.id, modules.school_crisis.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user2.id, modules.school_parents.id, 'not_started', 0, 0);
    await createProgress(users.itsco_user2.id, modules.school_assessment.id, 'not_started', 0, 0);

    // ITSCO User 3 - Skill Builders (not started)
    // No progress for this user

    // Inner Strength User 1 - Office-Based (complete)
    await createProgress(users.inner_user1.id, modules.office_intro.id, 'completed', 30, 1800);
    await createProgress(users.inner_user1.id, modules.office_setting.id, 'completed', 25, 1500);
    await createProgress(users.inner_user1.id, modules.office_scheduling.id, 'completed', 20, 1200);
    await createProgress(users.inner_user1.id, modules.office_documentation.id, 'completed', 35, 2100);
    await createProgress(users.inner_user1.id, modules.office_termination.id, 'completed', 18, 1080);

    // Inner Strength User 1 - Documentation (partial)
    await createProgress(users.inner_user1.id, modules.docs_intro.id, 'completed', 22, 1320);
    await createProgress(users.inner_user1.id, modules.docs_soap.id, 'in_progress', 15, 900);
    await createProgress(users.inner_user1.id, modules.docs_progress.id, 'not_started', 0, 0);
    await createProgress(users.inner_user1.id, modules.docs_compliance.id, 'not_started', 0, 0);

    // NextLevelUp User 1 - Youth Coaching (mostly complete)
    await createProgress(users.next_user1.id, modules.youth_intro.id, 'completed', 28, 1680);
    await createProgress(users.next_user1.id, modules.youth_engagement.id, 'completed', 32, 1920);
    await createProgress(users.next_user1.id, modules.youth_motivation.id, 'completed', 25, 1500);
    await createProgress(users.next_user1.id, modules.youth_activities.id, 'in_progress', 10, 600);
    await createProgress(users.next_user1.id, modules.youth_communication.id, 'not_started', 0, 0);

    // NextLevelUp User 1 - Safety (partial)
    await createProgress(users.next_user1.id, modules.safety_intro.id, 'completed', 20, 1200);
    await createProgress(users.next_user1.id, modules.safety_physical.id, 'in_progress', 12, 720);
    await createProgress(users.next_user1.id, modules.safety_emotional.id, 'not_started', 0, 0);
    await createProgress(users.next_user1.id, modules.safety_reporting.id, 'not_started', 0, 0);

    // NextLevelUp User 2 - Youth Coaching (not started)
    // No progress

    console.log(`  ✓ Created progress data for users\n`);

    // Create quiz attempts
    console.log('Creating quiz attempts...');
    
    const createQuizAttempt = async (userId, moduleId, score) => {
      await QuizAttempt.create({
        userId,
        moduleId,
        score,
        answers: { question1: 'answer1', question2: 'answer2' }
      });
    };

    // ITSCO User 1 quiz attempts
    await createQuizAttempt(users.itsco_user1.id, modules.school_intro.id, 85.5);
    await createQuizAttempt(users.itsco_user1.id, modules.school_ethics.id, 92.0);
    await createQuizAttempt(users.itsco_user1.id, modules.school_communication.id, 78.5);
    await createQuizAttempt(users.itsco_user1.id, modules.school_crisis.id, 65.0); // Failed, retaking
    await createQuizAttempt(users.itsco_user1.id, modules.skill_ethics.id, 88.0);
    await createQuizAttempt(users.itsco_user1.id, modules.skill_active.id, 75.0);

    // ITSCO User 2 quiz attempts
    await createQuizAttempt(users.itsco_user2.id, modules.school_intro.id, 90.0);
    await createQuizAttempt(users.itsco_user2.id, modules.school_ethics.id, 82.5);

    // Inner Strength User 1 quiz attempts
    await createQuizAttempt(users.inner_user1.id, modules.office_intro.id, 95.0);
    await createQuizAttempt(users.inner_user1.id, modules.office_setting.id, 88.5);
    await createQuizAttempt(users.inner_user1.id, modules.office_scheduling.id, 91.0);
    await createQuizAttempt(users.inner_user1.id, modules.office_documentation.id, 87.0);
    await createQuizAttempt(users.inner_user1.id, modules.office_termination.id, 93.5);
    await createQuizAttempt(users.inner_user1.id, modules.docs_intro.id, 89.0);
    await createQuizAttempt(users.inner_user1.id, modules.docs_soap.id, 76.0);

    // NextLevelUp User 1 quiz attempts
    await createQuizAttempt(users.next_user1.id, modules.youth_intro.id, 92.5);
    await createQuizAttempt(users.next_user1.id, modules.youth_engagement.id, 85.0);
    await createQuizAttempt(users.next_user1.id, modules.youth_motivation.id, 90.0);
    await createQuizAttempt(users.next_user1.id, modules.safety_intro.id, 88.0);
    await createQuizAttempt(users.next_user1.id, modules.safety_physical.id, 82.5);

    console.log(`  ✓ Created quiz attempts\n`);

    console.log('✅ Seed data generation completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - ${Object.keys(agencies).length} agencies`);
    console.log(`   - ${Object.keys(tracks).length} tracks`);
    console.log(`   - ${Object.keys(modules).length + Object.keys(sharedModules).length} modules`);
    console.log(`   - ${Object.keys(users).length} users`);
    console.log(`   - Progress data for multiple users`);
    console.log(`   - Quiz attempts with varying scores`);
    console.log('\n🔑 Default password for all users: password123');

  } catch (error) {
    console.error('❌ Error generating seed data:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

seedData();

