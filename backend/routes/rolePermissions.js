const express = require('express');
const router = express.Router();
const RolePermissions = require('../models/RolePermissions');
const { auth, authorize } = require('../middleware/auth');
const { logger } = require('../middleware/logger');
const User = require('../models/User');

// All role permissions routes require authentication
router.use(auth);

// Helper function to sanitize role permissions for client
const toClientRolePermissions = (rp) => ({
  id: rp._id,
  role: rp.role,
  userManagement: rp.userManagement,
  deviceManagement: rp.deviceManagement,
  classroomManagement: rp.classroomManagement,
  scheduleManagement: rp.scheduleManagement,
  activityManagement: rp.activityManagement,
  securityManagement: rp.securityManagement,
  ticketManagement: rp.ticketManagement,
  systemManagement: rp.systemManagement,
  extensionManagement: rp.extensionManagement,
  voiceControl: rp.voiceControl,
  calendarIntegration: rp.calendarIntegration,
  esp32Management: rp.esp32Management,
  bulkOperations: rp.bulkOperations,
  departmentRestrictions: rp.departmentRestrictions,
  timeRestrictions: rp.timeRestrictions,
  notifications: rp.notifications,
  apiAccess: rp.apiAccess,
  audit: rp.audit,
  metadata: rp.metadata,
  createdAt: rp.createdAt,
  updatedAt: rp.updatedAt
});

// GET /api/role-permissions/:role - Get permissions for a specific role (users can access their own)
router.get('/:role', async (req, res) => {
  try {
    const { role } = req.params;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Users can only access their own role permissions or admins can access any
    if (req.user.role !== role && !['admin', 'super-admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'User role ' + req.user.role + ' is not authorized to access this resource'
      });
    }

    const rolePermissions = await RolePermissions.findOne({
      role,
      'metadata.isActive': true
    });

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    logger.info(`[ROLE_PERMISSIONS] Retrieved permissions for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name
    });

    res.json({
      success: true,
      data: toClientRolePermissions(rolePermissions)
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error fetching permissions for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role permissions',
      error: error.message
    });
  }
});

// All other routes require admin authorization
router.use(authorize('admin', 'super-admin'));

// GET /api/role-permissions - Get all role permissions
router.get('/', async (req, res) => {
  try {
    const rolePermissions = await RolePermissions.find({ 'metadata.isActive': true })
      .sort({ role: 1 });

    logger.info(`[ROLE_PERMISSIONS] Retrieved ${rolePermissions.length} role permissions`, {
      userId: req.user.id,
      userName: req.user.name
    });

    res.json({
      success: true,
      data: rolePermissions.map(toClientRolePermissions)
    });
  } catch (error) {
    logger.error('[ROLE_PERMISSIONS] Error fetching role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching role permissions',
      error: error.message
    });
  }
});

// POST /api/role-permissions - Create new role permissions
router.post('/', async (req, res) => {
  try {
    const { role, ...permissionsData } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Check if role permissions already exist
    const existing = await RolePermissions.findOne({ role });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Role permissions already exist for role: ${role}`
      });
    }

    // Create new role permissions with default values
    const rolePermissions = new RolePermissions({
      role,
      ...permissionsData,
      metadata: {
        ...permissionsData.metadata,
        createdBy: req.user.id,
        lastModifiedBy: req.user.id
      }
    });

    await rolePermissions.save();

    logger.info(`[ROLE_PERMISSIONS] Created permissions for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name,
      rolePermissionsId: rolePermissions._id
    });

    res.status(201).json({
      success: true,
      data: toClientRolePermissions(rolePermissions),
      message: `Role permissions created for ${role}`
    });
  } catch (error) {
    logger.error('[ROLE_PERMISSIONS] Error creating role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating role permissions',
      error: error.message
    });
  }
});

// PUT /api/role-permissions/:role - Update permissions for a specific role
router.put('/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const updates = req.body;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Remove role from updates if present (shouldn't be updated)
    delete updates.role;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    const rolePermissions = await RolePermissions.findOneAndUpdate(
      { role, 'metadata.isActive': true },
      {
        ...updates,
        'metadata.lastModifiedBy': req.user.id
      },
      { new: true, runValidators: true }
    );

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    logger.info(`[ROLE_PERMISSIONS] Updated permissions for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name,
      rolePermissionsId: rolePermissions._id,
      changes: Object.keys(updates)
    });

    // Notify all users with this role about permission changes
    try {
      const io = req.app.get('io');
      if (io) {
        // Find all users with this role
        const affectedUsers = await User.find({ role, isActive: true }).select('_id name');
        
        // Emit event to each user's room
        affectedUsers.forEach(user => {
          const userRoom = `user_${user._id}`;
          io.to(userRoom).emit('role_permissions_updated', {
            role,
            message: `Your ${role} permissions have been updated. Please refresh to see changes.`,
            updatedBy: req.user.name,
            timestamp: new Date(),
            changedPermissions: Object.keys(updates)
          });
        });

        logger.info(`[ROLE_PERMISSIONS] Notified ${affectedUsers.length} users about permission changes for role: ${role}`);
      }
    } catch (notifyError) {
      logger.error('[ROLE_PERMISSIONS] Failed to notify users about permission changes:', notifyError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      data: toClientRolePermissions(rolePermissions),
      message: `Role permissions updated for ${role}`
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error updating permissions for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error updating role permissions',
      error: error.message
    });
  }
});

