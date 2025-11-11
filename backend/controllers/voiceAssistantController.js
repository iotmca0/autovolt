const Device = require('../models/Device');
const Fuse = require('fuse.js');
const { logger } = require('../middleware/logger');

const userVoiceContextStore = new Map();
const bulkConfirmationStore = new Map();
const BULK_CONFIRMATION_TTL = 60 * 1000; // 60 seconds to confirm bulk commands

const NUMBER_WORDS = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10'
};

const ACTION_SYNONYMS = {
  on: ['turn on', 'switch on', 'power on', 'enable', 'start', 'open', 'activate'],
  off: ['turn off', 'switch off', 'power off', 'disable', 'stop', 'close', 'deactivate', 'shut down'],
  toggle: ['toggle', 'flip', 'change', 'invert'],
  status: ['status', 'state', 'is', "what's", 'condition', 'check', 'are', 'show']
};

const FILLER_WORDS = new Set([
  'please', 'the', 'a', 'an', 'to', 'for', 'me', 'now', 'quickly', 'kindly', 'could', 'would', 'you', 'just',
  'in', 'at', 'on', 'hall', 'block', 'building', 'level'
]);

const SWITCH_TYPE_KEYWORDS = {
  light: ['light', 'lights', 'tube', 'bulb', 'lamp', 'lantern'],
  fan: ['fan', 'fans'],
  projector: ['projector', 'screen'],
  ac: ['ac', 'a c', 'aircon', 'aircon', 'air-conditioner', 'air conditioner', 'cooler'],
  outlet: ['socket', 'plug', 'outlet', 'power point'],
  heater: ['heater', 'heaters'],
  pump: ['pump', 'pumps']
};

