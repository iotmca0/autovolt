const axios = require('axios');
const crypto = require('crypto');
const TelegramUser = require('../models/TelegramUser');
const User = require('../models/User');
const DeviceQueryService = require('./deviceQueryService');
// Removed circular import: const smartNotificationService = require('./smartNotificationService');

class TelegramService {
  constructor() {
    // Defer environment variable access until initialize() is called
    this.botToken = null;
    this.baseUrl = null;
    this.webhookUrl = null;
    this.isInitialized = false;
    this.pollingInterval = null;
    this.lastUpdateId = 0;
    // In-memory dedupe for recent update IDs to avoid processing the same Telegram update twice
    // Map<updateId, timestampMs>
    this.recentUpdateIds = new Map();
  // Track the most recently shown interactive menu per chat/telegramId
  // Map<key, { menu: string, ts: number }>
  // key is either telegramId or `chat:${chatId}` when telegramId isn't available
  this.recentMenu = new Map();
    // Periodically prune old entries (every 60s)
    this._recentPruneInterval = setInterval(() => {
      const cutoff = Date.now() - 1000 * 60 * 10; // keep 10 minutes
      for (const [id, ts] of this.recentUpdateIds.entries()) {
        if (ts < cutoff) this.recentUpdateIds.delete(id);
      }
      // prune recentMenu older than cutoff as well
      for (const [key, meta] of this.recentMenu.entries()) {
        if (!meta || (meta.ts && meta.ts < cutoff)) this.recentMenu.delete(key);
      }
    }, 60 * 1000);
  }

  // Initialize the bot
  async initialize() {
    if (this.isInitialized) return;

    // Load environment variables here, after dotenv has been configured
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
    this.webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

    try {
      // Validate required environment variables
      if (!this.botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
      }

  // For local networks, polling mode is more reliable than webhooks
      // Webhooks require public URLs (ngrok, etc.) which can expire
  // Debug flag from env
  this.debug = process.env.TELEGRAM_DEBUG === '1' || process.env.TELEGRAM_DEBUG === 'true';
      console.log('Telegram bot: Using polling mode (recommended for local networks)');

      // Only try webhook if explicitly configured
      if (this.webhookUrl) {
        try {
          await this.setWebhook(this.webhookUrl);
          console.log('Telegram webhook mode enabled');
        } catch (webhookError) {
          console.warn('Webhook setup failed, falling back to polling mode:', webhookError.message);
          this.startPolling();
        }
      } else {
        // Default to polling mode (more reliable for local development)
        this.startPolling();
        console.log('Telegram polling mode enabled (default for local networks)');
      }

      // Clean up expired registration tokens (non-blocking)
      try {
        await Promise.race([
          TelegramUser.cleanupExpiredTokens(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Token cleanup timeout')), 5000)
          )
        ]);
        console.log('Telegram token cleanup completed');
      } catch (cleanupError) {
        console.warn('Token cleanup failed (non-critical):', cleanupError.message);
        // Continue initialization even if cleanup fails
      }

      this.isInitialized = true;
      console.log('Telegram service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Telegram service:', error);
      throw error;
    }
  }

  // Set webhook for receiving updates
  async setWebhook(url) {
    try {
      const response = await axios.post(`${this.baseUrl}/setWebhook`, {
        url: url,
        allowed_updates: ['message', 'callback_query']
      });

      if (!response.data.ok) {
        throw new Error(`Webhook setup failed: ${response.data.description}`);
      }

      console.log('Telegram webhook set successfully');
      return response.data;
    } catch (error) {
      console.error('Error setting webhook:', error);
      throw error;
    }
  }

