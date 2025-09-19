#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Check if .env file exists
const envPath = join(__dirname, '../.env');
if (!existsSync(envPath)) {
  console.error('❌ .env file not found!');
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
    // Check if admin user already exists
    const existingAdmin = await prisma.users.findFirst({
      where: {
        role: 'ADMIN'
      }
    });

    if (existingAdmin) {
      return;
    }

    // Default admin credentials
    const adminEmail = 'admin@flow.com';
    const adminPassword = 'admin123!';
    const adminName = 'System Administrator';

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

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    
    if (error.code === 'P2002') {
      // A user with this email already exists
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addAdminUser(); 
