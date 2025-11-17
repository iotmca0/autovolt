import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

async function createTestUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/autovolt');
    console.log('Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({
      name: String,
      email: String,
      password: String,
      role: String,
      isActive: Boolean,
      isApproved: Boolean,
      department: String
    }));

    // Check if test users already exist
    const existingAdmin = await User.findOne({ email: 'admin@company.com' });
    const existingTeacher = await User.findOne({ email: 'testuser@example.com' });

    if (existingAdmin) {
      console.log('Admin user already exists');
    } else {
      // Create admin user
      const hashedPassword = await bcrypt.hash('admin123456', 12);
      const adminUser = new User({
        name: 'System Admin',
        email: 'admin@company.com',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isApproved: true,
        department: 'IT Department'
      });
      await adminUser.save();
      console.log('Created admin user: admin@company.com');
    }

    if (existingTeacher) {
      console.log('Teacher user already exists');
    } else {
      // Create teacher user
      const hashedPassword = await bcrypt.hash('password123', 12);
      const teacherUser = new User({
        name: 'Test Teacher',
        email: 'testuser@example.com',
        password: hashedPassword,
        role: 'teacher',
        isActive: true,
        isApproved: true,
        department: 'Computer Science'
      });
      await teacherUser.save();
      console.log('Created teacher user: testuser@example.com');
    }

    console.log('Test users setup complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

createTestUsers();