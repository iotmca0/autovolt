const User = require('../models/User');
const { logger } = require('../middleware/logger');
const ActivityLog = require('../models/ActivityLog');

// Helper to sanitize user objects for client
const toClientUser = (user) => ({
  id: user._id,
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLevel: user.roleLevel,
  department: user.department,
  employeeId: user.employeeId,
  designation: user.designation,
  accessLevel: user.accessLevel,
  assignedDevices: user.assignedDevices || [],
  assignedRooms: user.assignedRooms || [],
  isActive: user.isActive,
  isApproved: user.isApproved,
  permissions: user.permissions,
  lastLogin: user.lastLogin,
  registrationDate: user.registrationDate,
  isOnline: user.isOnline,
  lastSeen: user.lastSeen
});

// Get all users with role-based filtering
const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
    const search = (req.query.search || '').toString().trim();
    const role = req.query.role;
    const department = req.query.department;
    const status = req.query.status;

    let filter = {};

    // Apply role-based filtering
    if (req.user.role === 'super-admin') {
      // Super admin can see all users (no filter)
      // No additional filter needed
    } else if (req.user.role === 'admin') {
      // Admin can see all except super-admin
      filter.role = { $ne: 'super-admin' };
    } else if (req.user.role === 'faculty') {
      // Faculty can see teachers and students in their department
      filter.$or = [
        { role: { $in: ['teacher', 'student'] }, department: req.user.department },
        { _id: req.user._id } // Can see themselves
      ];
    } else if (req.user.role === 'teacher') {
      // Teachers can see students in their assigned rooms/classes
      filter.$or = [
        { role: 'student', assignedRooms: { $in: req.user.assignedRooms || [] } },
        { _id: req.user._id } // Can see themselves
      ];
    }

    // Apply search filter
    if (search) {
      filter.$or = filter.$or || [];
      filter.$or.push(
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      );
    }

    // Apply additional filters
    if (role && role !== 'all') {
      filter.role = role;
    }
    if (department && department !== 'all') {
      filter.department = department;
    }
    if (status && status !== 'all') {
      if (status === 'active') filter.isActive = true;
      else if (status === 'inactive') filter.isActive = false;
      else if (status === 'pending') filter.isApproved = false;
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      data: users.map(toClientUser),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};

// Get single user
const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password -resetPasswordToken -resetPasswordExpire');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if user can view this profile
    if (!canViewUser(req.user, user)) {
      return res.status(403).json({ message: 'Not authorized to view this user' });
    }

    res.json(toClientUser(user));
  } catch (error) {
    logger.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};

