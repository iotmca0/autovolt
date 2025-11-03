const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'security_alert',
            'unauthorized_access',
            'device_malfunction',
            'schedule_conflict',
            'extension_request',
            'permission_request',
            'system_maintenance',
            'user_registration',
            'password_reset',
            'account_approved',
            'account_rejected',
            'extension_approved',
            'extension_rejected',
            'ticket_mention',
            'ticket_status_change',
            'ticket_assigned',
            'ticket_created'
        ],
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        index: true
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: {
        type: Date
    },
    relatedEntity: {
        model: {
            type: String,
            enum: ['User', 'Device', 'Schedule', 'PermissionRequest', 'ClassExtensionRequest', 'SecurityAlert', 'Ticket']
        },
        id: {
            type: mongoose.Schema.Types.ObjectId
        }
    },
    metadata: {
        // Additional context-specific data
        deviceId: mongoose.Schema.Types.ObjectId,
        roomNumber: String,
        userId: mongoose.Schema.Types.ObjectId,
        ipAddress: String,
        userAgent: String,
        location: String,
        timestamp: Date,
        severity: {
            type: String,
            enum: ['info', 'warning', 'error', 'critical']
        }
    },
    actions: [{
        label: String,
        action: String, // e.g., 'approve_request', 'view_details', 'dismiss'
        url: String,
        data: mongoose.Schema.Types.Mixed
    }],
    emailSent: {
        type: Boolean,
        default: false
    },
    emailSentAt: {
        type: Date
    },
    smsSent: {
        type: Boolean,
        default: false
    },
    smsSentAt: {
        type: Date
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        index: { expires: 0 } // TTL index
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ priority: 1, isRead: 1, createdAt: -1 });

// Pre-save middleware to set priority based on type
notificationSchema.pre('save', function (next) {
    if (this.isNew) {
        // Set priority based on notification type
        const highPriorityTypes = [
            'security_alert',
            'unauthorized_access',
            'device_malfunction',
            'account_rejected',
            'extension_rejected'
        ];

        const urgentTypes = [
            'system_maintenance'
        ];

        if (urgentTypes.includes(this.type)) {
            this.priority = 'urgent';
        } else if (highPriorityTypes.includes(this.type)) {
            this.priority = 'high';
        } else if (this.metadata?.severity === 'critical') {
            this.priority = 'urgent';
        } else if (this.metadata?.severity === 'error') {
            this.priority = 'high';
        }
    }
    next();
});