function escapeRegExp(value) {
  if (!value) return '';
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getUserId(user) {
  if (!user) return null;
  return user._id?.toString?.() ?? user.id ?? null;
}

function getUserVoiceContext(userId) {
  if (!userId) return null;
  return userVoiceContextStore.get(userId) || null;
}

function setUserVoiceContext(userId, context) {
  if (!userId) return;
  const existing = userVoiceContextStore.get(userId) || {};
  userVoiceContextStore.set(userId, { ...existing, ...context, updatedAt: Date.now() });
}

function clearUserVoiceContext(userId) {
  if (!userId) return;
  userVoiceContextStore.delete(userId);
}

function getPendingConfirmation(userId) {
  if (!userId) return null;
  const pending = bulkConfirmationStore.get(userId);
  if (!pending) return null;
  if (pending.expiresAt && pending.expiresAt < Date.now()) {
    bulkConfirmationStore.delete(userId);
    return null;
  }
  return pending;
}

function setPendingConfirmation(userId, payload) {
  if (!userId) return null;
  const record = {
    ...payload,
    createdAt: Date.now(),
    expiresAt: payload?.expiresAt ?? Date.now() + BULK_CONFIRMATION_TTL
  };
  bulkConfirmationStore.set(userId, record);
  return record;
}

function clearPendingConfirmation(userId) {
  if (!userId) return;
  bulkConfirmationStore.delete(userId);
}

function normalizeSpeechText(text) {
  let normalized = text.trim().toLowerCase();
  Object.entries(NUMBER_WORDS).forEach(([word, digit]) => {
    const re = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(re, digit);
  });
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function detectAction(command) {
  const order = ['on', 'off', 'toggle', 'status'];
  for (const action of order) {
    for (const synonym of ACTION_SYNONYMS[action]) {
      if (command.includes(synonym)) {
        return action;
      }
    }
  }

  if (/\bstatus\b|\bstate\b|\bhow\b|\bar\b|\bis\b/.test(command)) {
    return 'status';
  }

  return null;
}

function extractRoomPhrase(command) {
  const roomMatch = command.match(/(?:in|at|inside|within)\s+([a-z0-9\-\s]+)/);
  if (roomMatch) {
    return roomMatch[1].replace(/\b(classroom|room|block|building)\b/g, '').trim();
  }
  return null;
}

function extractSwitchHints(command) {
  const hints = {
    number: null,
    type: null,
    raw: null,
    isPlural: /\b(all|every|entire|whole)\b/.test(command)
  };

  const switchMatch = command.match(/(?:switch|relay|line|channel)\s*([0-9a-z]+)/);
  if (switchMatch) {
    let value = switchMatch[1];
    if (NUMBER_WORDS[value]) {
      value = NUMBER_WORDS[value];
    }
    hints.number = value;
    hints.raw = hints.raw || value;
  }

  for (const [type, keywords] of Object.entries(SWITCH_TYPE_KEYWORDS)) {
    const match = keywords.find((keyword) => command.includes(keyword));
    if (match) {
      hints.type = type;
      hints.raw = hints.raw || match;
      if (match.endsWith('s') || command.includes(`${match}s`)) {
        hints.isPlural = true;
      }
      break;
    }
  }

  return hints;
}

function detectScope(command, switchHints) {
  if (/\b(all|every|entire|whole|everything|everyone)\b/.test(command)) {
    return 'all';
  }

  if (switchHints?.isPlural) {
    return 'all';
  }

  return 'single';
}

function removeFillerWords(phrase) {
  if (!phrase) return '';
  return phrase
    .split(' ')
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(' ')
    .trim();
}

function interpretVoiceCommand(rawCommand) {
  const normalized = normalizeSpeechText(rawCommand);
  
  // Check for batch commands (separated by "and", "then", "also", "plus")
  const batchSeparators = /\b(and|then|also|plus|after that|next)\b/gi;
  const hasMultipleCommands = batchSeparators.test(normalized);
  
  if (hasMultipleCommands) {
    // Split into multiple commands
    const commands = normalized.split(batchSeparators).filter(cmd => {
      const trimmed = cmd.trim();
      return trimmed.length > 0 && !/^(and|then|also|plus|after that|next)$/i.test(trimmed);
    });
    
    if (commands.length > 1) {
      return {
        success: true,
        isBatch: true,
        batchCommands: commands.map(cmd => interpretVoiceCommand(cmd)),
        raw: rawCommand.trim(),
        normalized
      };
    }
  }
  
  const confirmationOnlyPattern = /^(yes|yeah|yup|sure|ok|okay|alright|confirm|go ahead|do it|please do|that is correct|correct|make it so|proceed)(?:\s+(now|please))?$/;
  const isConfirmation = confirmationOnlyPattern.test(normalized);
  const usesPronoun = /\b(it|them|those|that|same|this|these|there|here)\b/.test(normalized);
  const action = detectAction(normalized);

  if (!action && !isConfirmation) {
    return {
      success: false,
      reason: 'unknown_action',
      message: 'Could not understand the action. Try saying "turn on the lab projector" or "check lights status".',
      normalized,
      raw: rawCommand.trim()
    };
  }

  const roomPhrase = extractRoomPhrase(normalized);
  const switchHints = extractSwitchHints(normalized);
  const scope = detectScope(normalized, switchHints);

  let commandForDevice = normalized;
  // Trim action synonyms from phrase
  Object.values(ACTION_SYNONYMS).flat().forEach((synonym) => {
    commandForDevice = commandForDevice.replace(synonym, ' ');
  });
  commandForDevice = commandForDevice.replace(/(?:turn|switch|power|please|kindly|could|would|you|on|off|toggle|status|state|check)/g, ' ');
  if (roomPhrase) {
    commandForDevice = commandForDevice.replace(roomPhrase, ' ');
  }
  if (switchHints.raw) {
    commandForDevice = commandForDevice.replace(new RegExp(`\b${escapeRegExp(switchHints.raw)}\b`, 'g'), ' ');
  }

  const devicePhrase = removeFillerWords(commandForDevice) || null;

  return {
    success: true,
    action,
    devicePhrase,
    roomPhrase,
    switchHints,
    scope,
    normalized,
    raw: rawCommand.trim(),
    usesPronoun,
    isConfirmation,
    isFollowUpCandidate: usesPronoun || !devicePhrase
  };
}

function upsertFuse(list, keys) {
  return new Fuse(list, {
    keys,
    includeScore: true,
    threshold: 0.4,
    distance: 100,
    ignoreLocation: true
  });
}

// Google Assistant Smart Home Handlers
async function handleGoogleAssistantRequest(inputs, requestId) {
  const responses = [];

  for (const input of inputs) {
    const { intent } = input;

    switch (intent) {
      case 'action.devices.SYNC':
        responses.push(await handleGoogleSync(requestId));
        break;

      case 'action.devices.QUERY':
        responses.push(await handleGoogleQuery(input.payload, requestId));
        break;

      case 'action.devices.EXECUTE':
        responses.push(await handleGoogleExecute(input.payload, requestId));
        break;

      default:
        responses.push({
          requestId,
          payload: {
            errorCode: 'PROTOCOL_ERROR',
            debugString: `Unsupported intent: ${intent}`
          }
        });
    }
  }

  return {
    requestId,
    payload: {
      commands: responses
    }
  };
}

async function handleGoogleSync(requestId) {
  try {
    // Get all devices for sync
    const devices = await Device.find({ status: 'online' });

    const deviceConfigs = devices.flatMap(device =>
      device.switches.map(switchInfo => ({
        id: `${device._id}_${switchInfo._id}`,
        type: getGoogleDeviceType(switchInfo.type),
        traits: ['action.devices.traits.OnOff'],
        name: {
          name: `${device.name} ${switchInfo.name}`,
          defaultNames: [`${device.location} ${switchInfo.name}`],
          nicknames: [`${device.classroom} ${switchInfo.name}`]
        },
        deviceInfo: {
          manufacturer: 'AutoVolt IoT',
          model: device.deviceType,
          hwVersion: '1.0',
          swVersion: '1.0'
        },
        attributes: {},
        willReportState: true
      }))
    );

    return {
      ids: deviceConfigs.map(d => d.id),
      status: 'SUCCESS',
      states: {}
    };
  } catch (error) {
    logger.error('[Google Assistant] Sync error:', error);
    return {
      requestId,
      payload: {
        errorCode: 'DEVICE_NOT_FOUND',
        debugString: error.message
      }
    };
  }
}

async function handleGoogleQuery(payload, requestId) {
  try {
    const { devices: deviceQueries } = payload;
    const deviceStates = {};

    for (const deviceQuery of deviceQueries) {
      const [deviceId, switchId] = deviceQuery.id.split('_');
      const device = await Device.findById(deviceId);

      if (device) {
        const switchData = device.switches.id(switchId);
        if (switchData) {
          deviceStates[deviceQuery.id] = {
            online: device.status === 'online',
            on: switchData.state
          };
        }
      }
    }

    return {
      status: 'SUCCESS',
      states: deviceStates
    };
  } catch (error) {
    logger.error('[Google Assistant] Query error:', error);
    return {
      requestId,
      payload: {
        errorCode: 'DEVICE_NOT_FOUND',
        debugString: error.message
      }
    };
  }
}

async function handleGoogleExecute(payload, requestId) {
  try {
    const { commands } = payload;
    const commandResults = [];

    for (const command of commands) {
      const { execution } = command;

      for (const exec of execution) {
        if (exec.command === 'action.devices.commands.OnOff') {
          const { params } = exec;

          for (const deviceId of command.devices.ids) {
            const [devId, switchId] = deviceId.split('_');

            // Use existing toggleSwitch logic
            const result = await toggleDeviceSwitch(devId, switchId, params.on);

            commandResults.push({
              ids: [deviceId],
              status: result.success ? 'SUCCESS' : 'ERROR',
              states: {
                online: true,
                on: params.on
              }
            });
          }
        }
      }
    }

    return {
      commands: commandResults
    };
  } catch (error) {
    logger.error('[Google Assistant] Execute error:', error);
    return {
      requestId,
      payload: {
        errorCode: 'DEVICE_NOT_FOUND',
        debugString: error.message
      }
    };
  }
}

// Alexa Smart Home Handlers
async function handleAlexaRequest(directive) {
  const { header, endpoint, payload } = directive;
  const { namespace, name } = header;

  switch (namespace) {
    case 'Alexa.Discovery':
      return await handleAlexaDiscovery(header);

    case 'Alexa.PowerController':
      return await handleAlexaPowerControl(header, endpoint, payload);

    case 'Alexa':
      if (name === 'ReportState') {
        return await handleAlexaReportState(header, endpoint);
      }
      break;
  }

  return {
    event: {
      header: {
        namespace: 'Alexa',
        name: 'ErrorResponse',
        messageId: header.messageId,
        correlationToken: header.correlationToken,
        payloadVersion: '3'
      },
      endpoint: {
        endpointId: endpoint.endpointId
      },
      payload: {
        type: 'INVALID_DIRECTIVE',
        message: 'Unsupported directive'
      }
    }
  };
}

async function handleAlexaDiscovery(header) {
  try {
    const devices = await Device.find({ status: 'online' });

    const endpoints = devices.flatMap(device =>
      device.switches.map(switchInfo => ({
        endpointId: `${device._id}_${switchInfo._id}`,
        manufacturerName: 'AutoVolt IoT',
        friendlyName: `${device.name} ${switchInfo.name}`,
        description: `${device.location} ${switchInfo.name}`,
        displayCategories: ['SWITCH'],
        capabilities: [
          {
            type: 'AlexaInterface',
            interface: 'Alexa.PowerController',
            version: '3',
            properties: {
              supported: [{ name: 'powerState' }],
              proactivelyReported: true,
              retrievable: true
            }
          },
          {
            type: 'AlexaInterface',
            interface: 'Alexa.EndpointHealth',
            version: '3',
            properties: {
              supported: [{ name: 'connectivity' }],
              proactivelyReported: true,
              retrievable: true
            }
          }
        ]
      }))
    );

    return {
      event: {
        header: {
          namespace: 'Alexa.Discovery',
          name: 'Discover.Response',
          messageId: header.messageId,
          payloadVersion: '3'
        },
        payload: {
          endpoints
        }
      }
    };
  } catch (error) {
    logger.error('[Alexa] Discovery error:', error);
    return {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'ErrorResponse',
          messageId: header.messageId,
          payloadVersion: '3'
        },
        payload: {
          type: 'INTERNAL_ERROR',
          message: error.message
        }
      }
    };
  }
}