// PATCH /api/role-permissions/:role - Partially update permissions for a specific role
router.patch('/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const updates = req.body;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Remove protected fields
    delete updates.role;
    delete updates._id;
    delete updates.createdAt;
    delete updates.updatedAt;

    const rolePermissions = await RolePermissions.findOneAndUpdate(
      { role, 'metadata.isActive': true },
      {
        ...updates,
        'metadata.lastModifiedBy': req.user.id
      },
      { new: true, runValidators: true }
    );

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    logger.info(`[ROLE_PERMISSIONS] Partially updated permissions for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name,
      rolePermissionsId: rolePermissions._id,
      changes: Object.keys(updates)
    });

    // Notify all users with this role about permission changes
    try {
      const io = req.app.get('io');
      if (io) {
        // Find all users with this role
        const affectedUsers = await User.find({ role, isActive: true }).select('_id name');
        
        // Emit event to each user's room
        affectedUsers.forEach(user => {
          const userRoom = `user_${user._id}`;
          io.to(userRoom).emit('role_permissions_updated', {
            role,
            message: `Your ${role} permissions have been updated. Please refresh to see changes.`,
            updatedBy: req.user.name,
            timestamp: new Date(),
            changedPermissions: Object.keys(updates)
          });
        });

        logger.info(`[ROLE_PERMISSIONS] Notified ${affectedUsers.length} users about permission changes for role: ${role}`);
      }
    } catch (notifyError) {
      logger.error('[ROLE_PERMISSIONS] Failed to notify users about permission changes:', notifyError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      data: toClientRolePermissions(rolePermissions),
      message: `Role permissions updated for ${role}`
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error partially updating permissions for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error updating role permissions',
      error: error.message
    });
  }
});

// DELETE /api/role-permissions/:role - Soft delete permissions for a specific role
router.delete('/:role', async (req, res) => {
  try {
    const { role } = req.params;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Prevent deletion of admin and super-admin role permissions
    if (['admin', 'super-admin'].includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin or super-admin role permissions'
      });
    }

    const rolePermissions = await RolePermissions.findOneAndUpdate(
      { role, 'metadata.isActive': true },
      {
        'metadata.isActive': false,
        'metadata.lastModifiedBy': req.user.id
      },
      { new: true }
    );

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    logger.info(`[ROLE_PERMISSIONS] Soft deleted permissions for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name,
      rolePermissionsId: rolePermissions._id
    });

    res.json({
      success: true,
      message: `Role permissions deactivated for ${role}`
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error deleting permissions for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error deleting role permissions',
      error: error.message
    });
  }
});

