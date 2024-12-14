const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
    content: {
        title: { type: String, required: true },
        description: { type: String, required: true },
        price: { type: Number, required: true },
    },
    images: { type: [String], default: [] },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true },
    status: { type: String, enum: ['Active', 'Reserved', 'Sold'], default: 'Active' },
});

module.exports = mongoose.model('Ad', adSchema);