async function handleAlexaPowerControl(header, endpoint, payload) {
  try {
    const [deviceId, switchId] = endpoint.endpointId.split('_');
    const newState = payload.powerState === 'ON';

    const result = await toggleDeviceSwitch(deviceId, switchId, newState);

    return {
      context: {
        properties: [
          {
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: newState ? 'ON' : 'OFF',
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          },
          {
            namespace: 'Alexa.EndpointHealth',
            name: 'connectivity',
            value: {
              value: 'OK'
            },
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          }
        ]
      },
      event: {
        header: {
          namespace: 'Alexa',
          name: 'Response',
          messageId: header.messageId,
          correlationToken: header.correlationToken,
          payloadVersion: '3'
        },
        endpoint: {
          endpointId: endpoint.endpointId
        },
        payload: {}
      }
    };
  } catch (error) {
    logger.error('[Alexa] Power control error:', error);
    return {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'ErrorResponse',
          messageId: header.messageId,
          correlationToken: header.correlationToken,
          payloadVersion: '3'
        },
        endpoint: {
          endpointId: endpoint.endpointId
        },
        payload: {
          type: 'INTERNAL_ERROR',
          message: error.message
        }
      }
    };
  }
}

async function handleAlexaReportState(header, endpoint) {
  try {
    const [deviceId, switchId] = endpoint.endpointId.split('_');
    const device = await Device.findById(deviceId);

    if (!device) {
      throw new Error('Device not found');
    }

    const switchData = device.switches.id(switchId);
    if (!switchData) {
      throw new Error('Switch not found');
    }

    return {
      context: {
        properties: [
          {
            namespace: 'Alexa.PowerController',
            name: 'powerState',
            value: switchData.state ? 'ON' : 'OFF',
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          },
          {
            namespace: 'Alexa.EndpointHealth',
            name: 'connectivity',
            value: {
              value: device.status === 'online' ? 'OK' : 'UNREACHABLE'
            },
            timeOfSample: new Date().toISOString(),
            uncertaintyInMilliseconds: 500
          }
        ]
      },
      event: {
        header: {
          namespace: 'Alexa',
          name: 'StateReport',
          messageId: header.messageId,
          correlationToken: header.correlationToken,
          payloadVersion: '3'
        },
        endpoint: {
          endpointId: endpoint.endpointId
        },
        payload: {}
      }
    };
  } catch (error) {
    logger.error('[Alexa] Report state error:', error);
    return {
      event: {
        header: {
          namespace: 'Alexa',
          name: 'ErrorResponse',
          messageId: header.messageId,
          correlationToken: header.correlationToken,
          payloadVersion: '3'
        },
        endpoint: {
          endpointId: endpoint.endpointId
        },
        payload: {
          type: 'INTERNAL_ERROR',
          message: error.message
        }
      }
    };
  }
}

// Siri/HomeKit Handlers
async function handleSiriRequest(intent, deviceId, command, parameters) {
  try {
    switch (intent) {
      case 'turn_on':
      case 'turn_off':
        const [devId, switchId] = deviceId.split('_');
        const state = intent === 'turn_on';
        const result = await toggleDeviceSwitch(devId, switchId, state);
        return {
          success: result.success,
          state: state,
          deviceId,
          message: result.message
        };

      case 'get_status':
        const device = await Device.findById(deviceId);
        if (!device) {
          return { success: false, error: 'Device not found' };
        }

        return {
          success: true,
          online: device.status === 'online',
          switches: device.switches.map(sw => ({
            id: sw._id,
            name: sw.name,
            state: sw.state
          }))
        };

      default:
        return { success: false, error: 'Unsupported intent' };
    }
  } catch (error) {
    logger.error('[Siri] Request error:', error);
    return { success: false, error: error.message };
  }
}