// POST /api/role-permissions/:role/reset - Reset permissions to defaults for a specific role
router.post('/:role/reset', async (req, res) => {
  try {
    const { role } = req.params;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    const rolePermissions = await RolePermissions.findOne({ role, 'metadata.isActive': true });

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    // Reset to default permissions
    rolePermissions.setDefaultPermissionsForRole();
    rolePermissions.metadata.lastModifiedBy = req.user.id;
    await rolePermissions.save();

    logger.info(`[ROLE_PERMISSIONS] Reset permissions to defaults for role: ${role}`, {
      userId: req.user.id,
      userName: req.user.name,
      rolePermissionsId: rolePermissions._id
    });

    res.json({
      success: true,
      data: toClientRolePermissions(rolePermissions),
      message: `Role permissions reset to defaults for ${role}`
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error resetting permissions for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error resetting role permissions',
      error: error.message
    });
  }
});

// POST /api/role-permissions/initialize - Initialize default permissions for all roles
router.post('/initialize', auth, authorize('admin', 'super-admin'), async (req, res) => {
  try {
    // Clear all existing role permissions first
    await RolePermissions.deleteMany({});
    console.log('Cleared all existing role permissions');

    const roles = ['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'];
    const created = [];
    const updated = [];

    // Use default admin user ID if req.user is not available
    const userId = req.user ? req.user.id : null;
    const userName = req.user ? req.user.name : 'System';

    for (const role of roles) {
      let rolePermissions = await RolePermissions.findOne({ role });

      if (!rolePermissions) {
        // Create new role permissions
        rolePermissions = new RolePermissions({
          role,
          metadata: {
            createdBy: userId,
            lastModifiedBy: userId,
            isSystemRole: ['super-admin', 'admin'].includes(role)
          }
        });
        // Set default permissions for the new role
        rolePermissions.setDefaultPermissionsForRole();

        // Also manually set some key permissions to ensure they work
        if (role === 'super-admin') {
          rolePermissions.userManagement.canViewUsers = true;
          rolePermissions.deviceManagement.canViewDevices = true;
        }

        await rolePermissions.save();
        created.push(role);
      } else if (!rolePermissions.metadata.isActive) {
        // Reactivate existing permissions and reset to defaults
        rolePermissions.metadata.isActive = true;
        rolePermissions.metadata.lastModifiedBy = userId;
        // Reset to default permissions
        rolePermissions.setDefaultPermissionsForRole();
        await rolePermissions.save();
        updated.push(role);
      }
    }

    logger.info(`[ROLE_PERMISSIONS] Initialized permissions - Created: ${created.join(', ')}, Updated: ${updated.join(', ')}`, {
      userId: userId,
      userName: userName
    });

    res.json({
      success: true,
      message: 'Role permissions initialized successfully',
      data: {
        created,
        updated,
        totalRoles: roles.length
      }
    });
  } catch (error) {
    logger.error('[ROLE_PERMISSIONS] Error initializing role permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error initializing role permissions',
      error: error.message
    });
  }
});

// GET /api/role-permissions/check/:role/:category/:permission - Check if a role has a specific permission
router.get('/check/:role/:category/:permission', async (req, res) => {
  try {
    const { role, category, permission } = req.params;

    if (!['super-admin', 'dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    const rolePermissions = await RolePermissions.findOne({
      role,
      'metadata.isActive': true
    });

    if (!rolePermissions) {
      return res.status(404).json({
        success: false,
        message: `Role permissions not found for role: ${role}`
      });
    }

    const hasPermission = rolePermissions.hasPermission(category, permission);

    res.json({
      success: true,
      data: {
        role,
        category,
        permission,
        hasPermission
      }
    });
  } catch (error) {
    logger.error(`[ROLE_PERMISSIONS] Error checking permission for role ${req.params.role}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error checking permission',
      error: error.message
    });
  }
});

module.exports = router;