// Instance method to mark as read
notificationSchema.methods.markAsRead = function () {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

// Instance method to send email notification
notificationSchema.methods.sendEmail = async function () {
    if (this.emailSent) return;

    try {
        const User = mongoose.model('User');
        const user = await User.findById(this.recipient);

        if (user && user.notificationPreferences.email) {
            // Here you would integrate with your email service
            // For now, we'll just mark it as sent
            this.emailSent = true;
            this.emailSentAt = new Date();
            await this.save();
        }
    } catch (error) {
        console.error('Error sending email notification:', error);
    }
};

// Static method to create security alert notification
notificationSchema.statics.createSecurityAlert = async function (data) {
    const {
        recipient,
        alertType,
        deviceId,
        roomNumber,
        userId,
        ipAddress,
        userAgent,
        location,
        severity = 'warning'
    } = data;

    const alertMessages = {
        unauthorized_access: {
            title: 'Unauthorized Device Access Detected',
            message: `Unauthorized access attempt detected for device in room ${roomNumber}`
        },
        suspicious_activity: {
            title: 'Suspicious Activity Detected',
            message: `Suspicious activity detected in room ${roomNumber}`
        },
        device_tampering: {
            title: 'Device Tampering Alert',
            message: `Potential tampering detected with device in room ${roomNumber}`
        },
        unusual_pattern: {
            title: 'Unusual Usage Pattern',
            message: `Unusual usage pattern detected for device in room ${roomNumber}`
        }
    };

    const alertData = alertMessages[alertType] || {
        title: 'Security Alert',
        message: `Security alert for device in room ${roomNumber}`
    };

    const notification = new this({
        recipient,
        type: 'security_alert',
        title: alertData.title,
        message: alertData.message,
        priority: severity === 'critical' ? 'urgent' : 'high',
        relatedEntity: {
            model: 'Device',
            id: deviceId
        },
        metadata: {
            deviceId,
            roomNumber,
            userId,
            ipAddress,
            userAgent,
            location,
            timestamp: new Date(),
            severity
        },
        actions: [
            {
                label: 'View Details',
                action: 'view_device',
                url: `/devices/${deviceId}`
            },
            {
                label: 'Check Logs',
                action: 'view_logs',
                url: `/logs?device=${deviceId}&date=${new Date().toISOString().split('T')[0]}`
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create extension request notification
notificationSchema.statics.createExtensionNotification = async function (data) {
    const {
        recipient,
        extensionId,
        requestType, // 'submitted', 'approved', 'rejected'
        teacherName,
        roomNumber,
        extensionDuration,
        reason
    } = data;

    let title, message, type, priority;

    switch (requestType) {
        case 'submitted':
            title = 'New Class Extension Request';
            message = `${teacherName} has requested a ${extensionDuration} minute extension for class in room ${roomNumber}`;
            type = 'extension_request';
            priority = 'medium';
            break;
        case 'approved':
            title = 'Extension Request Approved';
            message = `Your ${extensionDuration} minute extension request for room ${roomNumber} has been approved`;
            type = 'extension_approved';
            priority = 'low';
            break;
        case 'rejected':
            title = 'Extension Request Rejected';
            message = `Your extension request for room ${roomNumber} has been rejected`;
            type = 'extension_rejected';
            priority = 'medium';
            break;
    }

    const notification = new this({
        recipient,
        type,
        title,
        message,
        priority,
        relatedEntity: {
            model: 'ClassExtensionRequest',
            id: extensionId
        },
        actions: [
            {
                label: 'View Details',
                action: 'view_extension',
                url: `/extensions/${extensionId}`
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create permission request notification
notificationSchema.statics.createPermissionNotification = async function (data) {
    const {
        recipient,
        requestId,
        requestType, // 'submitted', 'approved', 'rejected'
        userName,
        requestDetails
    } = data;

    let title, message, type, priority;

    switch (requestType) {
        case 'submitted':
            title = 'New Permission Request';
            message = `${userName} has submitted a new permission request`;
            type = 'permission_request';
            priority = 'medium';
            break;
        case 'approved':
            title = 'Permission Request Approved';
            message = `Your permission request has been approved`;
            type = 'account_approved';
            priority = 'low';
            break;
        case 'rejected':
            title = 'Permission Request Rejected';
            message = `Your permission request has been rejected`;
            type = 'account_rejected';
            priority = 'medium';
            break;
    }

    const notification = new this({
        recipient,
        type,
        title,
        message,
        priority,
        relatedEntity: {
            model: 'PermissionRequest',
            id: requestId
        },
        actions: [
            {
                label: 'View Details',
                action: 'view_request',
                url: `/permissions/${requestId}`
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create user registration notification
notificationSchema.statics.createUserRegistrationNotification = async function (data) {
    const {
        recipient,
        userId,
        userName,
        userEmail,
        userRole,
        department
    } = data;

    const notification = new this({
        recipient,
        type: 'user_registration',
        title: 'New User Registration',
        message: `${userName} (${userRole}) has registered and is pending approval`,
        priority: 'medium',
        relatedEntity: {
            model: 'User',
            id: userId
        },
        metadata: {
            userId,
            userName,
            userEmail,
            userRole,
            department,
            registrationDate: new Date()
        },
        actions: [
            {
                label: 'Review Registration',
                action: 'review_user',
                url: `/admin/users/${userId}`
            },
            {
                label: 'Approve User',
                action: 'approve_user',
                url: `/admin/users/${userId}/approve`
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create ticket creation notification
notificationSchema.statics.createTicketNotification = async function (data) {
    const {
        recipient,
        ticketId,
        ticketTitle,
        ticketCategory,
        ticketPriority,
        createdBy,
        department
    } = data;

    const notification = new this({
        recipient,
        type: 'ticket_created',
        title: 'New Support Ticket Created',
        message: `${createdBy} created a new ${ticketCategory} ticket: "${ticketTitle}"`,
        priority: ticketPriority === 'urgent' || ticketPriority === 'high' ? 'high' : 'medium',
        relatedEntity: {
            model: 'Ticket',
            id: ticketId
        },
        metadata: {
            ticketId: ticketId,
            category: ticketCategory,
            priority: ticketPriority,
            createdBy: createdBy,
            department: department
        },
        actions: [
            {
                label: 'View Ticket',
                action: 'view_ticket',
                url: `/support`
            },
            {
                label: 'Assign Ticket',
                action: 'assign_ticket',
                url: `/admin/tickets/${ticketId}/assign`
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create account approval notification
notificationSchema.statics.createAccountApprovalNotification = async function (data) {
    const {
        recipient,
        approvedBy,
        userRole,
        department
    } = data;

    const notification = new this({
        recipient,
        type: 'account_approved',
        title: 'Account Approved',
        message: `Your account has been approved by ${approvedBy}. You can now access the system.`,
        priority: 'low',
        metadata: {
            approvedBy: approvedBy,
            userRole: userRole,
            department: department,
            approvalDate: new Date()
        },
        actions: [
            {
                label: 'Get Started',
                action: 'dashboard',
                url: '/dashboard'
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

// Static method to create account rejection notification
notificationSchema.statics.createAccountRejectionNotification = async function (data) {
    const {
        recipient,
        rejectedBy,
        rejectionReason,
        userRole,
        department
    } = data;

    const notification = new this({
        recipient,
        type: 'account_rejected',
        title: 'Account Registration Rejected',
        message: `Your account registration has been rejected by ${rejectedBy}. ${rejectionReason || 'Please contact an administrator for more information.'}`,
        priority: 'medium',
        metadata: {
            rejectedBy: rejectedBy,
            rejectionReason: rejectionReason,
            userRole: userRole,
            department: department,
            rejectionDate: new Date()
        },
        actions: [
            {
                label: 'Contact Support',
                action: 'contact_support',
                url: '/support'
            }
        ]
    });

    await notification.save();
    await notification.sendEmail();

    return notification;
};

module.exports = mongoose.model('Notification', notificationSchema);
