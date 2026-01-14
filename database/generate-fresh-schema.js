#!/usr/bin/env node
/**
 * Generate Fresh Database Schema
 * 
 * This script connects to your current database and generates a clean
 * schema file that represents the FINAL desired state (not the migration history).
 * 
 * This is perfect for fresh databases - just run this one file instead of 107 migrations.
 * 
 * Usage:
 *   node database/generate-fresh-schema.js [--output=path/to/file.sql]
 */

import pool from '../backend/src/config/database.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function getTableSchemas() {
  const [tables] = await pool.execute(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE()
    AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  
  const schemas = [];
  
  for (const table of tables) {
    const tableName = table.table_name;
    
    // Get CREATE TABLE statement
    const [createTable] = await pool.execute(`SHOW CREATE TABLE \`${tableName}\``);
    const createStatement = createTable[0]['Create Table'];
    
    schemas.push({
      name: tableName,
      createStatement
    });
  }
  
  return schemas;
}

async function generateFreshSchema() {
  try {
    console.log('🔌 Connecting to database...');
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✅ Connected\n');
    
    console.log('📋 Generating schema from current database state...');
    const schemas = await getTableSchemas();
    
    let sql = `-- Fresh Database Schema
-- Generated: ${new Date().toISOString()}
-- This schema represents the FINAL desired state of the database
-- Use this for fresh database installations instead of running all migrations
--
-- Total tables: ${schemas.length}
--

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'onboarding_stage'}\`;
USE \`${process.env.DB_NAME || 'onboarding_stage'}\`;

`;

    // Add all CREATE TABLE statements
    for (const schema of schemas) {
      sql += `-- Table: ${schema.name}\n`;
      sql += `${schema.createStatement};\n\n`;
    }
    
    // Add any views, procedures, triggers, etc. if needed
    sql += `-- Schema generation complete\n`;
    
    const outputPath = path.join(__dirname, 'fresh_schema.sql');
    await fs.writeFile(outputPath, sql);
    
    console.log(`✅ Fresh schema generated: ${outputPath}`);
    console.log(`   Tables: ${schemas.length}`);
    console.log(`   File size: ${(sql.length / 1024).toFixed(2)} KB\n`);
    console.log('💡 Use this file for fresh database installations!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

generateFreshSchema();
