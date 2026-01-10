import ApprovedEmployee from '../models/ApprovedEmployee.model.js';
import { validationResult } from 'express-validator';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for CSV uploads
const csvStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `csv-${uniqueSuffix}.csv`);
  }
});

const csvFileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || 
      file.originalname.toLowerCase().endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
  }
};

export const uploadCsv = multer({
  storage: csvStorage,
  fileFilter: csvFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

export const getApprovedEmployees = async (req, res, next) => {
  try {
    const { agencyId } = req.query;
    const userRole = req.user.role;

    let targetAgencyId = agencyId;

    // Agency admins can only see their own agency's approved employees
    if (userRole === 'admin' && !targetAgencyId) {
      // Get user's agencies
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      if (userAgencies.length > 0) {
        targetAgencyId = userAgencies[0].id;
      }
    }

    if (!targetAgencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Get approved employees from approved_employee_emails table
    const employees = await ApprovedEmployee.findByAgency(targetAgencyId);
    
    // Also get users who are inactive (is_active = false) from the same agency (exclude terminated and archived)
    // This includes users with status='completed' OR any inactive users
    const User = (await import('../models/User.model.js')).default;
    const pool = (await import('../config/database.js')).default;
    
    // Get all inactive users (is_active = false) for this agency (exclude terminated and archived)
    // This will show users who have been marked as inactive, regardless of their status
    const [inactiveUsers] = await pool.execute(
      `SELECT DISTINCT u.id, u.email, u.first_name, u.last_name, u.status, u.completed_at, u.terminated_at, u.is_active, u.is_archived, u.created_at
       FROM users u
       INNER JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ? 
       AND u.is_active = FALSE
       AND u.status != 'terminated'
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       ORDER BY u.completed_at DESC, u.created_at DESC`,
      [targetAgencyId]
    );
    
    // Create a map of inactive user emails to user data for quick lookup
    const inactiveUserMap = new Map();
    for (const user of inactiveUsers) {
      inactiveUserMap.set(user.email.toLowerCase(), user);
    }
    
    // Mark employees that correspond to inactive users
    const combinedEmployees = employees.map(emp => {
      const inactiveUser = inactiveUserMap.get(emp.email.toLowerCase());
      if (inactiveUser) {
        // This employee corresponds to an inactive user
        // If the user is inactive, the employee should be treated as inactive regardless of approved_employee_emails.is_active
        return {
          ...emp,
          is_from_user_table: true,
          user_id: inactiveUser.id,
          status: inactiveUser.status || 'inactive',
          first_name: inactiveUser.first_name || emp.first_name,
          last_name: inactiveUser.last_name || emp.last_name,
          is_active: false // Always false if user is inactive in users table
        };
      }
      return emp;
    });
    
    // Add inactive users that don't exist in approved_employee_emails
    for (const user of inactiveUsers) {
      // Check if this email already exists in approved employees
      const exists = combinedEmployees.some(emp => emp.email.toLowerCase() === user.email.toLowerCase());
      if (!exists) {
        // Only include if not archived
        if (!user.is_archived || user.is_archived === 0) {
          combinedEmployees.push({
            id: `user-${user.id}`, // Prefix to avoid conflicts
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            status: user.status || 'inactive',
            completed_at: user.completed_at,
            terminated_at: user.terminated_at,
            created_at: user.created_at,
            verified_at: user.completed_at || user.created_at, // Use completed_at or created_at as verified_at
            requires_verification: false,
            is_active: false, // These are inactive users
            is_archived: user.is_archived || false,
            is_from_user_table: true, // Flag to indicate this came from users table
            user_id: user.id
          });
        }
      }
    }
    
    res.json(combinedEmployees);
  } catch (error) {
    next(error);
  }
};

export const addApprovedEmployee = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { email, agencyId, requiresVerification, password } = req.body;
    const createdByUserId = req.user.id;

    // Check if email belongs to an active user
    const User = (await import('../models/User.model.js')).default;
    const activeUser = await User.findByEmail(email);
    if (activeUser && activeUser.is_active === true && activeUser.status !== 'completed') {
      return res.status(400).json({ 
        error: { 
          message: 'This email belongs to an active user. Active users cannot be added as approved employees.' 
        } 
      });
    }

    // Check if email already exists for this agency
    const existing = await ApprovedEmployee.findByEmail(email, agencyId);
    if (existing) {
      return res.status(400).json({ error: { message: 'Email already approved for this agency' } });
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      const bcrypt = (await import('bcrypt')).default;
      passwordHash = await bcrypt.hash(password, 10);
    }

    const employee = await ApprovedEmployee.create({
      email,
      agencyId,
      requiresVerification: requiresVerification || false,
      createdByUserId,
      passwordHash
    });

    res.status(201).json(employee);
  } catch (error) {
    if (error.message && error.message.includes('password')) {
      return res.status(400).json({ error: { message: error.message } });
    }
    next(error);
  }
};

export const bulkAddApprovedEmployees = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { emails, agencyId } = req.body;
    const createdByUserId = req.user.id;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: { message: 'Emails array is required' } });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(email => emailRegex.test(email.trim()));
    
    if (validEmails.length === 0) {
      return res.status(400).json({ error: { message: 'No valid emails provided' } });
    }

    // Check for active users
    const User = (await import('../models/User.model.js')).default;
    const activeUserEmails = [];
    for (const email of validEmails) {
      const activeUser = await User.findByEmail(email);
      if (activeUser && activeUser.is_active === true && activeUser.status !== 'completed') {
        activeUserEmails.push(email);
      }
    }

    if (activeUserEmails.length > 0) {
      return res.status(400).json({ 
        error: { 
          message: `The following emails belong to active users and cannot be added as approved employees: ${activeUserEmails.join(', ')}` 
        } 
      });
    }

    const employees = await ApprovedEmployee.bulkCreate(validEmails, agencyId, createdByUserId);
    res.status(201).json({ message: 'Employees added successfully', count: employees.length, employees });
  } catch (error) {
    next(error);
  }
};

