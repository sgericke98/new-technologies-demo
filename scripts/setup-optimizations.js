#!/usr/bin/env node

/**
 * Database Optimization Setup Script
 * 
 * This script applies database optimizations to improve performance
 * while maintaining full data access for the BAIN platform.
 * 
 * Run with: node scripts/setup-optimizations.js
 */

const fs = require('fs');
const path = require('path');


// Check if we're in a Supabase project
const supabaseConfigPath = path.join(process.cwd(), 'supabase', 'config.toml');
if (!fs.existsSync(supabaseConfigPath)) {
  process.exit(1);
}

// Read the optimizations SQL file
const optimizationsPath = path.join(process.cwd(), 'supabase', 'optimizations.sql');
if (!fs.existsSync(optimizationsPath)) {
  process.exit(1);
}






