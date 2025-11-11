#!/usr/bin/env node
/**
 * Script to add Voice Control permissions to existing role permissions
 * Run this after updating the RolePermissions model
 */

require('dotenv').config();
const mongoose = require('mongoose');
const RolePermissions = require('./models/RolePermissions');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/autovolt';

// Voice Control default permissions by role
const voiceControlDefaults = {
  'super-admin': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: true,
    canQueryAnalytics: true,
    canAccessAllDevices: true,
    restrictToAssignedDevices: false
  },
  'dean': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: true,
    canQueryAnalytics: true,
    canAccessAllDevices: true,
    restrictToAssignedDevices: false
  },
  'admin': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: true,
    canQueryAnalytics: true,
    canAccessAllDevices: true,
    restrictToAssignedDevices: false
  },
  'faculty': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: true,
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  },
  'teacher': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: true,
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  },
  'security': {
    enabled: true,
    canControlDevices: true,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: false,
    canAccessAllDevices: true,
    restrictToAssignedDevices: false
  },
  'student': {
    enabled: false,
    canControlDevices: false,
    canViewDeviceStatus: true,
    canCreateSchedules: false,
    canQueryAnalytics: false,
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  },
  'guest': {
    enabled: false,
    canControlDevices: false,
    canViewDeviceStatus: false,
    canCreateSchedules: false,
    canQueryAnalytics: false,
    canAccessAllDevices: false,
    restrictToAssignedDevices: true
  }
};

async function updateVoiceControlPermissions() {
  try {
    console.log('🔌 Connecting to MongoDB:', MONGODB_URI);
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all role permissions
    const allRolePermissions = await RolePermissions.find({});
    console.log(`📋 Found ${allRolePermissions.length} role permission documents\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const rolePermission of allRolePermissions) {
      const role = rolePermission.role;
      const defaults = voiceControlDefaults[role];

      if (!defaults) {
        console.log(`⚠️  Skipping role: ${role} (no defaults defined)`);
        skippedCount++;
        continue;
      }

      // Check if voiceControl already exists
      if (rolePermission.voiceControl && rolePermission.voiceControl.enabled !== undefined) {
        console.log(`ℹ️  Role ${role} already has voice control permissions - updating...`);
      } else {
        console.log(`➕ Adding voice control permissions to role: ${role}`);
      }

      // Update voice control permissions
      rolePermission.voiceControl = defaults;
      await rolePermission.save();

      console.log(`✅ Updated ${role}:`, {
        enabled: defaults.enabled,
        canControlDevices: defaults.canControlDevices,
        canViewDeviceStatus: defaults.canViewDeviceStatus,
        canCreateSchedules: defaults.canCreateSchedules,
        canQueryAnalytics: defaults.canQueryAnalytics,
        canAccessAllDevices: defaults.canAccessAllDevices,
        restrictToAssignedDevices: defaults.restrictToAssignedDevices
      });
      console.log('');

      updatedCount++;
    }

    console.log('\n📊 Summary:');
    console.log(`   Total processed: ${allRolePermissions.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log('\n✅ Voice control permissions update complete!');

  } catch (error) {
    console.error('❌ Error updating voice control permissions:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the update
console.log('🚀 Starting Voice Control Permissions Update...\n');
updateVoiceControlPermissions();