export const importFromCsv = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No CSV file uploaded' } });
    }

    const { agencyId } = req.body;
    const createdByUserId = req.user.id;

    if (!agencyId) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    // Read and parse CSV file
    const fileContent = await fs.readFile(req.file.path, 'utf-8');
    let records;
    
    try {
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true
      });
    } catch (parseError) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ 
        error: { message: `Failed to parse CSV file: ${parseError.message}` } 
      });
    }

    if (!records || records.length === 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: { message: 'CSV file is empty or has no data rows' } });
    }

    // Extract emails from CSV
    // Support multiple column names: email, Email, EMAIL, e-mail, etc.
    const emailColumn = Object.keys(records[0] || {}).find(
      key => key.toLowerCase().includes('email')
    );

    if (!emailColumn) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ 
        error: { message: 'CSV file must contain an "email" column' } 
      });
    }

    const emails = records
      .map(record => {
        const email = record[emailColumn] || record.email || record.Email || record.EMAIL;
        return email ? email.trim() : null;
      })
      .filter(email => email && email.length > 0);

    if (emails.length === 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: { message: 'No valid emails found in CSV file' } });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validEmails = emails.filter(email => emailRegex.test(email));
    
    if (validEmails.length === 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: { message: 'No valid email addresses found in CSV file' } });
    }

    // Check for active users
    const User = (await import('../models/User.model.js')).default;
    const activeUserEmails = [];
    for (const email of validEmails) {
      const activeUser = await User.findByEmail(email);
      if (activeUser && activeUser.is_active === true && activeUser.status !== 'completed') {
        activeUserEmails.push(email);
      }
    }

    if (activeUserEmails.length > 0) {
      await fs.unlink(req.file.path);
      return res.status(400).json({ 
        error: { 
          message: `The following emails belong to active users and cannot be added as approved employees: ${activeUserEmails.join(', ')}` 
        } 
      });
    }

    // Use existing bulkCreate method
    const employees = await ApprovedEmployee.bulkCreate(validEmails, parseInt(agencyId), createdByUserId);
    
    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.status(201).json({ 
      message: `Successfully imported ${employees.length} employee(s) from CSV`,
      count: employees.length,
      employees,
      skipped: validEmails.length - employees.length
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (err) {
        console.error('Failed to clean up CSV file:', err);
      }
    }
    next(error);
  }
};

