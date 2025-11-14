const mongoose = require('mongoose');

const ClassroomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  building: {
    type: String,
    required: false,
    trim: true,
  },
  floor: {
    type: Number,
    required: false,
  },
  // You can add more fields here as needed, e.g., capacity, type, etc.
}, {
  timestamps: true,
});

module.exports = mongoose.model('Classroom', ClassroomSchema);
