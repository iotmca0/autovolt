const express = require('express');
const router = express.Router();
const { forwardChat } = require('../services/aiService');
const { auth } = require('../middleware/auth');
const { logger } = require('../middleware/logger');

// @route   POST api/ai/chat
// @desc    Send a message to the conversational AI and get a response
// @access  Private
router.post('/chat', auth, async (req, res) => {
  const { text, conversation_history } = req.body;
  const userId = req.user.id;

  if (!text) {
    return res.status(400).json({ msg: 'Message text is required' });
  }

  try {
    // Forward the chat to the Python AI service
    const aiResponse = await forwardChat(text, conversation_history, userId);

    // Check if the AI returned a specific action to perform
    if (aiResponse.action && aiResponse.action.type) {
      logger.info(`AI returned action: ${JSON.stringify(aiResponse.action)}`);
      
      // We have an action, now we need to execute it.
      // We can reuse the logic from deviceController or a service.
      // This is a simplified handler. You would need a robust way to map AI actions to your system's capabilities.
      try {
        // This is a placeholder for a more robust action handler.
        // We'll try to map the AI action to our existing device control logic.
        const actionResult = await handleAiAction(aiResponse.action, req.user);
        
        // Append the result of the action to the AI's conversational response
        aiResponse.response_text += ` ${actionResult.message}`;

      } catch (actionError) {
        logger.error(`Error executing AI action: ${actionError.message}`);
        // Inform the user that the action failed but still return the conversational part.
        aiResponse.response_text += ` I tried to perform the action, but something went wrong: ${actionError.message}.`;
      }
    }

    res.json(aiResponse);

  } catch (error) {
    logger.error('Error in AI chat route:', error.message);
    res.status(500).send('Server Error');
  }
});

/**
 * A helper function to map AI actions to controller logic.
 * This is a critical integration point.
 * @param {object} action - The action object from the AI service.
 * @param {object} user - The authenticated user object.
 */
const handleAiAction = async (action, user) => {
    const { type, device, location, state } = action;

    // A more sophisticated implementation would query the DB for the device
    // based on the natural language device and location.
    // For now, we'll assume a simple mapping and pass it to a handler.
    
    // This requires a function like `handleDeviceAction` to be adapted or a new one created
    // that can find devices by name/location and perform actions.
    // Let's assume we have a function that can take this action object.
    // We will need to create or modify `deviceController.js` to have a function that can be called here.
    
    // For now, let's just log it and return a success message.
    // This part needs to be implemented properly.
    logger.info(`Attempting to execute action: type=${type}, device=${device}, location=${location}, state=${state}`);

    // In a real implementation, you would call a service here:
    // const result = await deviceControlService.executeAction({ type, device, location, user });
    // For the purpose of this example, we'll simulate a successful action.
    
    // This is a placeholder for the actual implementation.
    // You would need to find the device's MAC address and switch index here.
    // For example:
    // const targetDevice = await Device.findOne({ name: new RegExp(device, 'i'), 'classroom.name': new RegExp(location, 'i') });
    // if (!targetDevice) {
    //   throw new Error(`I couldn't find a device named '${device}' in '${location}'.`);
    // }
    // ... then find the switch and call MQTT service.

    return { success: true, message: `Okay, I've processed the request to ${type} the ${device}.` };
};


module.exports = router;
