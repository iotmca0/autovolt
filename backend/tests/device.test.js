const request = require('supertest');
const mongoose = require('mongoose');
const { app, server, mqttServer } = require('../server');
const Device = require('../models/Device');
const User = require('../models/User');
const { testUtils, testDb } = global;

describe('Device API', () => {
    let adminToken;
    let studentToken;
    let adminUser;
    let studentUser;
    let testDevice;

    beforeAll(async () => {
        // Track servers for cleanup
        if (server) global.testServers.push(server);
        if (mqttServer) global.testServers.push(mqttServer);

        await testDb.connect();
    });

    afterAll(async () => {
        await testDb.disconnect();
    });

    beforeEach(async () => {
        await testDb.clear();

        // Create test users
        adminUser = await User.create({
            name: 'Admin User',
            email: 'admin@example.com',
            password: 'password123',
            role: 'admin',
            isActive: true,
            isApproved: true
        });

        studentUser = await User.create({
            name: 'Student User',
            email: 'student@example.com',
            password: 'password123',
            role: 'student',
            department: 'Computer Science',
            isActive: true,
            isApproved: true
        });

        // Generate tokens
        adminToken = testUtils.generateTestToken(adminUser._id, adminUser.role);
        studentToken = testUtils.generateTestToken(studentUser._id, studentUser.role);

        // Create test device
        testDevice = await Device.create({
            name: 'Test Classroom Device',
            macAddress: 'AA:BB:CC:DD:EE:FF',
            ipAddress: '192.168.1.100',
            classroom: 'Computer Science-101',
            location: 'Room 101',
            type: 'switch',
            status: 'online',
            switches: [
                {
                    name: 'Fan 1',
                    gpio: 16,
                    type: 'fan',
                    state: false,
                    icon: 'fan'
                },
                {
                    name: 'Light 1',
                    gpio: 17,
                    type: 'light',
                    state: false,
                    icon: 'lightbulb'
                }
            ]
        });
    });

    describe('GET /api/devices', () => {
        test('should return all devices for admin', async () => {
            const response = await request(app)
                .get('/api/devices')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0]).toHaveProperty('name', 'Test Classroom Device');
        });

        test('should return devices for student with proper permissions', async () => {
            // Note: In a real scenario, you'd set up device permissions first
            const response = await request(app)
                .get('/api/devices')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
        });

        test('should reject unauthorized access', async () => {
            const response = await request(app)
                .get('/api/devices')
                .expect(401);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('GET /api/devices/:deviceId', () => {
        test('should return device details for admin', async () => {
            const response = await request(app)
                .get(`/api/devices/${testDevice._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('name', 'Test Classroom Device');
            expect(response.body.data).toHaveProperty('macAddress', 'aa:bb:cc:dd:ee:ff');
            expect(response.body.data).toHaveProperty('switches');
            expect(Array.isArray(response.body.data.switches)).toBe(true);
        });

        test('should return 404 for non-existent device', async () => {
            const fakeId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .get(`/api/devices/${fakeId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('POST /api/devices/:deviceId/switches/:switchId/toggle', () => {
        test('should toggle switch successfully for admin', async () => {
            const switchId = testDevice.switches[0]._id;

            const response = await request(app)
                .post(`/api/devices/${testDevice._id}/switches/${switchId}/toggle`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ state: true })
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('hardwareDispatch');
        });

        test('should handle switch toggle with state parameter', async () => {
            const switchId = testDevice.switches[0]._id;

            // Toggle on with explicit state
            const response = await request(app)
                .post(`/api/devices/${testDevice._id}/switches/${switchId}/toggle`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ state: true })
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
        });

        test('should reject toggle for invalid device', async () => {
            const fakeDeviceId = new mongoose.Types.ObjectId();
            const fakeSwitchId = new mongoose.Types.ObjectId();

            const response = await request(app)
                .post(`/api/devices/${fakeDeviceId}/switches/${fakeSwitchId}/toggle`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ state: true })
                .expect(404);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('PUT /api/devices/:deviceId', () => {
        test('should update device for admin', async () => {
            const updateData = {
                name: 'Updated Device Name',
                location: 'Updated Location'
            };

            const response = await request(app)
                .put(`/api/devices/${testDevice._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message', 'Device updated successfully');
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('name', 'Updated Device Name');
            expect(response.body.data).toHaveProperty('location', 'Updated Location');
        });

        test('should reject update for non-admin', async () => {
            const updateData = {
                name: 'Unauthorized Update'
            };

            const response = await request(app)
                .put(`/api/devices/${testDevice._id}`)
                .set('Authorization', `Bearer ${studentToken}`)
                .send(updateData)
                .expect(403);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('DELETE /api/devices/:deviceId', () => {
        test('should delete device for admin', async () => {
            const response = await request(app)
                .delete(`/api/devices/${testDevice._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toMatch(/deleted/i);
        });

        test('should reject delete for non-admin', async () => {
            const response = await request(app)
                .delete(`/api/devices/${testDevice._id}`)
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('POST /api/devices', () => {
        test('should create new device for admin', async () => {
            const newDeviceData = {
                name: 'New Test Device',
                macAddress: 'BB:CC:DD:EE:FF:AA',
                ipAddress: '192.168.1.101',
                classroom: 'Test Room 2',
                location: 'Building A',
                type: 'switch',
                switches: [
                    {
                        name: 'Test Switch',
                        gpio: 18,
                        type: 'light',
                        state: false
                    }
                ]
            };

            const response = await request(app)
                .post('/api/devices')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newDeviceData)
                .expect(201);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('name', 'New Test Device');
            expect(response.body.data).toHaveProperty('macAddress', 'bb:cc:dd:ee:ff:aa');
        });

        test('should reject device creation for non-admin', async () => {
            const newDeviceData = {
                name: 'Unauthorized Device',
                macAddress: 'CC:DD:EE:FF:AA:BB',
                ipAddress: '192.168.1.102',
                classroom: 'Test Room 3'
            };

            const response = await request(app)
                .post('/api/devices')
                .set('Authorization', `Bearer ${studentToken}`)
                .send(newDeviceData)
                .expect(403);

            expect(response.body).toHaveProperty('message');
        });
    });

    describe('GET /api/devices/stats', () => {
        test('should return device statistics', async () => {
            const response = await request(app)
                .get('/api/devices/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('totalDevices');
            expect(response.body.data).toHaveProperty('onlineDevices');
            expect(response.body.data).toHaveProperty('totalSwitches');
        });
    });
});