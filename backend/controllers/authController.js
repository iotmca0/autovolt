
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const PermissionRequest = require('../models/PermissionRequest');
const ClassExtensionRequest = require('../models/ClassExtensionRequest');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { sendPasswordResetEmail } = require('../services/emailService');
const { logger } = require('../middleware/logger');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const register = async (req, res) => {
  try {
    logger.info('Registration request received');
    logger.debug('Request body keys:', Object.keys(req.body || {}));
    logger.debug('Full request body:', JSON.stringify(req.body, null, 2));

    const {
      name,
      email,
      password,
      role,
      department,
      class: userClass,
      employeeId,
      phone,
      designation,
      reason
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if employeeId is already taken (if provided)
    if (employeeId) {
      const existingEmployee = await User.findOne({ employeeId: employeeId.trim() });
      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID is already taken'
        });
      }
    }

    // Set default permissions based on role (now handled by User model pre-save hook)
    // The User model will automatically assign permissions based on role
    const rolePermissions = {
      'super-admin': {
        canManageUsers: true,
        canApproveUsers: true,
        canManageDevices: true,
        canViewReports: true,
        canManageSchedule: true,
        canRequestExtensions: true,
        canApproveExtensions: true,
        canViewSecurityAlerts: true,
        canAccessAllClassrooms: true,
        canBypassTimeRestrictions: true,
        hasEmergencyAccess: true,
        hasDepartmentOverride: true,
        canAccessSecurityDevices: true,
        canAccessStudentDevices: true,
        canAccessGuestDevices: true,
        canDeleteUsers: true,
        canResetPasswords: true,
        canManageRoles: true,
        canViewAuditLogs: true,
        canManageSettings: true,
        canCreateSchedules: true,
        canModifySchedules: true,
        canOverrideSchedules: true,
        canViewAllSchedules: true,
        canSendNotifications: true,
        canReceiveAlerts: true,
        canManageAnnouncements: true
      },
      'dean': {
        canManageUsers: true,
        canApproveUsers: true,
        canManageDevices: true,
        canViewReports: true,
        canManageSchedule: true,
        canRequestExtensions: true,
        canApproveExtensions: true,
        canViewSecurityAlerts: true,
        canAccessAllClassrooms: true,
        canBypassTimeRestrictions: true,
        hasEmergencyAccess: true,
        hasDepartmentOverride: true,
        canAccessSecurityDevices: false,
        canAccessStudentDevices: true,
        canAccessGuestDevices: true,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: true,
        canManageSettings: false,
        canCreateSchedules: true,
        canModifySchedules: true,
        canOverrideSchedules: true,
        canViewAllSchedules: true,
        canSendNotifications: true,
        canReceiveAlerts: true,
        canManageAnnouncements: true
      },
      'admin': {
        canManageUsers: true,
        canApproveUsers: true,
        canManageDevices: true,
        canViewReports: true,
        canManageSchedule: true,
        canRequestExtensions: true,
        canApproveExtensions: true,
        canViewSecurityAlerts: true,
        canAccessAllClassrooms: true,
        canBypassTimeRestrictions: true,
        hasEmergencyAccess: true,
        hasDepartmentOverride: false,
        canAccessSecurityDevices: true,
        canAccessStudentDevices: true,
        canAccessGuestDevices: true,
        canDeleteUsers: true,
        canResetPasswords: true,
        canManageRoles: false,
        canViewAuditLogs: true,
        canManageSettings: true,
        canCreateSchedules: true,
        canModifySchedules: true,
        canOverrideSchedules: true,
        canViewAllSchedules: true,
        canSendNotifications: true,
        canReceiveAlerts: true,
        canManageAnnouncements: true
      },
      'faculty': {
        canManageUsers: false,
        canApproveUsers: false,
        canManageDevices: true,
        canViewReports: true,
        canManageSchedule: true,
        canRequestExtensions: true,
        canApproveExtensions: true,
        canViewSecurityAlerts: false,
        canAccessAllClassrooms: false,
        canBypassTimeRestrictions: false,
        hasEmergencyAccess: false,
        hasDepartmentOverride: true,
        canAccessSecurityDevices: false,
        canAccessStudentDevices: true,
        canAccessGuestDevices: true,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: false,
        canManageSettings: false,
        canCreateSchedules: true,
        canModifySchedules: true,
        canOverrideSchedules: false,
        canViewAllSchedules: false,
        canSendNotifications: true,
        canReceiveAlerts: true,
        canManageAnnouncements: false
      },
      'teacher': {
        canManageUsers: false,
        canApproveUsers: false,
        canManageDevices: true,
        canViewReports: false,
        canManageSchedule: true,
        canRequestExtensions: true,
        canApproveExtensions: false,
        canViewSecurityAlerts: false,
        canAccessAllClassrooms: false,
        canBypassTimeRestrictions: false,
        hasEmergencyAccess: false,
        hasDepartmentOverride: false,
        canAccessSecurityDevices: false,
        canAccessStudentDevices: true,
        canAccessGuestDevices: true,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: false,
        canManageSettings: false,
        canCreateSchedules: true,
        canModifySchedules: true,
        canOverrideSchedules: false,
        canViewAllSchedules: false,
        canSendNotifications: false,
        canReceiveAlerts: true,
        canManageAnnouncements: false
      },
      'student': {
        canManageUsers: false,
        canApproveUsers: false,
        canManageDevices: false,
        canViewReports: false,
        canManageSchedule: false,
        canRequestExtensions: false,
        canApproveExtensions: false,
        canViewSecurityAlerts: false,
        canAccessAllClassrooms: false,
        canBypassTimeRestrictions: false,
        hasEmergencyAccess: false,
        hasDepartmentOverride: false,
        canAccessSecurityDevices: false,
        canAccessStudentDevices: true,
        canAccessGuestDevices: false,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: false,
        canManageSettings: false,
        canCreateSchedules: false,
        canModifySchedules: false,
        canOverrideSchedules: false,
        canViewAllSchedules: false,
        canSendNotifications: false,
        canReceiveAlerts: true,
        canManageAnnouncements: false
      },
      'security': {
        canManageUsers: false,
        canApproveUsers: false,
        canManageDevices: false,
        canViewReports: false,
        canManageSchedule: false,
        canRequestExtensions: false,
        canApproveExtensions: false,
        canViewSecurityAlerts: true,
        canAccessAllClassrooms: false,
        canBypassTimeRestrictions: false,
        hasEmergencyAccess: true,
        hasDepartmentOverride: false,
        canAccessSecurityDevices: true,
        canAccessStudentDevices: false,
        canAccessGuestDevices: false,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: false,
        canManageSettings: false,
        canCreateSchedules: false,
        canModifySchedules: false,
        canOverrideSchedules: false,
        canViewAllSchedules: false,
        canSendNotifications: true,
        canReceiveAlerts: true,
        canManageAnnouncements: false
      },
      'guest': {
        canManageUsers: false,
        canApproveUsers: false,
        canManageDevices: false,
        canViewReports: false,
        canManageSchedule: false,
        canRequestExtensions: false,
        canApproveExtensions: false,
        canViewSecurityAlerts: false,
        canAccessAllClassrooms: false,
        canBypassTimeRestrictions: false,
        hasEmergencyAccess: false,
        hasDepartmentOverride: false,
        canAccessSecurityDevices: false,
        canAccessStudentDevices: false,
        canAccessGuestDevices: true,
        canDeleteUsers: false,
        canResetPasswords: false,
        canManageRoles: false,
        canViewAuditLogs: false,
        canManageSettings: false,
        canCreateSchedules: false,
        canModifySchedules: false,
        canOverrideSchedules: false,
        canViewAllSchedules: false,
        canSendNotifications: false,
        canReceiveAlerts: false,
        canManageAnnouncements: false
      }
    };

        // Create new user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'student',
      department: department ? department.trim() : '',
      class: userClass ? userClass.trim() : '',
      employeeId: employeeId ? employeeId.trim() : undefined,
      phone: phone ? phone.trim() : undefined,
      designation: designation ? designation.trim() : undefined,
      registrationReason: reason ? reason.trim() : undefined,
      // Permissions will be automatically assigned by User model pre-save hook
      // isApproved and isActive remain false until admin approval
    });

    // Save user (password will be hashed by pre-save hook)
    await user.save();

    logger.info(`New user registered: ${user.name} (${user.email}) - Role: ${user.role}`);

    // Send notifications to all admins about new registration
    try {
      const adminRoles = ['super-admin', 'admin'];
      const admins = await User.find({
        role: { $in: adminRoles },
        isActive: true,
        isApproved: true
      }).select('_id name email');

      logger.info(`Sending registration notifications to ${admins.length} admins`);

      // Create notifications for each admin
      const notificationPromises = admins.map(admin =>
        Notification.createUserRegistrationNotification({
          recipient: admin._id,
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          department: user.department
        })
      );

      // Save all notifications
      await Promise.all(notificationPromises);

      // Send real-time notifications via Socket.IO if available
      if (req.app.get('io')) {
        admins.forEach(admin => {
          req.app.get('io').to(`user_${admin._id}`).emit('notification', {
            type: 'user_registration',
            title: 'New User Registration',
            message: `${user.name} (${user.role}) has registered and is pending approval`,
            userId: user._id,
            userName: user.name,
            userRole: user.role,
            department: user.department,
            timestamp: new Date()
          });
        });
      }

      logger.info(`Registration notifications sent to ${admins.length} admins`);
    } catch (notificationError) {
      logger.error('Error sending registration notifications:', notificationError);
      // Don't fail registration if notifications fail
    }

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Registration successful! Your account is pending admin approval.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        isApproved: user.isApproved
      }
    });

  } catch (error) {
    logger.error('Registration error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    // Fail fast if DB is not connected to avoid long buffering timeouts
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database unavailable', error: 'DB_NOT_CONNECTED' });
    }
    // Normalize email
    const emailRaw = req.body.email || '';
    const email = emailRaw.trim().toLowerCase();
    const { password } = req.body;

    // Extra debug (only in non-production)
    if (process.env.NODE_ENV !== 'production') {

      console.log('[auth:login] attempt', { email });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      if (process.env.NODE_ENV !== 'production') {

        console.log('[auth:login] invalid credentials', { email, found: !!user });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated or pending approval' });
    }

    if (!user.isApproved) {
      return res.status(401).json({ message: 'Account is pending admin approval' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    // Fetch role permissions if available
    let rolePermissions = null;
    try {
      const RolePermissions = mongoose.model('RolePermissions');
      const rolePerms = await RolePermissions.findOne({
        role: user.role,
        'metadata.isActive': true
      });

      if (rolePerms) {
        rolePermissions = {
          userManagement: rolePerms.userManagement,
          deviceManagement: rolePerms.deviceManagement,
          classroomManagement: rolePerms.classroomManagement,
          scheduleManagement: rolePerms.scheduleManagement,
          activityManagement: rolePerms.activityManagement,
          securityManagement: rolePerms.securityManagement,
          ticketManagement: rolePerms.ticketManagement,
          systemManagement: rolePerms.systemManagement,
          extensionManagement: rolePerms.extensionManagement,
          voiceControl: rolePerms.voiceControl,
          calendarIntegration: rolePerms.calendarIntegration,
          esp32Management: rolePerms.esp32Management,
          bulkOperations: rolePerms.bulkOperations,
          departmentRestrictions: rolePerms.departmentRestrictions,
          timeRestrictions: rolePerms.timeRestrictions,
          notifications: rolePerms.notifications,
          apiAccess: rolePerms.apiAccess,
          audit: rolePerms.audit
        };
      }
    } catch (roleError) {
      console.warn('Failed to fetch role permissions during login:', roleError);
      // Continue without role permissions - user will have default permissions
    }

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department || '',
        class: user.class || '',
        employeeId: user.employeeId || '',
        designation: user.designation || '',
        phone: user.phone || '',
        accessLevel: user.accessLevel,
        assignedDevices: user.assignedDevices,
        permissions: user.permissions,
        isActive: user.isActive,
        isApproved: user.isApproved,
        roleLevel: user.roleLevel,
        rolePermissions: rolePermissions
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {

      console.error('[auth:login] error', error);
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('assignedDevices');
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Simple short-lived cache (per user) to avoid hammering DB if frontend mounts multiple times quickly
    if (!global.__profileCache) global.__profileCache = new Map();
    const key = user.id;
    const now = Date.now();
    const cached = global.__profileCache.get(key);
    if (cached && (now - cached.ts) < 5000) { // 5s TTL
      return res.json({ success: true, user: cached.data });
    }

    // Fetch role permissions if available
    let rolePermissions = null;
    try {
      const RolePermissions = mongoose.model('RolePermissions');
      const rolePerms = await RolePermissions.findOne({
        role: user.role,
        'metadata.isActive': true
      });

      if (rolePerms) {
        rolePermissions = {
          userManagement: rolePerms.userManagement,
          deviceManagement: rolePerms.deviceManagement,
          classroomManagement: rolePerms.classroomManagement,
          scheduleManagement: rolePerms.scheduleManagement,
          activityManagement: rolePerms.activityManagement,
          securityManagement: rolePerms.securityManagement,
          ticketManagement: rolePerms.ticketManagement,
          systemManagement: rolePerms.systemManagement,
          extensionManagement: rolePerms.extensionManagement,
          voiceControl: rolePerms.voiceControl,
          calendarIntegration: rolePerms.calendarIntegration,
          esp32Management: rolePerms.esp32Management,
          bulkOperations: rolePerms.bulkOperations,
          departmentRestrictions: rolePerms.departmentRestrictions,
          timeRestrictions: rolePerms.timeRestrictions,
          notifications: rolePerms.notifications,
          apiAccess: rolePerms.apiAccess,
          audit: rolePerms.audit
        };
      }
    } catch (roleError) {
      console.warn('Failed to fetch role permissions during profile fetch:', roleError);
      // Continue without role permissions
    }

    const safeUser = {
      _id: user._id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || '',
      class: user.class || '',
      employeeId: user.employeeId || '',
      phone: user.phone || '',
      designation: user.designation || '',
      accessLevel: user.accessLevel,
      assignedDevices: user.assignedDevices,
      permissions: user.permissions,  // Include base user permissions
      isActive: user.isActive,
      isApproved: user.isApproved,
      roleLevel: user.roleLevel,
      registrationDate: user.registrationDate,
      lastLogin: user.lastLogin,
      canRequestExtensions: user.canRequestExtensions,
      canApproveExtensions: user.canApproveExtensions,
      profilePicture: user.profilePicture,
      idDocument: user.idDocument,
      registrationReason: user.registrationReason,
      lastProfileUpdate: user.lastProfileUpdate,
      rolePermissions: rolePermissions
    };
    global.__profileCache.set(key, { ts: now, data: safeUser });
    res.json({ success: true, user: safeUser });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated via this endpoint
    delete updates.password;
    delete updates.role;
    delete updates.isApproved;
    delete updates.isActive;

    // Validate email uniqueness if email is being updated
    if (updates.email) {
      const existingUser = await User.findOne({
        email: updates.email,
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        ...updates,
        lastProfileUpdate: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Clear profile cache
    if (global.__profileCache) {
      global.__profileCache.delete(userId);
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: user._id,
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        class: user.class,
        phone: user.phone,
        designation: user.designation,
        accessLevel: user.accessLevel,
        assignedDevices: user.assignedDevices,
        isActive: user.isActive,
        isApproved: user.isApproved,
        registrationDate: user.registrationDate,
        lastLogin: user.lastLogin,
        canRequestExtensions: user.canRequestExtensions,
        canApproveExtensions: user.canApproveExtensions,
        profilePicture: user.profilePicture,
        idDocument: user.idDocument,
        registrationReason: user.registrationReason,
        lastProfileUpdate: user.lastProfileUpdate
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    // Get user with password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`, {
      action: 'CHANGE_PASSWORD',
      userId: user._id
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 3600000; // 1 hour

    await user.save();

    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
    const emailSent = await sendPasswordResetEmail(user.email, resetUrl);

    if (!emailSent) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      return res.status(500).json({ message: 'Email could not be sent' });
    }

    res.status(200).json({ message: 'Password reset email sent' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.resetToken)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    if (req.body.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      token,
      message: 'Password has been reset'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getPendingPermissionRequests = async (req, res) => {
  try {
    const userRole = req.user.role;
    const userDepartment = req.user.department;

    const requests = await PermissionRequest.getPendingRequestsForUser(req.user.id, userRole);

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Error fetching permission requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const approvePermissionRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { comments } = req.body;

    const request = await PermissionRequest.findById(requestId).populate('userId');
    if (!request) {
      return res.status(404).json({ message: 'Permission request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    // Check if user can approve this request
    if (!request.canBeApprovedBy(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to approve this request' });
    }

    // Update request status
    request.status = 'approved';
    request.approvedBy = req.user.id;
    request.approvedAt = new Date();

    if (comments) {
      request.comments.push({
        userId: req.user.id,
        comment: comments
      });
    }

    await request.save();

    // Update user status
    const user = request.userId;
    user.isApproved = true;
    user.isActive = true;
    user.approvedBy = req.user.id;
    user.approvedAt = new Date();

    // Set additional permissions based on role
    if (['faculty', 'teacher', 'dean', 'admin', 'super-admin'].includes(user.role)) {
      user.canRequestExtensions = true;
    }

    if (['admin', 'dean', 'faculty', 'super-admin'].includes(user.role)) {
      user.canApproveExtensions = true;
    }

    await user.save();

    // Create notification for the user
    await Notification.createPermissionNotification({
      recipient: user._id,
      requestId: request._id,
      requestType: 'approved',
      userName: user.name,
      requestDetails: request.requestDetails
    });

    // Log the approval (removed ActivityLog creation)
    console.log(`Approved permission request for user ${user.email}`);

    res.json({
      success: true,
      message: 'Permission request approved successfully',
      request
    });
  } catch (error) {
    console.error('Error approving permission request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const rejectPermissionRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason, comments } = req.body;

    const request = await PermissionRequest.findById(requestId).populate('userId');
    if (!request) {
      return res.status(404).json({ message: 'Permission request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    // Check if user can reject this request
    if (!request.canBeApprovedBy(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to reject this request' });
    }

    // Update request status
    request.status = 'rejected';
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;

    if (comments) {
      request.comments.push({
        userId: req.user.id,
        comment: comments
      });
    }

    await request.save();

    // Deactivate the user
    const user = request.userId;
    user.isActive = false;
    await user.save();

    // Create notification for the user
    await Notification.createPermissionNotification({
      recipient: user._id,
      requestId: request._id,
      requestType: 'rejected',
      userName: user.name,
      requestDetails: request.requestDetails
    });

    // Log the rejection (removed ActivityLog creation)
    console.log(`Rejected permission request for user ${user.email}. Reason: ${rejectionReason}`);

    res.json({
      success: true,
      message: 'Permission request rejected successfully',
      request
    });
  } catch (error) {
    console.error('Error rejecting permission request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const requestClassExtension = async (req, res) => {
  try {
    const {
      scheduleId,
      requestedEndTime,
      reason,
      roomNumber,
      subject,
      classDetails
    } = req.body;

    // Verify user can request extensions
    if (!req.user.canRequestExtensions) {
      return res.status(403).json({ message: 'You do not have permission to request class extensions' });
    }

    const Schedule = mongoose.model('Schedule');
    const schedule = await Schedule.findById(scheduleId);

    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check if user owns this schedule or is authorized
    if (schedule.facultyId.toString() !== req.user.id && !['admin', 'dean', 'faculty', 'super-admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'You can only request extensions for your own classes' });
    }

    const extensionRequest = await ClassExtensionRequest.create({
      requestedBy: req.user.id,
      scheduleId,
      originalEndTime: schedule.endTime,
      requestedEndTime: new Date(requestedEndTime),
      reason,
      roomNumber: roomNumber || schedule.roomNumber,
      subject: subject || schedule.subject,
      classDetails
    });

    // Check for conflicts
    const conflicts = await extensionRequest.checkConflicts();

    // Notify approvers
    const approvers = await User.find({
      role: { $in: ['faculty', 'dean', 'admin', 'super-admin'] },
      department: req.user.department,
      isActive: true,
      canApproveExtensions: true
    });

    for (const approver of approvers) {
      await Notification.createExtensionNotification({
        recipient: approver._id,
        extensionId: extensionRequest._id,
        requestType: 'submitted',
        teacherName: req.user.name,
        roomNumber: extensionRequest.roomNumber,
        extensionDuration: extensionRequest.extensionDuration,
        reason
      });
    }

    // Auto-approve short extensions if no conflicts
    if (extensionRequest.extensionDuration <= 15 && conflicts.length === 0) {
      extensionRequest.status = 'auto_approved';
      extensionRequest.autoApproved = true;
      extensionRequest.approvedAt = new Date();
      await extensionRequest.save();

      // Update the schedule
      schedule.endTime = extensionRequest.requestedEndTime;
      await schedule.save();
    }

    // Log the extension request (removed ActivityLog creation)
    console.log(`Class extension requested for room ${extensionRequest.roomNumber}`);

    res.status(201).json({
      success: true,
      message: extensionRequest.status === 'auto_approved'
        ? 'Class extension auto-approved and applied'
        : 'Class extension request submitted for approval',
      request: extensionRequest,
      conflicts: conflicts.length
    });
  } catch (error) {
    console.error('Error requesting class extension:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getPendingExtensionRequests = async (req, res) => {
  try {
    const requests = await ClassExtensionRequest.getPendingRequestsForApproval(
      req.user.role,
      req.user.department
    );

    res.json({
      success: true,
      requests
    });
  } catch (error) {
    console.error('Error fetching extension requests:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const approveExtensionRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { comments } = req.body;

    const request = await ClassExtensionRequest.findById(requestId)
      .populate('requestedBy', 'name email department')
      .populate('scheduleId');

    if (!request) {
      return res.status(404).json({ message: 'Extension request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    // Check if user can approve this request
    if (!request.canBeApprovedBy(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to approve this extension' });
    }

    // Check for conflicts again
    const conflicts = await request.checkConflicts();
    if (conflicts.length > 0) {
      return res.status(400).json({
        message: 'Cannot approve extension due to scheduling conflicts',
        conflicts
      });
    }

    // Update request status
    request.status = 'approved';
    request.approvedBy = req.user.id;
    request.approvedAt = new Date();

    if (comments) {
      request.comments.push({
        userId: req.user.id,
        comment: comments
      });
    }

    await request.save();

    // Update the schedule
    const Schedule = mongoose.model('Schedule');
    await Schedule.findByIdAndUpdate(request.scheduleId, {
      endTime: request.requestedEndTime
    });

    // Create notification for the teacher
    await Notification.createExtensionNotification({
      recipient: request.requestedBy._id,
      extensionId: request._id,
      requestType: 'approved',
      teacherName: request.requestedBy.name,
      roomNumber: request.roomNumber,
      extensionDuration: request.extensionDuration,
      reason: request.reason
    });

    // Log the approval (removed ActivityLog creation)
    console.log(`Approved class extension for room ${request.roomNumber}`);

    res.json({
      success: true,
      message: 'Class extension approved successfully',
      request
    });
  } catch (error) {
    console.error('Error approving extension request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const rejectExtensionRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { rejectionReason, comments } = req.body;

    const request = await ClassExtensionRequest.findById(requestId)
      .populate('requestedBy', 'name email');

    if (!request) {
      return res.status(404).json({ message: 'Extension request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Request has already been processed' });
    }

    // Check if user can reject this request
    if (!request.canBeApprovedBy(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to reject this extension' });
    }

    // Update request status
    request.status = 'rejected';
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;

    if (comments) {
      request.comments.push({
        userId: req.user.id,
        comment: comments
      });
    }

    await request.save();

    // Create notification for the teacher
    await Notification.createExtensionNotification({
      recipient: request.requestedBy._id,
      extensionId: request._id,
      requestType: 'rejected',
      teacherName: request.requestedBy.name,
      roomNumber: request.roomNumber,
      extensionDuration: request.extensionDuration,
      reason: request.reason
    });

    // Log the rejection (removed ActivityLog creation)
    console.log(`Rejected class extension for room ${request.roomNumber}. Reason: ${rejectionReason}`);

    res.json({
      success: true,
      message: 'Class extension rejected successfully',
      request
    });
  } catch (error) {
    console.error('Error rejecting extension request:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getNotifications = async (req, res) => {
  try {
    const { limit = 50, unreadOnly = false } = req.query;

    let query = { recipient: req.user.id };
    if (unreadOnly === 'true') {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      _id: notificationId,
      recipient: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUnreadNotificationCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error getting notification count:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getPendingPermissionRequests,
  approvePermissionRequest,
  rejectPermissionRequest,
  requestClassExtension,
  getPendingExtensionRequests,
  approveExtensionRequest,
  rejectExtensionRequest,
  getNotifications,
  markNotificationAsRead,
  getUnreadNotificationCount
};