export const updateApprovedEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if this is a user from the users table (prefixed with 'user-')
    if (id.startsWith('user-')) {
      const userId = parseInt(id.replace('user-', ''));
      const User = (await import('../models/User.model.js')).default;
      
      // Handle deactivation
      if (updates.isActive === false) {
        await User.deactivate(userId);
        const user = await User.findById(userId);
        return res.json({
          id: `user-${user.id}`,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          status: user.status,
          is_active: false,
          is_from_user_table: true,
          user_id: user.id
        });
      }
      
      // Handle termination
      if (updates.status === 'terminated') {
        await User.updateStatus(userId, 'terminated');
        const user = await User.findById(userId);
        return res.json({
          id: `user-${user.id}`,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          status: 'terminated',
          terminated_at: user.terminated_at,
          is_active: user.is_active,
          is_from_user_table: true,
          user_id: user.id
        });
      }
      
      return res.status(400).json({ error: { message: 'Invalid update for user' } });
    }

    const employee = await ApprovedEmployee.findById(id);
    if (!employee) {
      return res.status(404).json({ error: { message: 'Approved employee not found' } });
    }

    const updated = await ApprovedEmployee.update(id, updates);
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteApprovedEmployee = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await ApprovedEmployee.findById(id);
    
    if (!employee) {
      return res.status(404).json({ error: { message: 'Approved employee not found' } });
    }

    await ApprovedEmployee.delete(id);
    res.json({ message: 'Approved employee removed successfully' });
  } catch (error) {
    next(error);
  }
};

export const archiveUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if this is a user from the users table (prefixed with 'user-')
    if (id.startsWith('user-')) {
      const userId = parseInt(id.replace('user-', ''));
      const User = (await import('../models/User.model.js')).default;
      
      // Archive the user
      const archived = await User.archive(userId, req.user.id);
      if (!archived) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      
      const user = await User.findById(userId);
      return res.json({
        message: 'User archived successfully',
        user: {
          id: `user-${user.id}`,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          status: user.status,
          is_archived: true,
          is_from_user_table: true,
          user_id: user.id
        }
      });
    }
    
    // If it's from approved_employee_emails table, remove it
    const employee = await ApprovedEmployee.findById(id);
    if (!employee) {
      return res.status(404).json({ error: { message: 'Approved employee not found' } });
    }
    
    // Check if there's an associated user and archive them too
    const User = (await import('../models/User.model.js')).default;
    const user = await User.findByEmail(employee.email);
    if (user) {
      await User.archive(user.id, req.user.id);
    }
    
    // Remove from approved_employee_emails
    await ApprovedEmployee.delete(id);
    
    res.json({ message: 'Approved employee archived successfully' });
  } catch (error) {
    next(error);
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    }

    const bcrypt = (await import('bcrypt')).default;
    const passwordHash = await bcrypt.hash(password, 10);

    // Check if this is a user from the users table (prefixed with 'user-')
    if (id.startsWith('user-')) {
      // For users from users table, we need to add/update them in approved_employee_emails
      const userId = parseInt(id.replace('user-', ''));
      const User = (await import('../models/User.model.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }

      // Find or create approved employee entry
      const existing = await ApprovedEmployee.findByEmail(user.email);
      if (existing) {
        await ApprovedEmployee.updatePassword(existing.id, passwordHash);
        return res.json({ message: 'Password updated successfully', employee: await ApprovedEmployee.findById(existing.id) });
      } else {
        // Get user's first agency
        const agencies = await User.getAgencies(userId);
        if (agencies.length === 0) {
          return res.status(400).json({ error: { message: 'User is not associated with any agency' } });
        }
        const employee = await ApprovedEmployee.create({
          email: user.email,
          agencyId: agencies[0].id,
          requiresVerification: false,
          passwordHash: passwordHash
        });
        return res.json({ message: 'Password set successfully', employee });
      }
    }

    const employee = await ApprovedEmployee.findById(id);
    if (!employee) {
      return res.status(404).json({ error: { message: 'Approved employee not found' } });
    }

    await ApprovedEmployee.updatePassword(id, passwordHash);
    res.json({ message: 'Password updated successfully', employee: await ApprovedEmployee.findById(id) });
  } catch (error) {
    next(error);
  }
};

