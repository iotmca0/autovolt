const Ticket = require('../models/Ticket');
const User = require('../models/User');
const { logger } = require('../middleware/logger');
const mongoose = require('mongoose');

// Helper function to sanitize ticket data
const sanitizeTicket = (ticket) => ({
    id: ticket._id,
    ticketId: ticket.ticketId,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdBy: ticket.createdBy || { name: 'Unknown User', email: 'N/A' },
    assignedTo: ticket.assignedTo,
    department: ticket.department,
    location: ticket.location,
    deviceId: ticket.deviceId,
    tags: ticket.tags,
    resolution: ticket.resolution,
    resolvedAt: ticket.resolvedAt,
    closedAt: ticket.closedAt,
    estimatedHours: ticket.estimatedHours,
    actualHours: ticket.actualHours,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    daysOpen: ticket.daysOpen,
    comments: ticket.comments?.map(comment => ({
        id: comment._id,
        author: comment.author,
        authorName: comment.authorName,
        message: comment.message,
        isInternal: comment.isInternal,
        createdAt: comment.createdAt
    })) || []
});

// Create a new ticket
const createTicket = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to create a ticket'
            });
        }
        const {
            title,
            description,
            category,
            priority = 'medium',
            department,
            location,
            deviceId,
            tags = [],
            mentionedUsers = []
        } = req.body;

        // Validate required fields
        if (!title || !description || !category) {
            return res.status(400).json({
                error: 'Validation failed',
                details: 'Title, description, and category are required'
            });
        }

        // Validate category
        const validCategories = [
            'technical_issue', 'device_problem', 'network_issue',
            'software_bug', 'feature_request', 'account_issue',
            'security_concern', 'other'
        ];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                error: 'Validation failed',
                details: 'Invalid category'
            });
        }

        // Create ticket
        const ticket = new Ticket({
            title,
            description,
            category,
            priority,
            department: req.user.department, // Always use user's actual department, ignore frontend input
            location,
            deviceId,
            tags,
            mentionedUsers: mentionedUsers.filter(id => id), // Filter out empty strings
            createdBy: req.user.id,
            comments: [{
                author: req.user.id,
                authorName: req.user.name,
                message: 'Ticket created',
                isInternal: false
            }]
        });

        await ticket.save();

        // Populate references
        await ticket.populate('createdBy', 'name email role');
        await ticket.populate('assignedTo', 'name email role');
        await ticket.populate('deviceId', 'name location');
        await ticket.populate('mentionedUsers', 'name email role');

        // Create notifications for mentioned users
        const Notification = require('../models/Notification');
        if (mentionedUsers && mentionedUsers.length > 0) {
            const notificationPromises = mentionedUsers.map(async (userId) => {
                if (!userId) return null;
                try {
                    const notification = new Notification({
                        recipient: userId,
                        type: 'ticket_mention',
                        title: 'You were mentioned in a ticket',
                        message: `${req.user.name} mentioned you in ticket "${title}"`,
                        priority: priority === 'urgent' || priority === 'high' ? 'high' : 'medium',
                        relatedEntity: {
                            model: 'Ticket',
                            id: ticket._id
                        },
                        metadata: {
                            ticketId: ticket.ticketId,
                            category: ticket.category,
                            priority: ticket.priority
                        },
                        actions: [{
                            label: 'View Ticket',
                            action: 'view_ticket',
                            url: `/support`
                        }]
                    });
                    await notification.save();
                    
                    // Emit real-time notification
                    if (req.app.get('io')) {
                        req.app.get('io').to(userId.toString()).emit('notification', {
                            type: 'ticket_mention',
                            notification: notification
                        });
                    }
                    
                    return notification;
                } catch (error) {
                    console.error(`Error creating notification for user ${userId}:`, error);
                    return null;
                }
            });
            
            await Promise.all(notificationPromises);
        }

        // Create notifications for admins about new ticket
        try {
            const adminRoles = ['super-admin', 'admin', 'dean'];
            const admins = await require('../models/User').find({
                role: { $in: adminRoles },
                isActive: true,
                isApproved: true
            }).select('_id name email role department');

            const adminNotificationPromises = admins.map(admin =>
                Notification.createTicketNotification({
                    recipient: admin._id,
                    ticketId: ticket._id,
                    ticketTitle: ticket.title,
                    ticketCategory: ticket.category,
                    ticketPriority: ticket.priority,
                    createdBy: req.user.name,
                    department: ticket.department
                })
            );

            await Promise.all(adminNotificationPromises);

            // Emit real-time notifications to admins
            if (req.app.get('io')) {
                admins.forEach(admin => {
                    req.app.get('io').to(`user_${admin._id}`).emit('notification', {
                        type: 'ticket_created',
                        message: `New ${ticket.category} ticket created by ${req.user.name}`,
                        ticketId: ticket.ticketId,
                        priority: ticket.priority
                    });
                });
            }
        } catch (adminNotificationError) {
            console.error('Error creating admin notifications for new ticket:', adminNotificationError);
        }

        // Emit notification to admins
        if (req.app.get('io')) {
            req.app.get('io').emit('system_notification', {
                type: 'system_alert',
                message: `New support ticket created: ${ticket.title}`,
                severity: ticket.priority === 'urgent' ? 'high' : 'medium',
                metadata: {
                    ticketId: ticket.ticketId,
                    category: ticket.category,
                    priority: ticket.priority,
                    createdBy: req.user.name
                },
                timestamp: new Date()
            });
        }

        res.status(201).json({
            success: true,
            data: sanitizeTicket(ticket)
        });

    } catch (error) {
        logger.error('[createTicket] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

// Get all tickets (with role-based filtering)
const getTickets = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to view tickets'
            });
        }
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
        const status = req.query.status;
        const category = req.query.category;
        const priority = req.query.priority;
        const search = req.query.search;

        let query = {};

        // Role-based filtering
        if (req.user.role === 'admin' || req.user.role === 'super-admin') {
            // Admin and super-admin can see all tickets
            // No filtering needed
        } else if (req.user.role === 'dean' || req.user.role === 'hod') {
            // Dean and HOD can see tickets from their department OR tickets they created/assigned to
            console.log('[DEBUG] Dean/HOD User:', {
                id: req.user.id,
                name: req.user.name,
                role: req.user.role,
                department: req.user.department,
                idType: typeof req.user.id
            });

            query.$or = [
                { department: req.user.department },
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ];
        } else {
            // Regular users can only see tickets they created or are assigned to
            console.log('[DEBUG] Regular User:', {
                id: req.user.id,
                name: req.user.name,
                role: req.user.role,
                department: req.user.department,
                idType: typeof req.user.id
            });

            query.$or = [
                { createdBy: req.user.id },
                { assignedTo: req.user.id }
            ];
        }

        // Apply filters
        if (status) query.status = status;
        if (category) query.category = category;
        if (priority) query.priority = priority;

        // Search functionality
        if (search) {
            const searchConditions = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { ticketId: { $regex: search, $options: 'i' } }
            ];
            
            // If there's already an $or clause (for user filtering), combine with $and
            if (query.$or) {
                query.$and = [
                    { $or: query.$or },
                    { $or: searchConditions }
                ];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        console.log('[DEBUG] Final query:', JSON.stringify(query, null, 2));

        const total = await Ticket.countDocuments(query);
        const tickets = await Ticket.find(query)
            .populate('createdBy', 'name email role department')
            .populate('assignedTo', 'name email role department')
            .populate('deviceId', 'name location classroom')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        console.log('[DEBUG] Total tickets found:', total);
        console.log('[DEBUG] Tickets returned:', tickets.length);
        if (tickets.length > 0) {
            console.log('[DEBUG] First ticket createdBy:', tickets[0].createdBy);
        }

        res.json({
            success: true,
            data: tickets.map(sanitizeTicket),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        logger.error('[getTickets] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

// Get single ticket
const getTicket = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to view tickets'
            });
        }
        const ticket = await Ticket.findById(req.params.id)
            .populate('createdBy', 'name email role department')
            .populate('assignedTo', 'name email role department')
            .populate('deviceId', 'name location classroom');

        if (!ticket) {
            return res.status(404).json({
                error: 'Not found',
                details: 'Ticket not found'
            });
        }

        // Check permissions
        if (req.user.role !== 'admin' &&
            req.user.role !== 'super-admin' &&
            req.user.role !== 'dean' &&
            req.user.role !== 'hod' &&
            ticket.createdBy?._id?.toString() !== req.user.id &&
            ticket.assignedTo?._id?.toString() !== req.user.id) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'You do not have permission to view this ticket'
            });
        }

        // Additional check for dean/hod - must be same department
        if ((req.user.role === 'dean' || req.user.role === 'hod') && 
            ticket.department !== req.user.department) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'You can only view tickets from your department'
            });
        }

        res.json({
            success: true,
            data: sanitizeTicket(ticket)
        });

    } catch (error) {
        logger.error('[getTicket] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

// Update ticket (admin only for assignment/status, users can add comments)
const updateTicket = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to update tickets'
            });
        }
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                error: 'Not found',
                details: 'Ticket not found'
            });
        }

        const {
            status,
            assignedTo,
            priority,
            resolution,
            estimatedHours,
            actualHours,
            comment
        } = req.body;

        // Store old status for notification
        const oldStatus = ticket.status;
        const statusChanged = status && status !== oldStatus;

        // Check permissions
        const canUpdateStatus = req.user.role === 'admin' || req.user.role === 'super-admin';
        const canUpdateAssignment = req.user.role === 'admin' || req.user.role === 'super-admin';
        const isCreator = ticket.createdBy.toString() === req.user.id;
        const isAssignee = ticket.assignedTo?.toString() === req.user.id;

        if (!canUpdateStatus && !canUpdateAssignment && !isCreator && !isAssignee) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'You do not have permission to update this ticket'
            });
        }

        // Update fields based on permissions
        if (canUpdateStatus && status) {
            ticket.status = status;
            if (status === 'resolved' || status === 'closed') {
                ticket.resolvedAt = new Date();
                if (status === 'closed') {
                    ticket.closedAt = new Date();
                }
            }
        }

        if (canUpdateAssignment && assignedTo !== undefined) {
            ticket.assignedTo = assignedTo;
        }

        if (canUpdateStatus && priority) {
            ticket.priority = priority;
        }

        if (canUpdateStatus && resolution) {
            ticket.resolution = resolution;
        }

        if (canUpdateStatus && estimatedHours !== undefined) {
            ticket.estimatedHours = estimatedHours;
        }

        if (canUpdateStatus && actualHours !== undefined) {
            ticket.actualHours = actualHours;
        }

        // Add comment if provided
        if (comment) {
            ticket.comments.push({
                author: req.user.id,
                authorName: req.user.name,
                message: comment,
                isInternal: req.user.role === 'admin' && req.body.isInternal
            });
        }

        await ticket.save();

        // Populate references
        await ticket.populate('createdBy', 'name email role department');
        await ticket.populate('assignedTo', 'name email role department');
        await ticket.populate('deviceId', 'name location classroom');
        await ticket.populate('mentionedUsers', 'name email role');

        // Create notifications for status changes
        const Notification = require('../models/Notification');
        if (statusChanged) {
            // Build list of users to notify (creator, assignee, mentioned users)
            const usersToNotify = new Set();
            
            // Add ticket creator
            if (ticket.createdBy && ticket.createdBy._id) {
                usersToNotify.add(ticket.createdBy._id.toString());
            }
            
            // Add assignee if exists
            if (ticket.assignedTo && ticket.assignedTo._id) {
                usersToNotify.add(ticket.assignedTo._id.toString());
            }
            
            // Add mentioned users
            if (ticket.mentionedUsers && ticket.mentionedUsers.length > 0) {
                ticket.mentionedUsers.forEach(user => {
                    if (user && user._id) {
                        usersToNotify.add(user._id.toString());
                    }
                });
            }
            
            // Remove the user who made the change (don't notify themselves)
            usersToNotify.delete(req.user.id.toString());
            
            // Get status display text
            const statusText = {
                'open': 'Open',
                'in_progress': 'In Progress',
                'on_hold': 'On Hold',
                'resolved': 'Resolved',
                'closed': 'Closed',
                'cancelled': 'Cancelled'
            };
            
            // Create notifications for all users
            const notificationPromises = Array.from(usersToNotify).map(async (userId) => {
                try {
                    const notification = new Notification({
                        recipient: userId,
                        type: 'ticket_status_change',
                        title: `Ticket status updated to ${statusText[status] || status}`,
                        message: `${req.user.name} changed the status of ticket "${ticket.title}" from ${statusText[oldStatus] || oldStatus} to ${statusText[status] || status}`,
                        priority: status === 'resolved' || status === 'closed' ? 'low' : 'medium',
                        relatedEntity: {
                            model: 'Ticket',
                            id: ticket._id
                        },
                        metadata: {
                            ticketId: ticket.ticketId,
                            oldStatus: oldStatus,
                            newStatus: status,
                            updatedBy: req.user.name
                        },
                        actions: [{
                            label: 'View Ticket',
                            action: 'view_ticket',
                            url: `/support`
                        }]
                    });
                    await notification.save();
                    
                    // Emit real-time notification
                    if (req.app.get('io')) {
                        req.app.get('io').to(userId).emit('notification', {
                            type: 'ticket_status_change',
                            notification: notification
                        });
                    }
                    
                    return notification;
                } catch (error) {
                    console.error(`Error creating notification for user ${userId}:`, error);
                    return null;
                }
            });
            
            await Promise.all(notificationPromises);
        }
        
        // Also notify if assigned
        if (assignedTo && assignedTo !== ticket.assignedTo?.toString()) {
            try {
                const notification = new Notification({
                    recipient: assignedTo,
                    type: 'ticket_assigned',
                    title: 'Ticket assigned to you',
                    message: `${req.user.name} assigned ticket "${ticket.title}" to you`,
                    priority: ticket.priority === 'urgent' || ticket.priority === 'high' ? 'high' : 'medium',
                    relatedEntity: {
                        model: 'Ticket',
                        id: ticket._id
                    },
                    metadata: {
                        ticketId: ticket.ticketId,
                        category: ticket.category,
                        priority: ticket.priority
                    },
                    actions: [{
                        label: 'View Ticket',
                        action: 'view_ticket',
                        url: `/support`
                    }]
                });
                await notification.save();
                
                // Emit real-time notification
                if (req.app.get('io')) {
                    req.app.get('io').to(assignedTo).emit('notification', {
                        type: 'ticket_assigned',
                        notification: notification
                    });
                }
            } catch (error) {
                console.error(`Error creating assignment notification:`, error);
            }
        }

        // Emit notification for status changes (backward compatibility)
        if (req.app.get('io') && statusChanged) {
            req.app.get('io').emit('system_notification', {
                type: 'system_alert',
                message: `Ticket ${ticket.ticketId} status changed to ${status}`,
                severity: 'medium',
                metadata: {
                    ticketId: ticket.ticketId,
                    oldStatus: oldStatus,
                    newStatus: status,
                    updatedBy: req.user.name
                },
                timestamp: new Date()
            });
        }

        res.json({
            success: true,
            data: sanitizeTicket(ticket)
        });

    } catch (error) {
        logger.error('[updateTicket] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

// Delete ticket (admin only)
const deleteTicket = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to delete tickets'
            });
        }
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({
                error: 'Not found',
                details: 'Ticket not found'
            });
        }

        // Only admins and super-admins can delete tickets
        if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Only administrators can delete tickets'
            });
        }

        await ticket.deleteOne();

        res.json({
            success: true,
            message: 'Ticket deleted successfully'
        });

    } catch (error) {
        logger.error('[deleteTicket] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

// Get ticket statistics (admin only)
const getTicketStats = async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                details: 'You must be logged in to view ticket statistics'
            });
        }
        if (req.user.role !== 'admin' && req.user.role !== 'super-admin' && req.user.role !== 'dean' && req.user.role !== 'hod') {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Only administrators and department heads can view ticket statistics'
            });
        }

        // Build query based on role
        let matchQuery = {};
        if (req.user.role === 'dean' || req.user.role === 'hod') {
            // Dean/HOD can only see stats for their department
            matchQuery.department = req.user.department;
        }
        // Admin and super-admin see all stats (no filter needed)

        // Use more efficient aggregation with indexes
        const stats = await Ticket.aggregate([
            { $match: matchQuery }, // Filter by department if needed
            {
                $facet: {
                    // Count by status
                    statusCounts: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    // Count by priority
                    priorityCounts: [
                        {
                            $group: {
                                _id: '$priority',
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    // Calculate avg resolution time for resolved tickets only
                    resolutionTime: [
                        {
                            $match: {
                                resolvedAt: { $exists: true, $ne: null },
                                createdAt: { $exists: true, $ne: null }
                            }
                        },
                        {
                            $project: {
                                resolutionDays: {
                                    $divide: [
                                        { $subtract: ['$resolvedAt', '$createdAt'] },
                                        1000 * 60 * 60 * 24
                                    ]
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                avgResolutionTime: { $avg: '$resolutionDays' }
                            }
                        }
                    ],
                    // Total count
                    totalCount: [
                        { $count: 'total' }
                    ]
                }
            }
        ]);

        // Process facet results
        const result = stats[0] || {};
        const statusMap = {};
        const priorityMap = {};

        // Convert status array to object
        (result.statusCounts || []).forEach(item => {
            statusMap[item._id] = item.count;
        });

        // Convert priority array to object
        (result.priorityCounts || []).forEach(item => {
            priorityMap[item._id] = item.count;
        });

        const processedStats = {
            total: result.totalCount?.[0]?.total || 0,
            byStatus: {
                open: statusMap.open || 0,
                in_progress: statusMap.in_progress || 0,
                on_hold: statusMap.on_hold || 0,
                resolved: statusMap.resolved || 0,
                closed: statusMap.closed || 0,
                cancelled: statusMap.cancelled || 0
            },
            byPriority: {
                urgent: priorityMap.urgent || 0,
                high: priorityMap.high || 0,
                medium: priorityMap.medium || 0,
                low: priorityMap.low || 0
            },
            avgResolutionTime: result.resolutionTime?.[0]?.avgResolutionTime || 0
        };

        res.json({
            success: true,
            data: processedStats
        });

    } catch (error) {
        logger.error('[getTicketStats] error:', error);
        res.status(500).json({
            error: 'Server error',
            details: error.message
        });
    }
};

module.exports = {
    createTicket,
    getTickets,
    getTicket,
    updateTicket,
    deleteTicket,
    getTicketStats
};
