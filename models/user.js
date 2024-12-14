const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    surname: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    phone: { type: String, unique: true, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }, // Default role is "user"
});

module.exports = mongoose.model('User', userSchema);