export const setCompanyDefaultPassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { agencyId, password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    }

    const bcrypt = (await import('bcrypt')).default;
    const passwordHash = await bcrypt.hash(password, 10);

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(agencyId);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    // Update agency with new default password
    await Agency.update(agencyId, { companyDefaultPasswordHash: passwordHash });

    // Update all approved employees without individual passwords (only if use_default_password is enabled)
    const useDefaultPassword = agency.use_default_password !== undefined ? agency.use_default_password : true;
    if (useDefaultPassword) {
      await ApprovedEmployee.updateAllPasswordsFromDefault(agencyId, passwordHash);
    }

    res.json({ message: 'Company default password updated successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateAgencyDefaultPasswordToggle = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { agencyId, useDefaultPassword } = req.body;

    if (useDefaultPassword === undefined) {
      return res.status(400).json({ error: { message: 'useDefaultPassword is required' } });
    }

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(agencyId);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    // Update agency toggle
    await Agency.update(agencyId, { useDefaultPassword });

    // If turning off default password, check that all employees have individual passwords
    if (!useDefaultPassword) {
      const employees = await ApprovedEmployee.findByAgency(agencyId, true);
      const employeesWithoutPasswords = employees.filter(emp => !emp.password_hash || emp.password_hash.trim() === '');
      
      if (employeesWithoutPasswords.length > 0) {
        return res.status(400).json({ 
          error: { 
            message: `Cannot disable default password. ${employeesWithoutPasswords.length} employee(s) do not have individual passwords set. Please set passwords for all employees first.`,
            employeesWithoutPasswords: employeesWithoutPasswords.map(e => e.email)
          } 
        });
      }
    }

    res.json({ 
      message: 'Agency default password setting updated successfully',
      useDefaultPassword 
    });
  } catch (error) {
    next(error);
  }
};

export const getAgencyPasswordSettings = async (req, res, next) => {
  try {
    const { agencyId } = req.query;

    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(agencyId);
    
    if (!agency) {
      return res.status(404).json({ error: { message: 'Agency not found' } });
    }

    res.json({
      useDefaultPassword: agency.use_default_password !== undefined ? agency.use_default_password : true,
      hasDefaultPassword: !!agency.company_default_password_hash
    });
  } catch (error) {
    next(error);
  }
};

export const sendVerificationEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const employee = await ApprovedEmployee.findById(id);
    
    if (!employee) {
      return res.status(404).json({ error: { message: 'Approved employee not found' } });
    }

    if (employee.verified_at) {
      return res.status(400).json({ error: { message: 'Email already verified' } });
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await ApprovedEmployee.setVerificationToken(employee.id, token, expiresAt);

    // TODO: Send email with verification link
    // For now, return the token (in production, send via email)
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;
    
    res.json({
      message: 'Verification email sent',
      verificationUrl // Remove this in production, send via email instead
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: { message: 'Verification token is required' } });
    }

    const employee = await ApprovedEmployee.verifyEmail(token);
    
    if (!employee) {
      return res.status(400).json({ error: { message: 'Invalid or expired verification token' } });
    }

    res.json({ message: 'Email verified successfully', employee });
  } catch (error) {
    next(error);
  }
};

