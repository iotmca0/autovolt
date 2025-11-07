const socketIo = require('socket.io');
const Device = require('../models/Device');
const ActivityLog = require('../models/ActivityLog');

class ESP32SocketService {
    constructor(namespace) {
        this.io = namespace;
        this.deviceSockets = new Map(); // Map to store device connections
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('ESP32 device attempting to connect...');

            // Send initial welcome message
            socket.emit('hello', { message: 'Welcome ESP32 device' });

            // Handle device authentication
            socket.on('authenticate', async (data) => {
                try {
                    const { macAddress } = data;
                    if (!macAddress) {
                        socket.emit('auth_error', { message: 'MAC address is required' });
                        socket.disconnect();
                        return;
                    }

                    // Find device in database
                    const device = await Device.findOne({ macAddress });
                    if (!device) {
                        socket.emit('auth_error', { message: 'Device not registered' });
                        socket.disconnect();
                        return;
                    }

                    // Store socket connection
                    this.deviceSockets.set(macAddress, socket);
                    socket.deviceData = { macAddress, deviceId: device._id };

                    // Update device status - only set onlineSince if status is changing
                    const updateFields = {
                        lastSeen: new Date(),
                        ipAddress: socket.handshake.address
                    };
                    
                    if (device.status !== 'online') {
                        updateFields.status = 'online';
                        updateFields.onlineSince = new Date();
                        updateFields.offlineSince = null;
                    } else {
                        updateFields.status = 'online';
                    }

                    await Device.findByIdAndUpdate(device._id, updateFields);

                    console.log(`ESP32 device ${macAddress} authenticated and connected`);
                    socket.emit('authenticated');

                    // Log activity
                    await ActivityLog.create({
                        deviceId: device._id,
                        deviceName: device.name,
                        action: 'connected',
                        triggeredBy: 'device',
                        ip: socket.handshake.address
                    });

                    // Setup device-specific handlers
                    this.setupDeviceHandlers(socket, device);

                } catch (error) {
                    console.error('Authentication error:', error);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                    socket.disconnect();
                }
            });
        });
    }

    setupDeviceHandlers(socket, device) {
        // Handle state updates from device
        socket.on('state_update', async (data) => {
            try {
                const { switches, pirState } = data;

                // Update device state in database
                const updatedDevice = await Device.findByIdAndUpdate(
                    device._id,
                    {
                        'switches': switches,
                        'pirEnabled': pirState?.enabled || device.pirEnabled,
                        lastSeen: new Date()
                    },
                    { new: true }
                );

                // Broadcast state change to all connected clients
                this.io.emit('device_state_changed', {
                    deviceId: device._id,
                    state: updatedDevice
                });

            } catch (error) {
                console.error('Error handling state update:', error);
                socket.emit('error', { message: 'Failed to update state' });
            }
        });

        // Handle PIR sensor events
        socket.on('pir_triggered', async (data) => {
            try {
                const { triggered } = data;

                await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    action: 'pir_triggered',
                    triggeredBy: 'sensor',
                    details: { triggered }
                });

                // Broadcast PIR event to all connected clients
                this.io.emit('device_pir_triggered', {
                    deviceId: device._id,
                    triggered
                });

            } catch (error) {
                console.error('Error handling PIR event:', error);
            }
        });

        // Handle batch commands from server
        socket.on('batch_command', async (command) => {
            try {
                const { batchId, switches, timestamp } = command;
                console.log(`ESP32 ${socket.deviceData.macAddress} received batch command ${batchId} with ${switches.length} switches`);

                // Process batch command
                const results = [];
                for (const switchCmd of switches) {
                    try {
                        // Here you would implement the actual switch control logic
                        // For now, we'll just acknowledge the command
                        results.push({
                            deviceId: switchCmd.deviceId,
                            switchId: switchCmd.switchId,
                            success: true,
                            newState: switchCmd.targetState
                        });
                    } catch (error) {
                        results.push({
                            deviceId: switchCmd.deviceId,
                            switchId: switchCmd.switchId,
                            success: false,
                            error: error.message
                        });
                    }
                }

                // Send response back to server
                socket.emit('batch_response', {
                    batchId,
                    results,
                    timestamp: new Date(),
                    success: results.every(r => r.success)
                });

            } catch (error) {
                console.error('Error processing batch command:', error);
                socket.emit('batch_error', {
                    batchId: command.batchId,
                    error: error.message
                });
            }
        });

        // Handle batch command responses from device
        socket.on('batch_response', async (response) => {
            try {
                const { batchId, results, timestamp, success } = response;
                console.log(`ESP32 ${socket.deviceData.macAddress} completed batch ${batchId}: ${success ? 'SUCCESS' : 'PARTIAL'}`);

                // Here you could emit the response to the main application
                // For now, we'll just log it
                if (this.io) {
                    this.io.emit('batch_completed', {
                        batchId,
                        esp32Id: socket.deviceData.macAddress,
                        results,
                        success,
                        timestamp
                    });
                }

            } catch (error) {
                console.error('Error handling batch response:', error);
            }
        });

        // Handle batch command errors from device
        socket.on('batch_error', async (error) => {
            try {
                const { batchId, error: errorMessage } = error;
                console.error(`ESP32 ${socket.deviceData.macAddress} batch ${batchId} failed: ${errorMessage}`);

                // Here you could emit the error to the main application
                if (this.io) {
                    this.io.emit('batch_failed', {
                        batchId,
                        esp32Id: socket.deviceData.macAddress,
                        error: errorMessage,
                        timestamp: new Date()
                    });
                }

            } catch (error) {
                console.error('Error handling batch error:', error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', async () => {
            try {
                const now = new Date();
                
                // Update device status - set offlineSince to current time when socket disconnects
                await Device.findByIdAndUpdate(device._id, {
                    status: 'offline',
                    lastSeen: now,
                    offlineSince: now,
                    onlineSince: null
                });

                // Remove from connected devices
                this.deviceSockets.delete(socket.deviceData.macAddress);

                // Log disconnect
                await ActivityLog.create({
                    deviceId: device._id,
                    deviceName: device.name,
                    action: 'disconnected',
                    triggeredBy: 'device'
                });

                console.log(`ESP32 device ${socket.deviceData.macAddress} disconnected`);
            } catch (error) {
                console.error('Error handling disconnect:', error);
            }
        });
    }

    // Method to send batch command to specific device
    async sendBatchCommand(macAddress, batchCommand) {
        const socket = this.deviceSockets.get(macAddress);
        if (!socket) {
            throw new Error('Device not connected');
        }

        return new Promise(async (resolve, reject) => {
            try {
                // Convert backend format to ESP32 format
                const esp32Command = {
                    type: 'bulk_switch_command',
                    commands: []
                };

                // Get device information to map switches to GPIO pins
                const device = await Device.findOne({ macAddress });
                if (!device) {
                    throw new Error('Device not found in database');
                }

                // Convert each switch command
                for (const switchCmd of batchCommand.switches) {
                    // Find the switch in the device
                    const switchInfo = device.switches.id(switchCmd.switchId);
                    if (!switchInfo) {
                        console.warn(`Switch ${switchCmd.switchId} not found in device ${device._id}`);
                        continue;
                    }

                    esp32Command.commands.push({
                        relayGpio: switchInfo.gpio,
                        state: switchCmd.targetState,
                        seq: Date.now() // Use timestamp as sequence number
                    });
                }

                if (esp32Command.commands.length === 0) {
                    throw new Error('No valid switches found for batch command');
                }

                // Set timeout for batch command
                const timeout = setTimeout(() => {
                    reject(new Error('Batch command timeout'));
                }, 10000);

                // Send the formatted command to ESP32
                socket.emit('command', esp32Command, (response) => {
                    clearTimeout(timeout);
                    if (response && response.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve({
                            batchId: batchCommand.batchId,
                            processed: esp32Command.commands.length,
                            response
                        });
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    // Method to send command to specific device
    async sendCommand(macAddress, command) {
        const socket = this.deviceSockets.get(macAddress);
        if (!socket) {
            throw new Error('Device not connected');
        }

        return new Promise((resolve, reject) => {
            socket.emit('command', command, (response) => {
                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response);
                }
            });
        });
    }

    // Method to broadcast command to all devices
    broadcastCommand(command) {
        this.io.emit('command', command);
    }

    // Method to get connected devices
    getConnectedDevices() {
        return Array.from(this.deviceSockets.keys());
    }
}

module.exports = ESP32SocketService;