// Create new user
const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      department,
      employeeId,
      phone,
      designation,
      assignedRooms
    } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // Check if user can create users of this role
    if (!canCreateUser(req.user, role)) {
      return res.status(403).json({ message: 'Not authorized to create users with this role' });
    }

    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Check employeeId uniqueness if provided
    if (employeeId) {
      const existingEmployee = await User.findOne({ employeeId: employeeId.trim() });
      if (existingEmployee) {
        return res.status(400).json({ message: 'Employee ID already exists' });
      }
    }

    // Generate temporary password if not provided
    const tempPassword = password || generateTempPassword();

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password: tempPassword,
      role: role || 'student',
      department,
      employeeId: employeeId?.trim(),
      phone,
      designation,
      assignedRooms: assignedRooms || [],
      isActive: req.user.permissions.canManageUsers, // Auto-activate if creator has permission
      isApproved: req.user.roleLevel >= 8 // Auto-approve for admin+ level creators
    });

    // Log activity
    await ActivityLog.create({
      action: 'user_created',
      triggeredBy: 'user',
      userId: req.user._id,
      userName: req.user.name,
      classroom: 'system',
      location: 'user_management',
      details: `Created user ${user.name} (${user.email}) with role ${user.role}`
    });

    const response = { user: toClientUser(user) };
    if (!password) {
      response.tempPassword = tempPassword;
    }

    res.status(201).json(response);
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    console.log('[DEBUG] updateUser request:', {
      params: req.params,
      body: req.body,
      user: req.user
    });
    const allowedFields = [
      'name', 'email', 'role', 'department', 'employeeId',
      'phone', 'designation', 'assignedRooms', 'assignedDevices', 'isActive'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    // Check permissions
    if (!canUpdateUser(req.user, req.params.id, updateData)) {
      return res.status(403).json({ message: 'Not authorized to update this user' });
    }

    // Validate email uniqueness
    if (updateData.email) {
      const existing = await User.findOne({
        email: updateData.email.toLowerCase().trim(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Validate employeeId uniqueness
    if (updateData.employeeId) {
      const existing = await User.findOne({
        employeeId: updateData.employeeId.trim(),
        _id: { $ne: req.params.id }
      });
      if (existing) {
        return res.status(400).json({ message: 'Employee ID already in use' });
      }
    }


    // Get the user before updating to compare old vs new values
    const oldUser = await User.findById(req.params.id);
    if (!oldUser) return res.status(404).json({ message: 'User not found' });

    // If role is being changed, recalculate permissions
    let user;
    if (updateData.role && updateData.role !== oldUser.role) {
      // Update the user first
      user = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).select('-password -resetPasswordToken -resetPasswordExpire');
      if (!user) return res.status(404).json({ message: 'User not found' });
      // Recalculate permissions based on new role
      const rolePermissions = require('../models/User');
      user.role = updateData.role;
      // This will trigger the pre-save hook to update permissions
      await user.save();
    } else {
      user = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true }
      ).select('-password -resetPasswordToken -resetPasswordExpire');
      if (!user) return res.status(404).json({ message: 'User not found' });
    }

    // Emit real-time notification to the updated user if they're online
    if (req.app.get('io')) {
      const io = req.app.get('io');
      console.log(`[REAL-TIME] Emitting user update events for user ${user._id}`);

      // Notify the specific user about their profile update
      console.log(`[REAL-TIME] Emitting to room: user_${user._id}`);
      io.to(`user_${user._id}`).emit('user_profile_updated', {
        type: 'profile_updated',
        userId: user._id,
        updatedBy: req.user._id,
        updatedByName: req.user.name,
        changes: Object.keys(updateData),
        timestamp: new Date(),
        message: 'Your profile has been updated by an administrator'
      });

      // If role was changed, also emit a role change event
      if (updateData.role && updateData.role !== oldUser.role) {
        console.log(`[REAL-TIME] Role changed from ${oldUser.role} to ${updateData.role}, emitting role change event`);
        io.to(`user_${user._id}`).emit('user_role_changed', {
          type: 'role_changed',
          userId: user._id,
          oldRole: oldUser.role,
          newRole: updateData.role,
          updatedBy: req.user._id,
          updatedByName: req.user.name,
          timestamp: new Date(),
          message: `Your role has been changed from ${oldUser.role} to ${updateData.role}`
        });
      }

      // Notify all admins about the user update (except the one making the change)
      const adminRoles = ['super-admin', 'admin', 'dean'];
      const admins = await User.find({
        role: { $in: adminRoles },
        isActive: true,
        isApproved: true,
        _id: { $ne: req.user._id } // Exclude the admin making the change
      }).select('_id name email');

      console.log(`[REAL-TIME] Notifying ${admins.length} admins about user update`);
      admins.forEach(admin => {
        io.to(`user_${admin._id}`).emit('user_updated', {
          type: 'user_updated',
          updatedUserId: user._id,
          updatedUserName: user.name,
          updatedUserRole: user.role,
          updatedBy: req.user._id,
          updatedByName: req.user.name,
          changes: Object.keys(updateData),
          timestamp: new Date()
        });
      });
    } else {
      console.log('[REAL-TIME] Socket.IO not available, skipping real-time notifications');
    }

    // Note: ActivityLog is for device activities, not user management
    // User updates don't need to be logged as device activities

    res.json(toClientUser(user));
  } catch (error) {
  logger.error('Error updating user:', error);
  console.error('[DEBUG] updateUser error:', error);
  res.status(500).json({ message: 'Error updating user', error: error?.message, stack: error?.stack });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    if (!canDeleteUser(req.user, req.params.id)) {
      return res.status(403).json({ message: 'Not authorized to delete this user' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Clean up related data before deleting user
    try {
      // Delete user's created content
      const Notice = require('../models/Notice');
      await Notice.deleteMany({ createdBy: req.params.id });
      logger.info(`Deleted notices created by user ${user.email}`);
    } catch (err) {
      logger.warn('Error deleting user notices:', err);
    }

    try {
      // Delete user's tickets
      const Ticket = require('../models/Ticket');
      await Ticket.deleteMany({ userId: req.params.id });
      logger.info(`Deleted tickets for user ${user.email}`);
    } catch (err) {
      logger.warn('Error deleting user tickets:', err);
    }

    try {
      // Delete user's activity logs
      await ActivityLog.deleteMany({ userId: req.params.id });
      logger.info(`Deleted activity logs for user ${user.email}`);
    } catch (err) {
      logger.warn('Error deleting user activity logs:', err);
    }

    try {
      // Remove user from device assignments
      const Device = require('../models/Device');
      await Device.updateMany(
        { userId: req.params.id },
        { $unset: { userId: "" } }
      );
      logger.info(`Removed user from device assignments`);
    } catch (err) {
      logger.warn('Error updating device assignments:', err);
    }

    // Now delete the user
    await User.findByIdAndDelete(req.params.id);

    // Log activity
    try {
      await ActivityLog.create({
        action: 'user_deleted',
        triggeredBy: 'user',
        userId: req.user._id,
        userName: req.user.name,
        classroom: 'system',
        location: 'user_management',
        details: `Deleted user ${user.name} (${user.email})`
      });
    } catch (err) {
      logger.warn('Error logging user deletion:', err);
    }

    // Emit real-time notification to admins about user deletion
    if (req.app.get('io')) {
      const io = req.app.get('io');
      const adminRoles = ['super-admin', 'admin', 'dean'];
      const admins = await User.find({
        role: { $in: adminRoles },
        isActive: true,
        isApproved: true,
        _id: { $ne: req.user._id }
      }).select('_id');

      admins.forEach(admin => {
        io.to(`user_${admin._id}`).emit('user_deleted', {
          type: 'user_deleted',
          deletedUserId: req.params.id,
          deletedUserName: user.name,
          deletedUserEmail: user.email,
          deletedBy: req.user._id,
          deletedByName: req.user.name,
          timestamp: new Date()
        });
      });
    }

    res.json({ 
      success: true,
      message: 'User deleted successfully',
      details: {
        userName: user.name,
        userEmail: user.email
      }
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    console.error('[DEBUG] Delete user error:', error);
    res.status(500).json({ 
      message: 'Error deleting user',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Toggle user status
const toggleUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive boolean required' });
    }

    if (req.user._id.toString() === req.params.id && !isActive) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    if (!canToggleUserStatus(req.user, req.params.id)) {
      return res.status(403).json({ message: 'Not authorized to change user status' });
    }

    const update = isActive ? { isActive, isApproved: true } : { isActive };
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('-password -resetPasswordToken -resetPasswordExpire');

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Send notification to the user about status change
    try {
      const Notification = require('../models/Notification');

      if (isActive) {
        // User was approved/activated
        await Notification.createAccountApprovalNotification({
          recipient: user._id,
          approvedBy: req.user.name,
          userRole: user.role,
          department: user.department
        });
      } else {
        // User was deactivated (this would be rejection)
        await Notification.createAccountRejectionNotification({
          recipient: user._id,
          rejectedBy: req.user.name,
          rejectionReason: 'Account deactivated by administrator',
          userRole: user.role,
          department: user.department
        });
      }

      // Emit real-time notification
      if (req.app.get('io')) {
        req.app.get('io').to(user._id.toString()).emit('notification', {
          type: isActive ? 'account_approved' : 'account_rejected',
          message: isActive
            ? `Your account has been approved by ${req.user.name}`
            : `Your account has been deactivated by ${req.user.name}`
        });
      }
    } catch (notificationError) {
      console.error('Error sending user status notification:', notificationError);
      // Don't fail the request if notification fails
    }

    res.json(toClientUser(user));
  } catch (error) {
    logger.error('Error updating user status:', error);
    res.status(500).json({ message: 'Error updating user status' });
  }
};

// Helper functions for permission checking
function canViewUser(viewer, targetUser) {
  const viewerLevel = viewer.roleLevel || 3;
  const targetLevel = targetUser.roleLevel || 3;

  // Super admin can view all
  if (viewer.role === 'super-admin') return true;

  // Users can view themselves
  if (viewer._id.toString() === targetUser._id.toString()) return true;

  // Higher level users can view lower level users
  if (viewerLevel > targetLevel) return true;

  // Faculty can view teachers and students in their department
  if (viewer.role === 'faculty' && ['teacher', 'student'].includes(targetUser.role)) {
    return viewer.department === targetUser.department;
  }

  // Teachers can view students in their assigned rooms
  if (viewer.role === 'teacher' && targetUser.role === 'student') {
    return targetUser.assignedRooms?.some(room => viewer.assignedRooms?.includes(room));
  }

  return false;
}

function canCreateUser(creator, targetRole) {
  const roleHierarchy = {
    'super-admin': ['dean', 'admin', 'faculty', 'teacher', 'student', 'security', 'guest'],
    'dean': ['admin', 'faculty', 'teacher', 'student', 'security', 'guest'],
    'admin': ['faculty', 'teacher', 'student', 'security', 'guest'],
    'faculty': ['teacher', 'student'],
    'teacher': ['student'],
    'security': [],
    'student': [],
    'guest': []
  };

  return roleHierarchy[creator.role]?.includes(targetRole) || false;
}

function canUpdateUser(updater, targetId, updateData) {
  // Users can update themselves (limited fields)
  if (updater._id.toString() === targetId) {
    const allowedSelfFields = ['name', 'phone', 'designation'];
    const requestedFields = Object.keys(updateData);
    return requestedFields.every(field => allowedSelfFields.includes(field));
  }

  // Allow higher roleLevel to update lower roleLevel users
  // (Assumes you have access to the target user's roleLevel)
  // For this function, fetch the target user's roleLevel if needed
  // Here, we assume updateData.role is not always present, so we can't check it directly
  // Instead, allow admin to update any user except super-admin
  if (updater.role === 'super-admin') return true;
  if (updater.role === 'admin') return true;
  if (updater.role === 'faculty' && updateData.role && ['teacher', 'student'].includes(updateData.role)) return true;
  if (updater.role === 'teacher' && updateData.role && updateData.role === 'student') return true;
  return false;
}

function canDeleteUser(deleter, targetId) {
  if (deleter._id.toString() === targetId) return false;

  const roleHierarchy = {
    'super-admin': true,
    'admin': true,
    'faculty': ['student'].includes(targetId), // Would need to check target role
    'teacher': false
  };

  return roleHierarchy[deleter.role] || false;
}

function canToggleUserStatus(toggler, targetId) {
  if (toggler._id.toString() === targetId) return false;

  const rolePermissions = {
    'super-admin': true,
    'dean': true,
    'admin': true,
    'faculty': false,
    'teacher': false
  };

  return rolePermissions[toggler.role] || false;
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
}

// Bulk activate users
const bulkActivateUsers = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    // Check permissions for each user
    for (const userId of userIds) {
      if (!canToggleUserStatus(req.user, userId)) {
        return res.status(403).json({ message: `Insufficient permissions to activate user ${userId}` });
      }
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { isActive: true, isApproved: true, lastModifiedBy: req.user._id, lastModifiedAt: new Date() }
    );

    // Send notifications to activated users
    try {
      const Notification = require('../models/Notification');
      const activatedUsers = await User.find({ _id: { $in: userIds } });

      for (const user of activatedUsers) {
        await Notification.createAccountApprovalNotification({
          recipient: user._id,
          approvedBy: req.user.name,
          userRole: user.role,
          department: user.department
        });

        // Emit real-time notification
        if (req.app.get('io')) {
          req.app.get('io').to(user._id.toString()).emit('notification', {
            type: 'account_approved',
            message: `Your account has been approved by ${req.user.name}`
          });
        }
      }
    } catch (notificationError) {
      console.error('Error sending bulk activation notifications:', notificationError);
      // Don't fail the request if notifications fail
    }

    logger.info(`Bulk activated ${result.modifiedCount} users by ${req.user.email}`);

    res.json({
      success: true,
      message: `Successfully activated ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Bulk activate users error:', error);
    res.status(500).json({ message: 'Error activating users' });
  }
};

// Bulk deactivate users
const bulkDeactivateUsers = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    // Check permissions for each user
    for (const userId of userIds) {
      if (!canToggleUserStatus(req.user, userId)) {
        return res.status(403).json({ message: `Insufficient permissions to deactivate user ${userId}` });
      }
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { isActive: false, lastModifiedBy: req.user._id, lastModifiedAt: new Date() }
    );

    logger.info(`Bulk deactivated ${result.modifiedCount} users by ${req.user.email}`);

    res.json({
      success: true,
      message: `Successfully deactivated ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Bulk deactivate users error:', error);
    res.status(500).json({ message: 'Error deactivating users' });
  }
};

// Bulk delete users
const bulkDeleteUsers = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    // Check permissions for each user
    for (const userId of userIds) {
      if (!canDeleteUser(req.user, userId)) {
        return res.status(403).json({ message: `Insufficient permissions to delete user ${userId}` });
      }
    }

    const result = await User.deleteMany({ _id: { $in: userIds } });

    logger.info(`Bulk deleted ${result.deletedCount} users by ${req.user.email}`);

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} users`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Bulk delete users error:', error);
    res.status(500).json({ message: 'Error deleting users' });
  }
};

// Bulk assign role to users
const bulkAssignRole = async (req, res) => {
  try {
    const { userIds, role } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    // Validate role
    const validRoles = ['super-admin', 'admin', 'principal', 'dean', 'hod', 'faculty', 'teacher', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role specified' });
    }

    // Check if assigner can assign this role
    const roleHierarchy = {
      'super-admin': ['super-admin', 'admin', 'principal', 'dean', 'hod', 'faculty', 'teacher', 'student'],
      'admin': ['admin', 'principal', 'dean', 'hod', 'faculty', 'teacher', 'student'],
      'principal': ['dean', 'hod', 'faculty', 'teacher', 'student'],
      'dean': ['hod', 'faculty', 'teacher', 'student'],
      'hod': ['faculty', 'teacher', 'student']
    };

    if (!roleHierarchy[req.user.role] || !roleHierarchy[req.user.role].includes(role)) {
      return res.status(403).json({ message: 'Insufficient permissions to assign this role' });
    }

    // Check permissions for each user
    for (const userId of userIds) {
      if (!canUpdateUser(req.user, userId)) {
        return res.status(403).json({ message: `Insufficient permissions to update user ${userId}` });
      }
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { role: role, lastModifiedBy: req.user._id, lastModifiedAt: new Date() }
    );

    logger.info(`Bulk assigned role ${role} to ${result.modifiedCount} users by ${req.user.email}`);

    res.json({
      success: true,
      message: `Successfully assigned role ${role} to ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    logger.error('Bulk assign role error:', error);
    res.status(500).json({ message: 'Error assigning role to users' });
  }
};

module.exports = {
  getAllUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  bulkActivateUsers,
  bulkDeactivateUsers,
  bulkDeleteUsers,
  bulkAssignRole
};