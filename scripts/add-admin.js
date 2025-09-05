#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔐 Admin User Setup Script');
console.log('==========================\n');

// Check if .env file exists
const envPath = join(__dirname, '../.env');
if (!existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('Please create a .env file with your database configuration.');
  process.exit(1);
}

// Read .env file to get DATABASE_URL
const envContent = readFileSync(envPath, 'utf8');
const databaseUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);
if (!databaseUrlMatch) {
  console.error('❌ DATABASE_URL not found in .env file!');
  process.exit(1);
}

const prisma = new PrismaClient();

async function addAdminUser() {
  try {
    console.log('🔍 Checking if admin user already exists...');
    
    // Check if admin user already exists
    const existingAdmin = await prisma.users.findFirst({
      where: {
        role: 'ADMIN'
      }
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.name}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Created: ${existingAdmin.createdAt}`);
      return;
    }

    // Default admin credentials
    const adminEmail = 'admin@flow.com';
    const adminPassword = 'admin123!';
    const adminName = 'System Administrator';

    console.log('🔐 Creating admin user...');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Name: ${adminName}`);

    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

    // Create admin user
    const adminUser = await prisma.users.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
        name: adminName,
        role: 'ADMIN',
        isActive: true,
        backupCodes: JSON.stringify([]), // Empty backup codes for now
        twoFactorEnabled: false,
        loginAttempts: 0,
        updatedAt: new Date()
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log(`   ID: ${adminUser.id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.name}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   Created: ${adminUser.createdAt}`);

    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('1. Change the default password immediately after first login');
    console.log('2. Enable two-factor authentication for better security');
    console.log('3. Consider using a more secure email address');
    console.log('4. Keep these credentials secure and don\'t share them');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    
    if (error.code === 'P2002') {
      console.log('💡 A user with this email already exists. Please use a different email or check existing users.');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addAdminUser(); 
