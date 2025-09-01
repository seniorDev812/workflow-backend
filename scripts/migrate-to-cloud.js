#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Cloud PostgreSQL Migration Script');
console.log('=====================================\n');

// Check if .env file exists
const envPath = join(__dirname, '../.env');
if (!existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('Please create a .env file with your cloud database configuration.');
  process.exit(1);
}

// Read current .env
const envContent = readFileSync(envPath, 'utf8');

// Check if DATABASE_URL is already cloud-based
if (envContent.includes('supabase.co') || envContent.includes('neon.tech')) {
  console.log('✅ Database URL appears to be cloud-based already');
  console.log('Current DATABASE_URL:', envContent.match(/DATABASE_URL="([^"]+)"/)?.[1] || 'Not found');
} else {
  console.log('⚠️  Database URL appears to be local');
  console.log('Please update your .env file with cloud database URL first');
  console.log('See CLOUD_SETUP.md for instructions\n');
}

console.log('\n📋 Migration Steps:');
console.log('1. Update .env with cloud DATABASE_URL');
console.log('2. Run: npm run generate');
console.log('3. Run: npm run migrate');
console.log('4. Test connection');

console.log('\n🔧 Available Commands:');
console.log('- npm run generate    # Generate Prisma client');
console.log('- npm run migrate     # Run database migrations');
console.log('- npm run studio      # Open Prisma Studio');
console.log('- npm run dev         # Start development server');

console.log('\n📚 For detailed instructions, see: CLOUD_SETUP.md');

// Check if we can connect to database
try {
  console.log('\n🔍 Testing database connection...');
  execSync('npm run generate', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  console.log('✅ Prisma client generated successfully');
} catch (error) {
  console.log('❌ Failed to generate Prisma client');
  console.log('Please check your DATABASE_URL and try again');
}