  // Send message to a specific chat
  async sendMessage(chatId, text, options = {}) {
    try {
      const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
      };

      const response = await axios.post(`${this.baseUrl}/sendMessage`, payload);

      if (!response.data.ok) {
        throw new Error(`Failed to send message: ${response.data.description}`);
      }

      // Update message count for the user if we have telegramId
      // Note: telegramId is not available in this context, so we skip updating count here
      // The count will be updated in processWebhookUpdate when messages are received

      return response.data.result;
    } catch (error) {
      console.error('Error sending Telegram message:', error);
      throw error;
    }
  }

  // Update message count for user (use upsert to ensure a record exists)
  async updateMessageCount(telegramId) {
    try {
      await TelegramUser.findOneAndUpdate(
        { telegramId },
        { $inc: { messagesReceived: 1 }, $set: { lastInteraction: new Date() } },
        { upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      console.error('Error updating message count:', error);
    }
  }

  // Send alert to multiple users
  async sendAlert(alertType, alertData, alertLabels = {}) {
    try {
      const subscribers = await TelegramUser.getActiveSubscribers(alertType, alertLabels);

      if (subscribers.length === 0) {
        console.log(`No subscribers found for alert type: ${alertType}`);
        return []; // Return empty array instead of undefined
      }

      const message = this.formatAlertMessage(alertData);

      const results = [];
      for (const subscriber of subscribers) {
        try {
          await this.sendMessage(subscriber.chatId, message);
          await subscriber.recordAlert(alertType);
          results.push({ chatId: subscriber.chatId, success: true });
        } catch (error) {
          console.error(`Failed to send alert to ${subscriber.chatId}:`, error);
          results.push({ chatId: subscriber.chatId, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      console.error('Error sending alert to subscribers:', error);
      throw error;
    }
  }

  // Format alert message
  formatAlertMessage(alertData) {
    const {
      alertname,
      summary,
      description,
      severity = 'info',
      instance,
      value
    } = alertData;

    const emoji = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    }[severity] || '📢';

    let message = `${emoji} *IoT Classroom Alert* ${emoji}\n\n`;
    message += `*Alert:* ${alertname}\n`;
    message += `*Summary:* ${summary}\n`;

    // Description is already formatted, just add it as-is
    if (description) {
      message += `*Description:* ${description}\n`;
    }

    if (severity) message += `*Severity:* ${severity}\n`;
    if (instance) message += `*Instance:* ${instance}\n`;
    if (value) message += `*Value:* ${value}\n`;

    message += `\n*Time:* ${new Date().toLocaleString()}\n\n`;
    message += `Please take action immediately!`;

    return message;
  }

  // Handle incoming bot commands
  // telegramId is passed so handlers that need it (register/verification) can use it
  async handleCommand(chatId, command, args = [], telegramUser = null, telegramId = null) {
    try {
      switch (command.toLowerCase()) {
        case '/start':
          return await this.handleStart(chatId, telegramUser);

        case '/register':
          return await this.handleRegister(chatId, args, telegramUser, telegramId);

        case '/status':
          // Pass args as the second parameter and telegramUser as the third
          return await this.handleStatus(chatId, args, telegramUser);

        case '/subscribe':
          return await this.handleSubscribe(chatId, args, telegramUser);

        case '/unsubscribe':
          return await this.handleUnsubscribe(chatId, args, telegramUser);

        case '/devices':
        case '/device':
          const deviceQuery = args.length > 0 ? this.parseDeviceQueryInput(args[0]) : null;
          return await DeviceQueryService.handleDeviceQuery(chatId, deviceQuery, this, telegramUser);

        case '/help':
          return await this.handleHelp(chatId, args, telegramUser);

        case '/alert':
        case '/sendalert':
          return await this.handleSendAlert(chatId, args, telegramUser);

        default:
          return await this.sendMessage(chatId, 'Unknown command. Use /help to see available commands.');
      }
    } catch (error) {
      console.error('Error handling command:', error);

      // Avoid spamming group chats with generic error messages.
      // Telegram group chat IDs are negative; private/user chat IDs are positive.
      const numericChatId = parseInt(chatId, 10);

      if (!Number.isNaN(numericChatId) && numericChatId > 0) {
        try {
          await this.sendMessage(chatId, 'Sorry, an error occurred while processing your command.');
        } catch (sendErr) {
          // If even sending the error message fails, log it but don't throw further.
          console.error('Failed to send error message to user chat', chatId, sendErr);
        }
      } else {
        console.warn('Skipping user-facing error message for non-private chat:', chatId);
      }
    }
  }

  // Handle /start command
  async handleStart(chatId, telegramUser) {
    if (telegramUser) {
      if (telegramUser.isVerified) {
        return await this.sendMessage(
          chatId,
          `Welcome back! You're already registered with the IoT Classroom system.\n\nUse /help to see available commands.`
        );
      } else {
        // User exists but not verified
        if (telegramUser.registrationToken && telegramUser.tokenExpires > new Date()) {
          await telegramUser.populate('user');
          const minutesLeft = Math.ceil((telegramUser.tokenExpires - new Date()) / (1000 * 60));
          return await this.sendMessage(
            chatId,
            `Welcome back! You have a pending registration.\n\n` +
            `⏳ *Verification Required*\n` +
            `Please reply with your 6-character verification code (expires in ${minutesLeft} minutes).\n\n` +
            `If you don't have the code, use '/register ${telegramUser.user.email}' to get a new one.\n\n` +
            `Use /help for more information.`
          );
        } else {
          // Token expired
          return await this.sendMessage(
            chatId,
            `Welcome back! Your previous registration has expired.\n\n` +
            `Please register again with: '/register <your-email>'\n\n` +
            `Use /help for more information.`
          );
        }
      }
    }

    const welcomeMessage = `🤖 *Welcome to IoT Classroom Bot!*\n\n` +
      `This bot sends you important notifications about:\n` +
      `- Device offline alerts\n` +
      `- Energy conservation reminders\n` +
      `- Security notifications\n` +
      `- System maintenance alerts\n\n` +
      `*Important Restrictions:*\n` +
      `- Only administrators and security personnel can register\n` +
      `- Multiple authorized users can register for Telegram alerts\n\n` +
      `To get started, you need to register with your system account.\n\n` +
  `Use: '/register <your-email>'\n\n` +
  `Example: '/register admin@university.edu'\n\n` +
      `Use /help for more commands.`;

    return await this.sendMessage(chatId, welcomeMessage);
  }

  // Handle /register command
  async handleRegister(chatId, args, telegramUser, telegramId) {
    if (telegramUser) {
      // Check if user is already verified
      if (telegramUser.isVerified) {
        return await this.sendMessage(
          chatId,
          `You're already registered and verified! Use /status to check your current settings.`
        );
      } else {
        // User exists but is not verified - they need to complete verification
        if (telegramUser.registrationToken && telegramUser.tokenExpires > new Date()) {
          await telegramUser.populate('user');
          return await this.sendMessage(
            chatId,
            `You have a pending registration that needs verification!\n\n` +
            `Please reply with your verification code (it expires in ${Math.ceil((telegramUser.tokenExpires - new Date()) / (1000 * 60))} minutes).\n\n` +
            `If you don't have the code, use '/register ${telegramUser.user.email}' again to get a new one.`
          );
        } else {
          // Token expired, allow re-registration
          console.log(`Expired token found for user ${telegramUser.user.name}, allowing re-registration`);
        }
      }
    }

    if (args.length === 0) {
      return await this.sendMessage(
        chatId,
  `Please provide your email address.\n\nUsage: '/register <your-email>'\nExample: '/register john@university.edu'`
      );
    }

    const email = args[0].toLowerCase().trim();

    try {
      // Find user by email
      const user = await User.findOne({ email, isActive: true, isApproved: true });

      if (!user) {
        return await this.sendMessage(
          chatId,
          `❌ No active user found with email: ${email}\n\nPlease check your email address and try again.`
        );
      }

      // Check if user role is authorized for Telegram registration
      const allowedRoles = ['super-admin', 'dean', 'hod', 'admin', 'security'];
      if (!allowedRoles.includes(user.role)) {
        return await this.sendMessage(
          chatId,
          `❌ Telegram registration is restricted to administrators and security personnel only.\n\nYour current role (${user.role}) is not authorized to receive Telegram alerts.\n\nPlease contact an administrator if you need access.`
        );
      }

      // Check if user already has a verified Telegram registration
      const verifiedTelegramUser = await TelegramUser.findOne({ user: user._id, isVerified: true });
      if (verifiedTelegramUser) {
        return await this.sendMessage(
          chatId,
          `❌ This email is already registered with a verified Telegram account.\n\nIf you need to change your registration, please contact an administrator.`
        );
      }

      // Handle the registration for this telegramId/chatId
      let existingRecord = null;
      if (telegramId) {
        existingRecord = await TelegramUser.findOne({ telegramId });
      }

      if (existingRecord) {
        // Update existing record with new token
        existingRecord.user = user._id;
        existingRecord.registrationToken = crypto.randomBytes(3).toString('hex').toUpperCase();
        existingRecord.tokenExpires = new Date(Date.now() + 10 * 60 * 1000);
        existingRecord.isVerified = false;
        existingRecord.chatId = chatId; // keep chatId up-to-date
        await existingRecord.save();
        // Use existingRecord as the telegramUser for messaging below
        telegramUser = existingRecord;
      } else {
        // Create new record; if telegramId missing, still create but telegramId will be undefined
        telegramUser = new TelegramUser({
          user: user._id,
          telegramId: telegramId,
          chatId: chatId,
          registrationToken: crypto.randomBytes(3).toString('hex').toUpperCase(),
          tokenExpires: new Date(Date.now() + 10 * 60 * 1000),
          isVerified: false
        });
        await telegramUser.save();
      }

      // Send verification message
      const verifyMessage = `✅ *Registration Started!*\n\n` +
        `Hello ${user.name}!\n\n` +
        `Your verification code is: \`${telegramUser.registrationToken}\`\n\n` +
        `Please verify your registration by replying with this code within 10 minutes.\n\n` +
        `This code will expire automatically.`;

      return await this.sendMessage(chatId, verifyMessage);

    } catch (error) {
      console.error('Error in registration:', error);
      return await this.sendMessage(
        chatId,
        `❌ An error occurred during registration. Please try again later.`
      );
    }
  }

  // Handle verification code
  async handleVerification(telegramId, code) {
    try {
      const telegramUser = await TelegramUser.findOne({
        telegramId,
        registrationToken: code.toUpperCase(),
        tokenExpires: { $gt: new Date() }
      }).populate('user');

      if (!telegramUser) {
        // Find the user to get their chatId for sending the message
        const userRecord = await TelegramUser.findOne({ telegramId });
        const chatId = userRecord ? userRecord.chatId : null;
        
        if (!chatId) {
          console.error('Cannot send verification error message: no chatId found for telegramId:', telegramId);
          return;
        }
        
        return await this.sendMessage(
          chatId,
          `❌ Invalid or expired verification code.\n\nPlease start registration again with '/register <your-email>'`
        );
      }

      // Complete verification
      telegramUser.clearToken();
      await telegramUser.save();

      // Update user's notification preferences
      await User.findByIdAndUpdate(telegramUser.user._id, {
        'notificationPreferences.telegram': true
      });

      const successMessage = `🎉 *Registration Complete!*\n\n` +
        `Welcome ${telegramUser.user.name}!\n\n` +
        `You're now registered to receive IoT Classroom notifications.\n\n` +
        `*Your current subscriptions:*\n` +
        `${telegramUser.roleSubscriptions.map(sub => {
          const options = this.getSubscriptionOptions();
          const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === sub);
          return optionEntry ? `${optionEntry[0]}. ${optionEntry[1].name}` : sub;
        }).join('\n')}\n\n` +
        `💡 *Easy management:*\n` +
  `Use '/subscribe' and '/unsubscribe' with numbers!\n\n` +
        `Use /help for more commands.`;

      return await this.sendMessage(telegramUser.chatId, successMessage);

    } catch (error) {
      console.error('Error in verification:', error);
      
      // Try to find chatId for error message
      try {
        const userRecord = await TelegramUser.findOne({ telegramId });
        if (userRecord && userRecord.chatId) {
          return await this.sendMessage(
            userRecord.chatId,
            `❌ An error occurred during verification. Please try again.`
          );
        }
      } catch (findError) {
        console.error('Error finding user for error message:', findError);
      }
    }
  }

  // Handle /status command
  async handleStatus(chatId, args, telegramUser) {
    if (!telegramUser) {
      return await this.sendMessage(
        chatId,
  `❌ You're not registered yet.\n\nUse '/register <your-email>' to get started.`
      );
    }

    // Check if user is verified
    if (!telegramUser.isVerified) {
      await telegramUser.populate('user');
      if (telegramUser.registrationToken && telegramUser.tokenExpires > new Date()) {
        const minutesLeft = Math.ceil((telegramUser.tokenExpires - new Date()) / (1000 * 60));
        return await this.sendMessage(
          chatId,
          `⏳ *Registration Pending Verification*\n\n` +
          `You have started registration but haven't verified your account yet.\n\n` +
          `📧 *Email:* ${telegramUser.user.email}\n` +
          `⏰ *Code expires in:* ${minutesLeft} minutes\n\n` +
          `Please reply with your 6-character verification code.\n\n` +
          `If you don't have the code, use '/register ${telegramUser.user.email}' to get a new one.`
        );
      } else {
        // Token expired
        return await this.sendMessage(
          chatId,
          `❌ *Registration Expired*\n\n` +
          `Your verification code has expired.\n\n` +
          `Please register again with: '/register <your-email>'`
        );
      }
    }

    // If no args provided, show numbered menu
    if (args.length === 0) {
      const options = this.getStatusViewOptions();
      const statusList = Object.entries(options)
        .map(([num, option]) => `${num}. ${option.name} - ${option.description}`)
        .join('\n');
      // record transient menu so plain-number replies work
      try {
        const key = telegramUser && telegramUser.telegramId ? telegramUser.telegramId : `chat:${chatId}`;
        this.recentMenu.set(key, { menu: 'status', ts: Date.now() });
      } catch (e) {
        // ignore
      }

      return await this.sendMessage(
        chatId,
        `📊 *Status Information Menu*\n\n${statusList}\n\n` +
        `💡 *How to use:*\n` +
  `• Type a number: '/status 1' (for My Status)\n` +
  `• Or use the command: '/status personal'\n\n` +
  `Example: '/status 3' for Device Status`
      );
    }

    const statusView = this.parseStatusViewInput(args[0]);

    switch (statusView) {
      case 'personal':
      case '1':
        return await this.handlePersonalStatus(chatId, telegramUser);

      case 'system':
      case '2':
        return await this.handleSystemStatus(chatId);

      case 'devices':
      case '3':
        return await this.handleDeviceStatus(chatId);

      case 'alerts':
      case '4':
        return await this.handleAlertStatus(chatId, telegramUser);

      case 'subscriptions':
      case '5':
        return await this.handleSubscriptionStatus(chatId, telegramUser);

      case 'activity':
      case '6':
        return await this.handleActivityStatus(chatId, telegramUser);

      default:
        return await this.sendMessage(
          chatId,
          `❌ Invalid status option.\n\nUse '/status' to see available numbered options.`
        );
    }
  }

  // Handle personal status view
  async handlePersonalStatus(chatId, telegramUser) {
    await telegramUser.populate('user');

    const verificationStatus = telegramUser.isVerified ? '✅ Verified' : '⏳ Pending Verification';
    const registrationDate = telegramUser.createdAt ? telegramUser.createdAt.toLocaleString() : 'Unknown';

    const statusMessage = `👤 *Your Personal Status*\n\n` +
      `*Name:* ${telegramUser.user.name}\n` +
      `*Role:* ${telegramUser.user.role}\n` +
      `*Email:* ${telegramUser.user.email}\n\n` +
      `*Telegram Status:* ${verificationStatus}\n` +
      `*Active:* ${telegramUser.isActive ? '✅ Yes' : '❌ No'}\n` +
      `*Registration Date:* ${registrationDate}\n\n` +
      `*Messages Received:* ${telegramUser.messagesReceived}\n` +
      `*Last Interaction:* ${telegramUser.lastInteraction ? telegramUser.lastInteraction.toLocaleString() : 'Never'}\n\n` +
      `💡 *Manage subscriptions:*\n` +
  `Use '/subscribe' or '/unsubscribe' with numbers!`;

    return await this.sendMessage(chatId, statusMessage);
  }

  // Handle system status view
  async handleSystemStatus(chatId) {
    try {
      // Get system statistics
      const totalUsers = await require('../models/User').countDocuments({ isActive: true });
      const totalTelegramUsers = await require('../models/TelegramUser').countDocuments({ isActive: true });
      const totalDevices = await require('../models/Device').countDocuments({});
      const onlineDevices = await require('../models/Device').countDocuments({ status: 'online' });

      const statusMessage = `🖥️ *System Status*\n\n` +
        `*Users:* ${totalUsers} active\n` +
        `*Telegram Users:* ${totalTelegramUsers} registered\n` +
        `*Devices:* ${onlineDevices}/${totalDevices} online\n\n` +
        `*System Health:* ${onlineDevices > 0 ? '✅ Good' : '⚠️ Warning'}\n` +
        `*Last Updated:* ${new Date().toLocaleString()}\n\n` +
        `💡 *For detailed device info:*\n` +
  `Use '/devices' or '/status 3' for device status`;

      return await this.sendMessage(chatId, statusMessage);
    } catch (error) {
      console.error('Error getting system status:', error);
      return await this.sendMessage(chatId, 'Error retrieving system status.');
    }
  }

  // Handle device status view
  async handleDeviceStatus(chatId) {
    try {
      const totalDevices = await require('../models/Device').countDocuments({});
      const onlineDevices = await require('../models/Device').countDocuments({ status: 'online' });
      const offlineDevices = totalDevices - onlineDevices;

      const statusMessage = `🔌 *Device Status Summary*\n\n` +
        `📊 *Overview:*\n` +
        `• Total Devices: ${totalDevices}\n` +
        `• 🟢 Online: ${onlineDevices}\n` +
        `• 🔴 Offline: ${offlineDevices}\n\n` +
        `*Health Status:* ${offlineDevices === 0 ? '✅ All Online' : offlineDevices < 3 ? '⚠️ Minor Issues' : '🚨 Attention Needed'}\n\n` +
        `💡 *For detailed info:*\n` +
        `• \`/devices 1\` - Show offline devices\n` +
        `• \`/devices 4\` - Full status summary\n` +
        `• \`/devices 5\` - Devices by classroom`;

      return await this.sendMessage(chatId, statusMessage);
    } catch (error) {
      console.error('Error getting device status:', error);
      return await this.sendMessage(chatId, 'Error retrieving device status.');
    }
  }

  // Handle alert status view
  async handleAlertStatus(chatId, telegramUser) {
    const statusMessage = `📢 *Alert Statistics*\n\n` +
      `*Alerts Received:* ${telegramUser.alertsReceived}\n` +
      `*Last Alert:* ${telegramUser.lastAlertReceived ? telegramUser.lastAlertReceived.toLocaleString() : 'Never'}\n\n` +
      `*Current Subscriptions:* ${telegramUser.roleSubscriptions.length > 0 ? '' : 'None'}\n` +
      `${telegramUser.roleSubscriptions.length > 0 ?
        telegramUser.roleSubscriptions.map(sub => {
          const options = this.getSubscriptionOptions();
          const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === sub);
          return optionEntry ? `• ${optionEntry[1].name}` : `• ${sub}`;
        }).join('\n') : ''}\n\n` +
      `💡 *Manage subscriptions:*\n` +
      `Use \`/subscribe\` or \`/unsubscribe\` with numbers!`;

    return await this.sendMessage(chatId, statusMessage);
  }

  // Handle subscription status view
  async handleSubscriptionStatus(chatId, telegramUser) {
    const options = this.getSubscriptionOptions();
    const currentSubs = telegramUser.roleSubscriptions.length > 0 ?
      telegramUser.roleSubscriptions.map(sub => {
        const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === sub);
        return optionEntry ? `${optionEntry[0]}. ${optionEntry[1].name}` : sub;
      }).join('\n') : 'None';

    const statusMessage = `📋 *Your Alert Subscriptions*\n\n${currentSubs}\n\n` +
      `💡 *Available options:*\n` +
      `• \`/subscribe <number>\` - Add subscription\n` +
      `• \`/unsubscribe <number>\` - Remove subscription\n` +
      `• \`/subscribe\` - See all available alerts\n\n` +
      `Example: \`/subscribe 4\` for Energy Alerts`;

    return await this.sendMessage(chatId, statusMessage);
  }

  // Handle activity status view
  async handleActivityStatus(chatId, telegramUser) {
    const statusMessage = `📈 *Your Recent Activity*\n\n` +
      `*Messages Received:* ${telegramUser.messagesReceived}\n` +
      `*Last Interaction:* ${telegramUser.lastInteraction ? telegramUser.lastInteraction.toLocaleString() : 'Never'}\n` +
      `*Registration Date:* ${telegramUser.createdAt ? telegramUser.createdAt.toLocaleString() : 'Unknown'}\n\n` +
      `*Account Status:* ${telegramUser.isActive ? '✅ Active' : '❌ Inactive'}\n` +
      `*Verification Status:* ${telegramUser.isVerified ? '✅ Verified' : '⏳ Pending'}\n\n` +
      `💡 *Need help?*\n` +
      `Use \`/help\` for command reference`;

    return await this.sendMessage(chatId, statusMessage);
  }

  // Handle /subscribe command
  async handleSubscribe(chatId, args, telegramUser) {
    if (!telegramUser) {
      return await this.sendMessage(
        chatId,
        `❌ You're not registered yet.\n\nUse \`/register <your-email>\` to get started.`
      );
    }

    if (!telegramUser.isVerified) {
      return await this.sendMessage(
        chatId,
        `❌ You need to complete registration first.\n\nPlease verify your account by replying with your verification code, or use \`/register <your-email>\` to start over.`
      );
    }

    if (args.length === 0) {
      const options = this.getSubscriptionOptions();
      const subscriptionList = Object.entries(options)
        .map(([num, option]) => `${num}. ${option.name} - ${option.description}`)
        .join('\n');
      // record transient menu so plain-number replies work
      try {
        const key = telegramUser && telegramUser.telegramId ? telegramUser.telegramId : `chat:${chatId}`;
        this.recentMenu.set(key, { menu: 'subscribe', ts: Date.now() });
      } catch (e) {
        // ignore
      }

      return await this.sendMessage(
        chatId,
        `📋 *Available Alert Subscriptions*\n\n${subscriptionList}\n\n` +
        `💡 *How to subscribe:*\n` +
        `• Type a number: \`/subscribe 1\` (for Admin Alerts)\n` +
        `• Or type the name: \`/subscribe energy_alerts\`\n\n` +
        `Example: \`/subscribe 4\` for Energy Alerts`
      );
    }

    const input = args[0];
    const subscription = this.parseSubscriptionInput(input);
    const options = this.getSubscriptionOptions();

    // Validate the subscription exists
    const validSubscriptions = Object.values(options).map(opt => opt.key);
    if (!validSubscriptions.includes(subscription)) {
      return await this.sendMessage(
        chatId,
        `❌ Invalid subscription option: "${input}"\n\nUse \`/subscribe\` to see available options.`
      );
    }

    // Find the option name for display
    const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === subscription);
    const optionName = optionEntry ? optionEntry[1].name : subscription;

    if (!telegramUser.roleSubscriptions.includes(subscription)) {
      telegramUser.roleSubscriptions.push(subscription);
      await telegramUser.save();

      return await this.sendMessage(
        chatId,
        `✅ *Successfully subscribed!*\n\n` +
        `📢 You are now subscribed to: *${optionName}*\n\n` +
        `You'll receive notifications for this alert type.`
      );
    } else {
      return await this.sendMessage(
        chatId,
        `ℹ️ *Already subscribed*\n\n` +
        `You are already subscribed to: *${optionName}*`
      );
    }
  }

  // Handle /unsubscribe command
  async handleUnsubscribe(chatId, args, telegramUser) {
    if (!telegramUser) {
      return await this.sendMessage(
        chatId,
        `❌ You're not registered yet.\n\nUse \`/register <your-email>\` to get started.`
      );
    }

    if (!telegramUser.isVerified) {
      return await this.sendMessage(
        chatId,
        `❌ You need to complete registration first.\n\nPlease verify your account by replying with your verification code, or use \`/register <your-email>\` to start over.`
      );
    }

    if (args.length === 0) {
      if (telegramUser.roleSubscriptions.length === 0) {
        return await this.sendMessage(
          chatId,
          `📋 *Your Current Subscriptions*\n\n` +
          `You are not subscribed to any alert types.\n\n` +
          `Use \`/subscribe\` to see available options.`
        );
      }

      const options = this.getSubscriptionOptions();
      const currentSubs = telegramUser.roleSubscriptions
        .map(sub => {
          const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === sub);
          return optionEntry ? `${optionEntry[0]}. ${optionEntry[1].name}` : sub;
        })
        .join('\n');
      // record recent menu for unsubscribe so plain-number replies work
      try {
        const key = telegramUser && telegramUser.telegramId ? telegramUser.telegramId : `chat:${chatId}`;
        this.recentMenu.set(key, { menu: 'unsubscribe', ts: Date.now() });
      } catch (e) {
        // ignore
      }

      return await this.sendMessage(
        chatId,
        `📋 *Your Current Subscriptions*\n\n${currentSubs}\n\n` +
        `💡 *How to unsubscribe:*\n` +
        `• Type a number: \`/unsubscribe 1\` (for Admin Alerts)\n` +
        `• Or type the name: \`/unsubscribe energy_alerts\`\n\n` +
        `Example: \`/unsubscribe 4\` to stop Energy Alerts`
      );
    }

    const input = args[0];
    const subscription = this.parseSubscriptionInput(input);
    const options = this.getSubscriptionOptions();

    // Find the option name for display
    const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === subscription);
    const optionName = optionEntry ? optionEntry[1].name : subscription;

    const index = telegramUser.roleSubscriptions.indexOf(subscription);

    if (index > -1) {
      telegramUser.roleSubscriptions.splice(index, 1);
      await telegramUser.save();

      return await this.sendMessage(
        chatId,
        `✅ *Successfully unsubscribed!*\n\n` +
        `🔕 You will no longer receive: *${optionName}*\n\n` +
        `Use \`/subscribe\` to manage other subscriptions.`
      );
    } else {
      return await this.sendMessage(
        chatId,
        `ℹ️ *Not subscribed*\n\n` +
        `You are not currently subscribed to: *${optionName}*`
      );
    }
  }

  // Handle /help command
  async handleHelp(chatId, args = [], telegramUser = null) {
    // If args provided, show specific help category
    if (args.length > 0) {
      const category = this.parseHelpCategoryInput(args[0]);
      return await this.handleHelpCategory(chatId, category);
    }

  // Show main help menu with numbered categories
    const options = this.getHelpCategoryOptions();
    const helpCategories = Object.entries(options)
      .map(([num, option]) => `${num}. ${option.name} - ${option.description}`)
      .join('\n');

  const helpMessage = `🤖 *IoT Classroom Bot Help*\n\n` +
      `*Quick Start:*\n` +
      `1. \`/register <your-email>\` - Register (admin/security only)\n` +
      `2. \`/subscribe 4\` - Subscribe to Energy Alerts\n` +
      `3. \`/devices 1\` - Check offline devices\n\n` +
      `*Help Categories:*\n${helpCategories}\n\n` +
      `💡 *How to get help:*\n` +
      `• Type a number: \`/help 1\` (for Getting Started)\n` +
      `• Or use: \`/help getting_started\`\n\n` +
      `*Popular Commands:*\n` +
      `• \`/status 3\` - Device status summary\n` +
      `• \`/devices 4\` - Full device status\n` +
      `• \`/subscribe 2\` - Security alerts\n` +
      `• \`/alert 1\` - Send security alert (admin/security only)\n\n` +
      `Example: \`/help 3\` for Device Management help`;

    // record transient menu so plain-number replies to help menu work
    try {
      const key = telegramUser && telegramUser.telegramId ? telegramUser.telegramId : `chat:${chatId}`;
      this.recentMenu.set(key, { menu: 'help', ts: Date.now() });
    } catch (e) {
      // ignore
    }

    return await this.sendMessage(chatId, helpMessage);
  }

  // Handle specific help categories
  async handleHelpCategory(chatId, category) {
    let helpMessage = '';

    switch (category) {
      case 'getting_started':
      case '1':
        helpMessage = `🚀 *Getting Started*\n\n` +
          `*Step 1: Register*\n` +
          `• Only administrators and security personnel can register\n` +
          `• Use: \`/register <your-email>\`\n` +
          `• Example: \`/register admin@university.edu\`\n\n` +
          `*Step 2: Verify*\n` +
          `• Bot sends 6-character verification code\n` +
          `• Reply with the code within 10 minutes\n\n` +
          `*Step 3: Subscribe*\n` +
          `• Use: \`/subscribe 4\` for Energy Alerts\n` +
          `• Use: \`/subscribe\` to see all options\n\n` +
          `*Step 4: Monitor*\n` +
          `• Use: \`/devices 1\` for offline devices\n` +
          `• Use: \`/status 3\` for device status\n\n` +
          `💡 *Tip:* All commands support numbers for easy use!`;
        break;

      case 'subscriptions':
      case '2':
        helpMessage = `📢 *Alert Subscriptions*\n\n` +
          `*Available Alert Types:*\n` +
          `1. Admin Alerts - All administrative alerts (admins only)\n` +
          `2. Security Alerts - Security-related notifications\n` +
          `3. Maintenance Alerts - Device maintenance alerts (admins only)\n` +
          `4. Energy Alerts - Energy conservation alerts\n` +
          `5. System Alerts - System health notifications (admins only)\n` +
          `6. User Alerts - User-related notifications (admins only)\n` +
          `7. After-Hours Lights - Alerts when lights are turned on after 5 PM\n\n` +
          `*Commands:*\n` +
          `• \`/subscribe\` - Show all available alerts\n` +
          `• \`/subscribe <number>\` - Subscribe to alert type\n` +
          `• \`/unsubscribe <number>\` - Unsubscribe from alert type\n` +
          `• \`/status 5\` - View your current subscriptions\n\n` +
          `*Examples:*\n` +
          `• \`/subscribe 4\` - Subscribe to Energy Alerts\n` +
          `• \`/subscribe 7\` - Subscribe to After-Hours Lights\n` +
          `• \`/unsubscribe 2\` - Stop Security Alerts\n\n` +
          `💡 *Role-based access:* Some alerts are admin-only`;
        break;

      case 'devices':
      case '3':
        helpMessage = `🔧 *Device Management*\n\n` +
          `*Device Query Options:*\n` +
          `1. Offline Devices - Show all offline devices\n` +
          `2. Online Devices - Show all online devices\n` +
          `3. All Devices - List all devices in system\n` +
          `4. Device Status Summary - Show online/offline counts\n` +
          `5. Devices by Classroom - List devices grouped by classroom\n` +
          `6. Maintenance Needed - Devices requiring maintenance\n\n` +
          `*Commands:*\n` +
          `• \`/devices\` - Show device query menu\n` +
          `• \`/devices <number>\` - Run specific query\n` +
          `• \`/status 3\` - Quick device status summary\n\n` +
          `*Natural Language:*\n` +
          `• "Show offline devices"\n` +
          `• "What's the status of Computer_Lab?"\n` +
          `• "Devices in LH_19g"\n\n` +
          `*Examples:*\n` +
          `• \`/devices 1\` - Show offline devices\n` +
          `• \`/devices 5\` - Devices by classroom\n\n` +
          `💡 *Quick check:* Use \`/devices 4\` for status summary`;
        break;

      case 'commands':
      case '4':
        helpMessage = `📋 *All Commands Reference*\n\n` +
          `*Registration:*\n` +
          `• \`/start\` - Welcome and registration info\n` +
          `• \`/register <email>\` - Register with system email\n\n` +
          `*Status & Info:*\n` +
          `• \`/status\` - Status menu (6 options)\n` +
          `• \`/status <number>\` - Specific status view\n\n` +
          `*Subscriptions:*\n` +
          `• \`/subscribe\` - Show alert options\n` +
          `• \`/subscribe <number>\` - Subscribe to alert\n` +
          `• \`/unsubscribe <number>\` - Unsubscribe from alert\n\n` +
          `*Device Management:*\n` +
          `• \`/devices\` - Device query menu\n` +
          `• \`/devices <number>\` - Specific device query\n\n` +
          `*Alert Management:*\n` +
          `• \`/alert\` - Show alert type options (admin/security only)\n` +
          `• \`/alert <number> <message>\` - Send manual alert\n\n` +
          `*Help:*\n` +
          `• \`/help\` - Main help menu\n` +
          `• \`/help <number>\` - Specific help category\n\n` +
          `💡 *Numbered Interface:* All commands support numbers!`;
        break;

      case 'troubleshooting':
      case '5':
        helpMessage = `🔧 *Troubleshooting*\n\n` +
          `*Common Issues:*\n\n` +
          `❌ "Not registered yet"\n` +
          `• Solution: Use \`/register <your-email>\`\n` +
          `• Check that your role is authorized (admin/security)\n\n` +
          `❌ "Invalid subscription option"\n` +
          `• Solution: Use \`/subscribe\` to see valid options\n` +
          `• Try using numbers: \`/subscribe 1\` instead of text\n\n` +
          `❌ "Device not found"\n` +
          `• Solution: Use \`/devices 3\` to list all devices\n` +
          `• Check spelling of device names\n\n` +
          `❌ "Webhook errors" or "polling conflicts"\n` +
          `• Solution: Bot automatically handles this\n` +
          `• May take a few seconds to reconnect\n\n` +
          `*Getting Help:*\n` +
          `• \`/help 1\` - Getting started guide\n` +
          `• \`/status 1\` - Check your registration\n` +
          `• Contact administrator for account issues\n\n` +
          `💡 *Bot Status:* Check with \`/status 2\` (System Status)`;
        break;

      case 'examples':
      case '6':
        helpMessage = `💡 *Usage Examples*\n\n` +
          `*Registration Flow:*\n` +
          `1. You: \`/register admin@university.edu\`\n` +
          `2. Bot: Sends verification code (e.g., "ABC123")\n` +
          `3. You: Reply with \`ABC123\`\n` +
          `4. Bot: ✅ Registration complete!\n\n` +
          `*Subscription Examples:*\n` +
          `• \`/subscribe 4\` → Subscribe to Energy Alerts\n` +
          `• \`/unsubscribe 2\` → Stop Security Alerts\n` +
          `• \`/status 5\` → View current subscriptions\n\n` +
          `*Device Monitoring:*\n` +
          `• \`/devices 1\` → Show offline devices\n` +
          `• \`/devices 4\` → Device status summary\n` +
          `• "How many devices are offline?" → Natural language\n\n` +
          `*Alert Management (Admin/Security only):*\n` +
          `• \`/alert 1\` → Show alert type options\n` +
          `• \`/alert 1 Suspicious activity in LH_19g\` → Send security alert\n` +
          `• \`/alert 2 System maintenance scheduled\` → Send admin alert\n\n` +
          `*Status Checks:*\n` +
          `• \`/status 3\` → Device status summary\n` +
          `• \`/status 2\` → System health overview\n` +
          `• \`/status 1\` → Your personal status\n\n` +
          `*Help System:*\n` +
          `• \`/help 3\` → Device management help\n` +
          `• \`/help 2\` → Subscription help\n\n` +
          `💡 *Pro Tip:* Use numbers everywhere for speed!`;
        break;

      default:
        helpMessage = `❌ Invalid help category.\n\nUse \`/help\` to see available numbered categories.`;
    }

    return await this.sendMessage(chatId, helpMessage);
  }

  // Process incoming webhook updates
  async processWebhookUpdate(update) {
    try {
      const { message } = update;

      // Deduplicate updates by update_id to avoid double-processing when polling conflicts occur
      const updateId = update.update_id;
      if (typeof updateId !== 'undefined') {
        if (this.recentUpdateIds.has(updateId)) {
          // Already processed this update recently
          return;
        }
        this.recentUpdateIds.set(updateId, Date.now());
      }

      if (this.debug) {
        try {
          console.debug('Telegram Debug - update', {
            update_id: update.update_id,
            message_id: message?.message_id,
            from_id: message?.from?.id,
            chat_id: message?.chat?.id,
            text: message?.text
          });
        } catch (dE) {
          console.debug('Telegram Debug - unable to log update details', dE && dE.message);
        }
      }

      if (!message || !message.chat) return;

      const telegramId = message.from.id.toString();
      const chatId = message.chat.id.toString();
      const text = message.text?.trim();

      if (!text) return;

      // Find or create telegram user record
      let telegramUser = await TelegramUser.findByTelegramId(telegramId);

      if (this.debug) {
        console.debug('Telegram Debug - lookup result', {
          telegramId,
          chatId,
          found: !!telegramUser,
          isVerified: telegramUser ? !!telegramUser.isVerified : undefined,
          messagesReceived: telegramUser ? telegramUser.messagesReceived : undefined
        });
      }

      // Update message count / last interaction (safe upsert)
      try {
        await this.updateMessageCount(telegramId);
      } catch (e) {
        console.warn('Failed to update message count for', telegramId, e && e.message);
      }

      // Allow numeric replies to select menu options if a menu was recently shown
      // Supports both single digits (1-9) and multi-digit numbers
      if (/^\d+$/.test(text)) {
        const menuKeyTel = telegramId;
        const menuKeyChat = `chat:${chatId}`;
        const menuInfo = this.recentMenu.get(menuKeyTel) || this.recentMenu.get(menuKeyChat);
        if (menuInfo && (Date.now() - menuInfo.ts) < 5 * 60 * 1000) { // 5 minutes
          // Clear the transient menu state
          this.recentMenu.delete(menuKeyTel);
          this.recentMenu.delete(menuKeyChat);

          switch (menuInfo.menu) {
            case 'status':
              return await this.handleStatus(chatId, [text], telegramUser);
            case 'help':
              return await this.handleHelp(chatId, [text], telegramUser);
            case 'subscribe':
              return await this.handleSubscribe(chatId, [text], telegramUser);
            case 'unsubscribe':
              return await this.handleUnsubscribe(chatId, [text], telegramUser);
            case 'devices':
              return await DeviceQueryService.handleDeviceQuery(chatId, this.parseDeviceQueryInput(text), this, telegramUser);
            case 'alert':
              // User is replying with alert type number after seeing menu
              return await this.sendMessage(
                chatId,
                `Please provide a message with your alert.\n\nUsage: \`/alert ${text} <message>\`\nExample: \`/alert ${text} Urgent notification\``
              );
            default:
              // Unknown recent menu, fall through to normal processing
              break;
          }
        }
      }

      // Handle verification codes (6-character alphanumeric)
      if (text.length === 6 && /^[A-Z0-9]+$/.test(text)) {
        return await this.handleVerification(telegramId, text);
      }

      // Handle commands
      if (text.startsWith('/')) {
        const parts = text.split(' ');
        const command = parts[0];
        const args = parts.slice(1);

  return await this.handleCommand(chatId, command, args, telegramUser, telegramId);
      }

      // Handle natural language queries about devices
      if (telegramUser && this.isDeviceQuery(text)) {
        return await DeviceQueryService.handleDeviceQuery(chatId, text, this, telegramUser);
      }

      // Handle unknown messages
      if (telegramUser) {
        if (!telegramUser.isVerified) {
          return await this.sendMessage(
            chatId,
            `You have a pending registration that needs verification.\n\n` +
            `Please reply with your 6-character verification code, or use \`/register <your-email>\` to check your status.\n\n` +
            `Use /help for more information.`
          );
        } else {
          return await this.sendMessage(
            chatId,
            `I didn't understand that command. Use /help to see available commands, or ask me questions like:\n\n` +
            `- "Show offline devices"\n` +
            `- "What's the status of Computer_Lab?"\n` +
            `- "Devices in LH_19g"`
          );
        }
      } else {
        return await this.sendMessage(
          chatId,
          `Please start by registering with /register <your-email> or use /help for more information.`
        );
      }

    } catch (error) {
      console.error('Error processing webhook update:', error);
    }
  }

  // Start polling for updates
  startPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Reset update ID when starting polling to avoid conflicts with webhook mode
    this.lastUpdateId = 0;
    console.log('Telegram polling started (reset update ID to 0)');

    // Poll every 30 seconds to reduce conflicts
    this.pollingInterval = setInterval(() => {
      this.pollUpdates().catch(error => {
        console.error('Error polling for updates:', error);
      });
    }, 30000);
  }

  // Stop polling
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('Telegram polling stopped');
    }
    if (this._recentPruneInterval) {
      clearInterval(this._recentPruneInterval);
      this._recentPruneInterval = null;
    }
  }

  // Poll for updates
  async pollUpdates() {
    try {
      const response = await axios.get(`${this.baseUrl}/getUpdates`, {
        params: {
          offset: this.lastUpdateId + 1,
          timeout: 30, // Long polling timeout
          allowed_updates: ['message', 'callback_query']
        }
      });

      if (response.data.ok && response.data.result.length > 0) {
        for (const update of response.data.result) {
          // Process each update
          await this.processWebhookUpdate(update);

          // Update last processed update ID
          if (update.update_id > this.lastUpdateId) {
            this.lastUpdateId = update.update_id;
          }
        }
      }
    } catch (error) {
      // Handle conflict errors (multiple bot instances)
      if (error.response?.status === 409 && error.response?.data?.description?.includes('terminated by other getUpdates request')) {
        console.log('Polling conflict detected - pausing polling for 30 seconds to resolve conflicts');
        // Stop polling temporarily to let other instances settle
        this.stopPolling();
        // Restart polling after a delay
        setTimeout(() => {
          console.log('Restarting polling after conflict resolution delay');
          this.startPolling();
        }, 30000); // 30 second delay
        return;
      }

      console.error('Error polling updates:', error.response?.data?.description || error.message);
    }
  }

  // Subscription options with user-friendly names
  getSubscriptionOptions() {
    return {
      1: { key: 'admin_alerts', name: 'Admin Alerts', description: 'All administrative alerts (admins only)' },
      2: { key: 'security_alerts', name: 'Security Alerts', description: 'Security-related notifications' },
      3: { key: 'maintenance_alerts', name: 'Maintenance Alerts', description: 'Device maintenance alerts (admins only)' },
      4: { key: 'energy_alerts', name: 'Energy Alerts', description: 'Energy conservation alerts' },
      5: { key: 'system_alerts', name: 'System Alerts', description: 'System health notifications (admins only)' },
      6: { key: 'user_alerts', name: 'User Alerts', description: 'User-related notifications (admins only)' },
      7: { key: 'switchesOnAfter5PM', name: 'After-Hours Lights', description: 'Alerts when lights are turned on after 5 PM' }
    };
  }

  // Device query options with user-friendly names
  getDeviceQueryOptions() {
    return {
      1: { key: 'offline', name: 'Offline Devices', description: 'Show all offline devices' },
      2: { key: 'online', name: 'Online Devices', description: 'Show all online devices' },
      3: { key: 'all', name: 'All Devices', description: 'List all devices in system' },
      4: { key: 'status', name: 'Device Status Summary', description: 'Show online/offline counts' },
      5: { key: 'classrooms', name: 'Devices by Classroom', description: 'List devices grouped by classroom' },
      6: { key: 'maintenance', name: 'Maintenance Needed', description: 'Devices requiring maintenance' }
    };
  }

  // Status view options with user-friendly names
  getStatusViewOptions() {
    return {
      1: { key: 'personal', name: 'My Status', description: 'Your registration and subscription info' },
      2: { key: 'system', name: 'System Status', description: 'Overall system health and statistics' },
      3: { key: 'devices', name: 'Device Status', description: 'Device online/offline summary' },
      4: { key: 'alerts', name: 'Alert Statistics', description: 'Recent alerts and notifications' },
      5: { key: 'subscriptions', name: 'My Subscriptions', description: 'Your current alert subscriptions' },
      6: { key: 'activity', name: 'Recent Activity', description: 'Your recent bot interactions' }
    };
  }

  // Help category options with user-friendly names
  getHelpCategoryOptions() {
    return {
      1: { key: 'getting_started', name: 'Getting Started', description: 'Registration and basic setup' },
      2: { key: 'subscriptions', name: 'Alert Subscriptions', description: 'Managing alert notifications' },
      3: { key: 'devices', name: 'Device Management', description: 'Device queries and monitoring' },
      4: { key: 'commands', name: 'All Commands', description: 'Complete command reference' },
      5: { key: 'troubleshooting', name: 'Troubleshooting', description: 'Common issues and solutions' },
      6: { key: 'examples', name: 'Usage Examples', description: 'Practical examples and tips' }
    };
  }

  // Alert type options for manual sending
  getAlertTypeOptions() {
    return {
      1: { key: 'security_alerts', name: 'Security Alert', description: 'Send security-related alert to security personnel' },
      2: { key: 'admin_alerts', name: 'Admin Alert', description: 'Send administrative alert to administrators' },
      3: { key: 'maintenance_alerts', name: 'Maintenance Alert', description: 'Send maintenance alert to administrators' },
      4: { key: 'system_alerts', name: 'System Alert', description: 'Send system health alert to administrators' },
      5: { key: 'energy_alerts', name: 'Energy Alert', description: 'Send energy conservation alert to all users' },
      6: { key: 'user_alerts', name: 'User Alert', description: 'Send user-related alert to administrators' }
    };
  }

  // Check if text is a device query
  isDeviceQuery(text) {
    const deviceQueryKeywords = [
      'show', 'list', 'get', 'find', 'check', 'status', 'offline', 'online', 'devices', 'device',
      'what\'s', 'whats', 'how many', 'are there', 'in', 'classroom', 'lab', 'room'
    ];

    const lowerText = text.toLowerCase();
    return deviceQueryKeywords.some(keyword => lowerText.includes(keyword));
  }

  // Convert user input (number or text) to subscription key
  parseSubscriptionInput(input) {
    const options = this.getSubscriptionOptions();

    // If input is a number, map it to the corresponding subscription
    const numInput = parseInt(input);
    if (!isNaN(numInput) && options[numInput]) {
      return options[numInput].key;
    }

    // Otherwise, treat as text input (for backward compatibility)
    return input.toLowerCase();
  }

  // Parse device query input (number or text)
  parseDeviceQueryInput(input) {
    const options = this.getDeviceQueryOptions();

    // If input is a number, map it to the corresponding query
    const numInput = parseInt(input);
    if (!isNaN(numInput) && options[numInput]) {
      return options[numInput].key;
    }

    // Otherwise, treat as text input (for backward compatibility)
    return input.toLowerCase();
  }

  // Parse status view input (number or text)
  parseStatusViewInput(input) {
    const options = this.getStatusViewOptions();

    // If input is a number, map it to the corresponding view
    const numInput = parseInt(input);
    if (!isNaN(numInput) && options[numInput]) {
      return options[numInput].key;
    }

    // Otherwise, treat as text input (for backward compatibility)
    return input.toLowerCase();
  }

  // Parse help category input (number or text)
  parseHelpCategoryInput(input) {
    const options = this.getHelpCategoryOptions();

    // If input is a number, map it to the corresponding category
    const numInput = parseInt(input);
    if (!isNaN(numInput) && options[numInput]) {
      return options[numInput].key;
    }

    // Otherwise, treat as text input (for backward compatibility)
    return input.toLowerCase();
  }

  // Parse alert type input (number or text)
  parseAlertTypeInput(input) {
    const options = this.getAlertTypeOptions();

    // If input is a number, map it to the corresponding alert type
    const numInput = parseInt(input);
    if (!isNaN(numInput) && options[numInput]) {
      return options[numInput].key;
    }

    // Otherwise, treat as text input (for backward compatibility)
    return input.toLowerCase();
  }

  // Handle /alert command for sending manual alerts
  async handleSendAlert(chatId, args, telegramUser) {
    if (!telegramUser) {
      return await this.sendMessage(
        chatId,
        `❌ You're not registered yet.\n\nUse \`/register <your-email>\` to get started.`
      );
    }

    if (!telegramUser.isVerified) {
      return await this.sendMessage(
        chatId,
        `❌ You need to complete registration first.\n\nPlease verify your account by replying with your verification code, or use \`/register <your-email>\` to start over.`
      );
    }

    // Check if user has permission to send alerts (admins and security only)
    await telegramUser.populate('user');
    const allowedRoles = ['super-admin', 'dean', 'hod', 'admin', 'security'];
    if (!allowedRoles.includes(telegramUser.user.role)) {
      return await this.sendMessage(
        chatId,
        `❌ You don't have permission to send alerts.\n\nOnly administrators and security personnel can send manual alerts.`
      );
    }

    // If no args provided, show alert type menu
    if (args.length === 0) {
      const options = this.getAlertTypeOptions();
      const alertList = Object.entries(options)
        .map(([num, option]) => `${num}. ${option.name} - ${option.description}`)
        .join('\n');

      // record transient menu so plain-number replies work
      try {
        const key = telegramUser && telegramUser.telegramId ? telegramUser.telegramId : `chat:${chatId}`;
        this.recentMenu.set(key, { menu: 'alert', ts: Date.now() });
      } catch (e) {
        // ignore
      }

      return await this.sendMessage(
        chatId,
        `🚨 *Send Manual Alert*\n\n${alertList}\n\n` +
        `💡 *How to send an alert:*\n` +
        `• Type a number with message: \`/alert 1 Your message\`\n` +
        `• Or type the name: \`/alert security_alerts Your message\`\n\n` +
        `⚠️ *Important:* You must provide a message with the alert!\n` +
        `Example: \`/alert 1 Suspicious activity detected in LH_19g\``
      );
    }

    // Need at least alert type and message
    if (args.length < 2) {
      return await this.sendMessage(
        chatId,
        `❌ Please provide both alert type and message.\n\nUsage: \`/alert <type> <message>\`\nExample: \`/alert 1 Suspicious activity detected\``
      );
    }

    const alertTypeInput = args[0];
    const alertMessage = args.slice(1).join(' ');

    const alertType = this.parseAlertTypeInput(alertTypeInput);
    const options = this.getAlertTypeOptions();

    // Validate the alert type exists
    const validAlertTypes = Object.values(options).map(opt => opt.key);
    if (!validAlertTypes.includes(alertType)) {
      return await this.sendMessage(
        chatId,
        `❌ Invalid alert type: "${alertTypeInput}"\n\nUse \`/alert\` to see available alert types.`
      );
    }

    // Find the option name for display
    const optionEntry = Object.entries(options).find(([num, opt]) => opt.key === alertType);
    const alertName = optionEntry ? optionEntry[1].name : alertType;

    try {
      // Create alert data
      const alertData = {
        alertname: `Manual ${alertName}`,
        summary: alertMessage,
        description: `Manual alert sent by ${telegramUser.user.name} (${telegramUser.user.role})`,
        severity: 'warning',
        instance: 'telegram_bot',
        value: new Date().toISOString()
      };

      // Send the alert
      const results = await this.sendAlert(alertType, alertData);

      // Count successful sends
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;

      return await this.sendMessage(
        chatId,
        `✅ *Alert Sent Successfully!*\n\n` +
        `📢 *Alert Type:* ${alertName}\n` +
        `📝 *Message:* ${alertMessage}\n` +
        `👥 *Recipients:* ${successCount}/${totalCount} users notified\n\n` +
        `*Sent by:* ${telegramUser.user.name}\n` +
        `*Time:* ${new Date().toLocaleString()}`
      );

    } catch (error) {
      console.error('Error sending manual alert:', error);
      return await this.sendMessage(
        chatId,
        `❌ Failed to send alert. Please try again later.`
      );
    }
  }
}

module.exports = new TelegramService();