// Voice Command Processing
async function processVoiceCommand(command, deviceName, switchName, user) {
  try {
    const interpretation = interpretVoiceCommand(command);

    if (!interpretation.success) {
      return {
        success: false,
        message: interpretation.message,
        actionType: 'unrecognized',
        context: {
          normalized: interpretation.normalized || normalizeSpeechText(command),
          reason: interpretation.reason,
          raw: interpretation.raw || command
        }
      };
    }
    
    // Handle batch commands
    if (interpretation.isBatch && interpretation.batchCommands) {
      logger.info(`[Voice Command] Processing batch: ${interpretation.batchCommands.length} commands`);
      
      const results = [];
      let allSuccess = true;
      
      for (const subCommand of interpretation.batchCommands) {
        if (!subCommand.success) {
          results.push({
            success: false,
            message: subCommand.message || 'Failed to parse command',
            command: subCommand.raw
          });
          allSuccess = false;
          continue;
        }
        
        // Process each command individually
        const result = await processVoiceCommand(subCommand.raw, null, null, user);
        results.push({
          ...result,
          command: subCommand.raw
        });
        
        if (!result.success) {
          allSuccess = false;
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      return {
        success: allSuccess,
        isBatch: true,
        message: allSuccess 
          ? `Successfully executed all ${totalCount} commands` 
          : `Executed ${successCount} out of ${totalCount} commands`,
        actionType: 'batch',
        results,
        context: {
          totalCommands: totalCount,
          successfulCommands: successCount,
          raw: interpretation.raw
        }
      };
    }

    const userId = getUserId(user);
    const userContext = getUserVoiceContext(userId);
    const contextNotes = {};

    if (interpretation.isConfirmation) {
      if (!userId) {
        return {
          success: false,
          message: 'I need your signed-in session to confirm that.',
          actionType: 'confirmation_failed',
          context: {
            interpretation,
            reason: 'missing_user_session'
          }
        };
      }

      const pending = getPendingConfirmation(userId);
      if (!pending) {
        return {
          success: false,
          message: 'There are no pending bulk actions to confirm.',
          actionType: 'confirmation_missing',
          context: {
            interpretation,
            reason: 'no_pending_confirmation'
          }
        };
      }

      // Verify user still has access to all devices in pending operations
      const devicesToVerify = new Set(pending.operations?.map(op => op.deviceId).filter(Boolean) || []);
      for (const deviceId of devicesToVerify) {
        try {
          const device = await Device.findById(deviceId).lean();
          if (device && !checkUserDeviceAccess(user, device)) {
            clearPendingConfirmation(userId);
            return {
              success: false,
              message: 'You no longer have access to one or more devices in this operation.',
              actionType: 'permission_denied',
              context: {
                interpretation,
                reason: 'access_revoked'
              }
            };
          }
        } catch (err) {
          logger.error('[Voice Command] Error verifying device access:', err);
        }
      }

      const appliedOperations = [];
      for (const plan of pending.operations || []) {
        const toggleResult = await toggleDeviceSwitch(plan.deviceId, plan.switchId, plan.desiredState);
        appliedOperations.push({
          ...plan,
          success: toggleResult.success,
          message: toggleResult.message,
          error: toggleResult.success ? undefined : toggleResult.message
        });
      }

      clearPendingConfirmation(userId);

      const successOps = appliedOperations.filter((op) => op.success);
      const failedOps = appliedOperations.filter((op) => !op.success);
      const summary = successOps.length ? summarizeSuccessfulOperations(successOps, pending.interpretation || interpretation) : null;
      const message = failedOps.length
        ? [summary, `${failedOps.length} failed: ${failedOps[0].message}`].filter(Boolean).join('. ')
        : (summary || 'Done.');

      if (userId && successOps.length) {
        const distinctDeviceIds = Array.from(new Set(successOps.map((op) => op.device?.id).filter(Boolean)));
        setUserVoiceContext(userId, {
          lastDeviceId: distinctDeviceIds.length === 1 ? distinctDeviceIds[0] : null,
          lastSwitchIds: successOps.map((op) => op.switch?.id).filter(Boolean),
          lastRoom: successOps[0]?.device?.classroom || successOps[0]?.device?.location || null,
          lastAction: pending.interpretation?.action || interpretation.action,
          lastCommand: pending.command || interpretation.raw
        });
      }

      const confirmationInterpretation = {
        normalized: pending.interpretation?.normalized ?? interpretation.normalized,
        devicePhrase: pending.interpretation?.devicePhrase ?? interpretation.devicePhrase,
        roomPhrase: pending.interpretation?.roomPhrase ?? interpretation.roomPhrase,
        switchHints: pending.interpretation?.switchHints ?? interpretation.switchHints,
        scope: pending.interpretation?.scope ?? interpretation.scope,
        action: pending.interpretation?.action ?? interpretation.action,
        confirmed: true
      };

      return {
        success: failedOps.length === 0,
        message,
        operations: appliedOperations,
        device: successOps[0]?.device || null,
        switch: successOps[0]?.switch || null,
        actionType: appliedOperations.length > 1
          ? (failedOps.length ? 'bulk_partial' : 'bulk')
          : (appliedOperations[0]?.actionType || 'voice_command'),
        desiredState: successOps[0]?.desiredState,
        interpretation: confirmationInterpretation,
        context: {
          confirmation: {
            handled: true,
            createdAt: pending.createdAt,
            expiresAt: pending.expiresAt,
            summary: pending.summary,
            operationsRequested: pending.operations?.length || 0
          }
        },
        error: failedOps.length ? failedOps[0].error : undefined
      };
    }

    if (interpretation.isFollowUpCandidate && userContext) {
      contextNotes.followUp = true;
    }

    if (interpretation.usesPronoun && !interpretation.devicePhrase && !interpretation.roomPhrase && !userContext?.lastDeviceId) {
      return {
        success: false,
        message: 'I am not sure which device you mean. Try mentioning the room or device name again.',
        actionType: 'lookup_failed',
        context: {
          interpretation,
          ...contextNotes,
          reason: 'missing_followup_context'
        }
      };
    }

    if (interpretation.roomPhrase && /\b(this|here)\b/.test(interpretation.roomPhrase)) {
      const inferredRooms = gatherUserRooms(user);
      if (inferredRooms.length) {
        interpretation.roomPhrase = inferredRooms[0];
        contextNotes.inferredRoom = inferredRooms[0];
      } else if (userContext?.lastRoom) {
        interpretation.roomPhrase = userContext.lastRoom;
        contextNotes.inferredRoom = userContext.lastRoom;
        contextNotes.usedContext = true;
      } else {
        return {
          success: false,
          message: 'Please mention the classroom or lab name, for example "turn off lights in IoT Lab".',
          actionType: 'lookup_failed',
          context: {
            interpretation,
            ...contextNotes,
            reason: 'room_pronoun_without_context'
          }
        };
      }
    } else if (!interpretation.roomPhrase && userContext?.lastRoom) {
      interpretation.roomPhrase = userContext.lastRoom;
      contextNotes.inferredRoom = userContext.lastRoom;
      contextNotes.usedContext = true;
    }

    // Build device query based on user permissions
    let deviceQuery = {};
    
    // Check if user has admin/super-admin privileges
    const hasFullAccess = user && ['super-admin', 'admin', 'dean'].includes(user.role);
    
    if (!hasFullAccess && user) {
      // Non-admin users can only access assigned devices or devices in their assigned rooms
      const userRooms = gatherUserRooms(user);
      const assignedDeviceIds = Array.isArray(user.assignedDevices) 
        ? user.assignedDevices.map(id => id.toString()) 
        : [];
      
      deviceQuery = {
        $or: [
          { _id: { $in: assignedDeviceIds } },
          { assignedUsers: user._id || user.id },
          ...(userRooms.length > 0 ? [
            { classroom: { $in: userRooms } },
            { location: { $in: userRooms } }
          ] : [])
        ]
      };
      
      contextNotes.accessRestricted = true;
      contextNotes.userRole = user.role;
    }

    const allDevices = await Device.find(deviceQuery).lean();
    if (!allDevices.length) {
      return {
        success: false,
        message: hasFullAccess 
          ? 'No devices are registered yet' 
          : 'You do not have access to any devices. Please contact an administrator.',
        actionType: 'lookup_failed',
        context: { interpretation, ...contextNotes, reason: 'no_accessible_devices' }
      };
    }

    let candidateDevices = allDevices;

    if (interpretation.roomPhrase) {
      const roomMatches = filterDevicesByPhrase(candidateDevices, interpretation.roomPhrase, ['classroom', 'location', 'name', 'block', 'floor', 'voiceAliases']);
      if (!roomMatches.length) {
        return {
          success: false,
          message: `Couldn't find any devices in "${interpretation.roomPhrase}". Try the classroom name, block, or floor shown on the dashboard.`,
          actionType: 'lookup_failed',
          context: { interpretation, ...contextNotes }
        };
      }
      candidateDevices = roomMatches;
    }

    const explicitDevicePhrase = deviceName || interpretation.devicePhrase;
    if (explicitDevicePhrase) {
      const deviceMatches = filterDevicesByPhrase(candidateDevices, explicitDevicePhrase, ['name', 'deviceType', 'classroom', 'location', 'block', 'floor', 'voiceAliases']);
      if (deviceMatches.length) {
        candidateDevices = deviceMatches;
      } else if (candidateDevices.length > 1 && interpretation.scope !== 'all') {
        return {
          success: false,
          message: 'I found multiple devices. Try a more specific command like "turn off projector in IoT Lab".',
          actionType: 'lookup_failed',
          context: {
            interpretation,
            candidateDevices: candidateDevices.slice(0, 5).map(buildDeviceInfo),
            ...contextNotes
          }
        };
      }
    } else if (userContext?.lastDeviceId) {
      const contextDevice = candidateDevices.find((device) => device._id?.toString?.() === userContext.lastDeviceId);
      if (contextDevice) {
        candidateDevices = [contextDevice];
        contextNotes.usedContext = true;
        contextNotes.followUpDevice = buildDeviceInfo(contextDevice);
      }
    }

    if (!candidateDevices.length) {
      return {
        success: false,
        message: 'No matching devices found. Please specify the classroom or device name.',
        actionType: 'lookup_failed',
        context: { interpretation, ...contextNotes }
      };
    }

    const scope = interpretation.scope;

    if (scope !== 'all' && candidateDevices.length > 1) {
      candidateDevices = [candidateDevices[0]];
    }

    if (interpretation.action === 'status') {
      const statusMessages = candidateDevices.map((device) => {
        const info = buildDeviceInfo(device);
        const switches = (device.switches || []).map((sw) => `${sw.name}: ${sw.state ? 'ON' : 'OFF'}`).join(', ');
        return `${info.name || 'Device'} is ${device.status === 'online' ? 'online' : 'offline'}${switches ? `. Switches: ${switches}` : ''}`;
      });

      if (userId && candidateDevices.length) {
        setUserVoiceContext(userId, {
          lastDeviceId: candidateDevices.length === 1 ? candidateDevices[0]._id?.toString?.() : null,
          lastSwitchIds: candidateDevices.length === 1
            ? (candidateDevices[0].switches || []).map((sw) => sw._id?.toString?.()).filter(Boolean)
            : [],
          lastRoom: interpretation.roomPhrase || candidateDevices[0].classroom || candidateDevices[0].location || null,
          lastAction: 'status',
          lastCommand: interpretation.raw
        });
      }

      return {
        success: true,
        message: statusMessages.join('; '),
        device: buildDeviceInfo(candidateDevices[0]),
        actionType: 'status',
        context: {
          interpretation,
          statusCount: statusMessages.length,
          ...contextNotes
        }
      };
    }

    const targets = [];
    for (const device of candidateDevices) {
      // Double-check user has access to this device before adding to targets
      if (!checkUserDeviceAccess(user, device)) {
        logger.warn(`[Voice Command] User ${user?.name || 'unknown'} attempted to access device ${device.name} without permission`);
        continue;
      }
      
      const selections = selectSwitchesForDevice(device, switchName, interpretation, scope, userContext);
      for (const selectedSwitch of selections) {
        targets.push({ device, switch: selectedSwitch });
      }
    }

    if (!targets.length) {
      return {
        success: false,
        message: 'Could not find a matching switch. Try naming it, for example "turn off light 1 in IoT Lab".',
        actionType: 'lookup_failed',
        context: {
          interpretation,
          candidateDevices: candidateDevices.map(buildDeviceInfo),
          ...contextNotes
        }
      };
    }

    const plannedOperations = targets.map((target) => {
      const deviceInfo = buildDeviceInfo(target.device);
      const switchInfo = buildSwitchInfo(target.switch);
      const previousState = !!target.switch.state;
      let desiredState;

      if (interpretation.action === 'toggle') {
        desiredState = !previousState;
      } else {
        desiredState = interpretation.action === 'on';
      }

      const actionType = interpretation.action === 'toggle'
        ? 'toggle'
        : (desiredState ? 'on' : 'off');

      return {
        device: deviceInfo,
        switch: switchInfo,
        deviceId: target.device._id?.toString?.() ?? target.device._id,
        switchId: target.switch._id?.toString?.() ?? target.switch._id,
        desiredState,
        previousState,
        actionType
      };
    });

    if (requiresBulkConfirmation(plannedOperations, interpretation) && userId) {
      const previewSummary = summarizeSuccessfulOperations(plannedOperations, interpretation);
      const pendingRecord = setPendingConfirmation(userId, {
        operations: plannedOperations.map((op) => ({ ...op })),
        interpretation: {
          normalized: interpretation.normalized,
          devicePhrase: interpretation.devicePhrase,
          roomPhrase: interpretation.roomPhrase,
          switchHints: interpretation.switchHints,
          scope,
          action: interpretation.action
        },
        summary: previewSummary,
        command,
        raw: interpretation.raw
      });

      return {
        success: false,
        message: `${previewSummary}. Say "confirm" if you want me to proceed.`,
        actionType: 'confirmation_required',
        context: {
          interpretation,
          pendingConfirmation: {
            summary: previewSummary,
            expiresAt: pendingRecord.expiresAt,
            operations: plannedOperations.length
          },
          ...contextNotes
        }
      };
    }

    const operations = [];
    for (const plan of plannedOperations) {
      const toggleResult = await toggleDeviceSwitch(plan.deviceId, plan.switchId, plan.desiredState);
      operations.push({
        ...plan,
        success: toggleResult.success,
        message: toggleResult.message,
        error: toggleResult.success ? undefined : toggleResult.message
      });
    }

    const successOps = operations.filter((op) => op.success);
    const failedOps = operations.filter((op) => !op.success);

    if (!successOps.length) {
      return {
        success: false,
        message: failedOps[0]?.message || 'Voice command failed',
        actionType: operations.length > 1 ? 'bulk' : operations[0]?.actionType || 'voice_command',
        operations,
        context: {
          interpretation,
          ...contextNotes
        }
      };
    }

    const summary = summarizeSuccessfulOperations(successOps, interpretation);
    const message = failedOps.length
      ? `${summary}. ${failedOps.length} failed: ${failedOps[0].message}`
      : summary;

    if (userId) {
      const distinctDeviceIds = Array.from(new Set(successOps.map((op) => op.device?.id).filter(Boolean)));
      setUserVoiceContext(userId, {
        lastDeviceId: distinctDeviceIds.length === 1 ? distinctDeviceIds[0] : null,
        lastSwitchIds: successOps.map((op) => op.switch?.id).filter(Boolean),
        lastRoom: interpretation.roomPhrase || successOps[0]?.device?.classroom || successOps[0]?.device?.location || null,
        lastAction: interpretation.action,
        lastCommand: interpretation.raw
      });
    }

    return {
      success: failedOps.length === 0,
      message,
      operations,
      device: successOps[0].device,
      switch: successOps[0].switch,
      actionType: operations.length > 1
        ? (failedOps.length ? 'bulk_partial' : 'bulk')
        : successOps[0].actionType,
      desiredState: successOps[0].desiredState,
      interpretation: {
        normalized: interpretation.normalized,
        devicePhrase: interpretation.devicePhrase,
        roomPhrase: interpretation.roomPhrase,
        switchHints: interpretation.switchHints,
        scope,
        ...contextNotes
      },
      error: failedOps.length ? failedOps[0].error : undefined
    };
  } catch (error) {
    logger.error('[Voice Command] Processing error:', error);
    return { success: false, message: 'An error occurred processing your command' };
  }
}

function gatherUserRooms(user) {
  if (!user) return [];
  const rooms = [];
  if (Array.isArray(user.assignedRooms)) {
    rooms.push(...user.assignedRooms);
  }
  if (user.classroom) {
    rooms.push(user.classroom);
  }
  if (user.location) {
    rooms.push(user.location);
  }
  if (user.department) {
    rooms.push(user.department);
  }
  return rooms.filter(Boolean).map((room) => room.toString());
}

function checkUserDeviceAccess(user, device) {
  if (!user || !device) return false;
  
  // Super-admin, admin, and dean have access to all devices
  if (['super-admin', 'admin', 'dean'].includes(user.role)) {
    return true;
  }
  
  const userId = user._id?.toString?.() ?? user.id;
  const deviceId = device._id?.toString?.() ?? device.id;
  
  // Check if user is directly assigned to the device
  if (Array.isArray(user.assignedDevices)) {
    const assignedIds = user.assignedDevices.map(id => id?.toString?.() ?? id);
    if (assignedIds.includes(deviceId)) {
      return true;
    }
  }
  
  // Check if device has this user in assignedUsers
  if (Array.isArray(device.assignedUsers)) {
    const deviceUserIds = device.assignedUsers.map(id => id?.toString?.() ?? id);
    if (deviceUserIds.includes(userId)) {
      return true;
    }
  }
  
  // Check if device is in user's assigned rooms
  const userRooms = gatherUserRooms(user);
  if (userRooms.length > 0) {
    const deviceRoom = device.classroom || device.location;
    if (deviceRoom && userRooms.includes(deviceRoom)) {
      return true;
    }
  }
  
  return false;
}

function filterDevicesByPhrase(devices, phrase, keys) {
  if (!phrase) {
    return devices;
  }

  const search = phrase.toLowerCase().trim();
  
  // Extract numeric values from phrase for better floor/block matching
  const numericMatch = search.match(/\d+/);
  const hasNumber = numericMatch !== null;
  
  const directMatches = devices.filter((device) =>
    keys.some((key) => {
      const value = device[key];
      if (value === null || value === undefined) return false;
      
      // Handle array values (like voiceAliases)
      if (Array.isArray(value)) {
        return value.some((entry) => entry?.toString?.().toLowerCase().includes(search));
      }
      
      const valueStr = value.toString().toLowerCase();
      
      // Exact match for numeric fields (floor, block numbers)
      if (hasNumber && (key === 'floor' || key === 'block')) {
        const deviceNumeric = value.toString();
        return numericMatch.some(num => deviceNumeric === num);
      }
      
      // Regular string matching
      return valueStr.includes(search);
    })
  );

  if (directMatches.length) {
    return directMatches;
  }

  const fuse = upsertFuse(devices, keys);
  const results = fuse.search(search);
  if (!results.length) {
    return [];
  }

  const bestScore = results[0].score ?? 0;
  const cutoff = bestScore + 0.2;

  return results
    .filter((result) => (result.score ?? 0) <= cutoff)
    .map((result) => result.item);
}

function buildDeviceInfo(device) {
  if (!device) {
    return null;
  }

  const id = device._id?.toString?.() ?? device.id ?? device._id;

  return {
    id,
    name: device.name,
    classroom: device.classroom,
    location: device.location,
    block: device.block,
    floor: device.floor,
    macAddress: device.macAddress,
    deviceType: device.deviceType
  };
}

function buildSwitchInfo(sw) {
  if (!sw) {
    return null;
  }

  return {
    id: sw._id?.toString?.() ?? sw.id ?? sw._id,
    name: sw.name,
    type: sw.type,
    label: sw.label,
    channel: sw.channel
  };
}

function selectSwitchesForDevice(device, switchName, interpretation, scope, userContext) {
  const switches = (device.switches || []).map((sw) => {
    const plain = sw.toObject?.() ?? sw;
    return {
      ...plain,
      _id: plain._id?.toString?.() ?? plain._id,
      name: plain.name,
      type: plain.type,
      label: plain.label,
      channel: plain.channel,
      state: plain.state,
      voiceAliases: Array.isArray(plain.voiceAliases) ? plain.voiceAliases : []
    };
  });

  if (!switches.length) {
    return [];
  }

  const contextSwitchIds = new Set((userContext?.lastSwitchIds || []).map((id) => id?.toString?.() ?? id));
  const matches = [];
  const hints = interpretation.switchHints || {};
  const nameQuery = switchName?.toLowerCase();
  const phraseQuery = interpretation.devicePhrase?.toLowerCase();

  if (contextSwitchIds.size && (interpretation.usesPronoun || (!switchName && !hints.raw && !hints.type && !hints.number && !phraseQuery))) {
    const contextMatches = switches.filter((sw) => contextSwitchIds.has(sw._id?.toString?.() ?? sw._id));
    if (contextMatches.length) {
      return scope === 'all' ? contextMatches : [contextMatches[0]];
    }
  }

  for (const sw of switches) {
    const swName = (sw.name || '').toLowerCase();
    const swType = (sw.type || '').toLowerCase();
    const swLabel = (sw.label || '').toLowerCase();
    const swChannel = `${sw.channel ?? ''}`.toLowerCase();
    const combined = `${swName} ${swType} ${swLabel} ${swChannel}`.trim();
    const aliasValues = sw.voiceAliases.map((alias) => alias?.toString?.().toLowerCase()).filter(Boolean);

    if (nameQuery && swName.includes(nameQuery)) {
      matches.push(sw);
      continue;
    }

    if (nameQuery && aliasValues.some((alias) => alias.includes(nameQuery))) {
      matches.push(sw);
      continue;
    }

    if (hints.number && (combined.includes(hints.number.toLowerCase()) || aliasValues.some((alias) => alias.includes(hints.number.toLowerCase())))) {
      matches.push(sw);
      continue;
    }

    if (hints.raw) {
      const rawLower = hints.raw.toLowerCase();
      if (combined.includes(rawLower) || aliasValues.some((alias) => alias.includes(rawLower))) {
        matches.push(sw);
        continue;
      }
    }

    if (hints.type && (swType === hints.type || aliasValues.some((alias) => alias === hints.type))) {
      matches.push(sw);
      continue;
    }

    if (phraseQuery && (combined.includes(phraseQuery) || aliasValues.some((alias) => alias.includes(phraseQuery)))) {
      matches.push(sw);
    }
  }

  if (scope === 'all') {
    if (matches.length) {
      if (hints.type) {
        return matches.filter((sw) => (sw.type || '').toLowerCase() === hints.type);
      }
      return matches;
    }

    if (hints.type) {
      const typeMatches = switches.filter((sw) => {
        const aliasList = Array.isArray(sw.voiceAliases)
          ? sw.voiceAliases.map((alias) => alias?.toString?.().toLowerCase()).filter(Boolean)
          : [];
        return (sw.type || '').toLowerCase() === hints.type || aliasList.includes(hints.type);
      });
      if (typeMatches.length) {
        return typeMatches;
      }
    }

    return switches;
  }

  if (!matches.length && hints.type) {
    const typeMatch = switches.find((sw) => {
      const aliasList = Array.isArray(sw.voiceAliases)
        ? sw.voiceAliases.map((alias) => alias?.toString?.().toLowerCase()).filter(Boolean)
        : [];
      return (sw.type || '').toLowerCase() === hints.type || aliasList.includes(hints.type);
    });
    if (typeMatch) {
      return [typeMatch];
    }
  }

  if (!matches.length && hints.number) {
    const numberMatch = switches.find((sw) =>
      (`${sw.name} ${sw.label ?? ''} ${sw.channel ?? ''}`).toLowerCase().includes(hints.number.toLowerCase())
    );
    if (numberMatch) {
      return [numberMatch];
    }
  }

  if (!matches.length) {
    return [switches[0]];
  }

  return [matches[0]];
}

function requiresBulkConfirmation(plannedOperations, interpretation) {
  if (!plannedOperations || !plannedOperations.length) {
    return false;
  }

  if (plannedOperations.length >= 3) {
    return true;
  }

  const distinctDevices = new Set(plannedOperations.map((op) => op.device?.id || op.deviceId).filter(Boolean));
  if (distinctDevices.size > 1 && plannedOperations.length > 1) {
    return true;
  }

  if (interpretation.scope === 'all' && plannedOperations.length > 1) {
    return true;
  }

  return false;
}

function summarizeSuccessfulOperations(successOps, interpretation) {
  if (!successOps.length) {
    return '';
  }

  const count = successOps.length;
  const desiredState = successOps[0].desiredState;
  const stateWord = desiredState ? 'ON' : 'OFF';
  const typeWord = formatSwitchType(interpretation.switchHints?.type, count);

  const locations = Array.from(
    new Set(
      successOps
        .map((op) => op.device?.classroom || op.device?.location || op.device?.name)
        .filter(Boolean)
    )
  );

  const locationText = locations.length
    ? (locations.length === 1 ? ` in ${locations[0]}` : ` in ${locations.join(', ')}`)
    : '';

  return `Turned ${stateWord} ${count} ${typeWord}${locationText}`;
}

function formatSwitchType(type, count) {
  if (!type) {
    return count === 1 ? 'switch' : 'switches';
  }

  const normalized = type.toLowerCase();
  const pluralMap = {
    light: 'lights',
    fan: 'fans',
    projector: 'projectors',
    ac: 'AC units',
    outlet: 'outlets',
    heater: 'heaters',
    pump: 'pumps'
  };

  if (count === 1) {
    if (normalized === 'ac') {
      return 'AC unit';
    }
    return normalized;
  }

  if (pluralMap[normalized]) {
    return pluralMap[normalized];
  }

  if (normalized.endsWith('s')) {
    return normalized;
  }

  return `${normalized}s`;
}

// Helper Functions
async function toggleDeviceSwitch(deviceId, switchId, state) {
  try {
    const device = await Device.findById(deviceId);
    if (!device) {
      return { success: false, message: 'Device not found' };
    }

    const switchIndex = device.switches.findIndex(sw => sw._id.toString() === switchId);
    if (switchIndex === -1) {
      return { success: false, message: 'Switch not found' };
    }

    // Update database
    const updated = await Device.findOneAndUpdate(
      { _id: deviceId, 'switches._id': switchId },
      { $set: { 'switches.$.state': state, 'switches.$.lastStateChange': new Date() } },
      { new: true }
    );

    if (!updated) {
      return { success: false, message: 'Failed to update switch' };
    }

    // Send MQTT command if device is online
    if (device.status === 'online' && global.sendMqttSwitchCommand) {
      const gpio = updated.switches[switchIndex].relayGpio || updated.switches[switchIndex].gpio;
      global.sendMqttSwitchCommand(updated.macAddress, gpio, state);
    }

    return { success: true, message: 'Switch updated successfully' };

  } catch (error) {
    logger.error('[Device Switch] Toggle error:', error);
    return { success: false, message: error.message };
  }
}

function getGoogleDeviceType(switchType) {
  const typeMap = {
    'light': 'action.devices.types.LIGHT',
    'fan': 'action.devices.types.FAN',
    'outlet': 'action.devices.types.OUTLET',
    'projector': 'action.devices.types.SWITCH',
    'ac': 'action.devices.types.AC_UNIT'
  };
  return typeMap[switchType] || 'action.devices.types.SWITCH';
}

function formatDevicesForGoogle(devices) {
  return devices.flatMap(device =>
    device.switches.map(switchInfo => ({
      id: `${device._id}_${switchInfo._id}`,
      type: getGoogleDeviceType(switchInfo.type),
      traits: ['action.devices.traits.OnOff'],
      name: {
        name: `${device.name} ${switchInfo.name}`,
        defaultNames: [`${device.location} ${switchInfo.name}`],
        nicknames: [`${device.classroom} ${switchInfo.name}`]
      },
      deviceInfo: {
        manufacturer: 'AutoVolt IoT',
        model: device.deviceType,
        hwVersion: '1.0',
        swVersion: '1.0'
      }
    }))
  );
}

function formatDevicesForAlexa(devices) {
  return devices.flatMap(device =>
    device.switches.map(switchInfo => ({
      endpointId: `${device._id}_${switchInfo._id}`,
      manufacturerName: 'AutoVolt IoT',
      friendlyName: `${device.name} ${switchInfo.name}`,
      description: `${device.location} ${switchInfo.name}`,
      displayCategories: ['SWITCH'],
      capabilities: [
        {
          type: 'AlexaInterface',
          interface: 'Alexa.PowerController',
          version: '3'
        }
      ]
    }))
  );
}

function formatDevicesForSiri(devices) {
  return devices.map(device => ({
    id: device._id,
    name: device.name,
    location: device.location,
    classroom: device.classroom,
    switches: device.switches.map(switchInfo => ({
      id: switchInfo._id,
      name: switchInfo.name,
      type: switchInfo.type
    }))
  }));
}

module.exports = {
  handleGoogleAssistantRequest,
  handleAlexaRequest,
  handleSiriRequest,
  processVoiceCommand,
  checkUserDeviceAccess
};