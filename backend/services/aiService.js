const axios = require('axios');
const Device = require('../models/Device');
const Classroom = require('../models/Classroom');
const { logger } = require('../middleware/logger');

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8003';

/**
 * Synchronizes devices and classrooms with the AI service.
 * This allows the AI to know which entities it can control.
 */
const synchronizeEntities = async () => {
  try {
    const devices = await Device.find().select('name deviceType');
    const classrooms = await Classroom.find().select('name');

    const deviceNames = devices.map(d => d.name);
    // Also include generic device types like "light", "fan", "projector"
    const deviceTypes = [...new Set(devices.map(d => d.deviceType))];
    const allDeviceEntities = [...new Set([...deviceNames, ...deviceTypes])];

    const locationNames = classrooms.map(c => c.name);

    await axios.post(`${AI_SERVICE_URL}/ai/update-entities`, {
      devices: allDeviceEntities,
      locations: locationNames,
    });

    logger.info(`Successfully synchronized ${allDeviceEntities.length} device entities and ${locationNames.length} locations with AI service.`);
  } catch (error) {
    logger.error('Failed to synchronize entities with AI service:', error.message);
    if (error.response) {
      logger.error('AI service response:', error.response.data);
    }
  }
};

/**
 * Forwards a chat message to the conversational AI service.
 * @param {string} text The user's message.
 * @param {Array} conversation_history The history of the conversation.
 * @param {string} userId A unique identifier for the user.
 * @returns {Promise<Object>} The AI's response.
 */
const forwardChat = async (text, conversation_history = [], userId = 'default_user') => {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/ai/conversational-chat`, {
      text,
      conversation_history,
      user_id: userId,
    });
    return response.data;
  } catch (error) {
    logger.error('Error forwarding chat to AI service:', error.message);
    if (error.response) {
      logger.error('AI service response:', error.response.data);
    }
    // Provide a fallback response
    return {
      response_text: "I'm sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.",
      action: null,
      conversation_history: [
        ...conversation_history,
        { role: 'user', content: text },
        { role: 'assistant', content: "I'm sorry, I'm having trouble connecting to my brain right now. Please try again in a moment." }
      ],
      timestamp: new Date().toISOString(),
    };
  }
};

module.exports = {
  synchronizeEntities,
  forwardChat,
};
