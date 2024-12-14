const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const User = require('./models/user');
const Category = require('./models/category');
const Ad = require('./models/ad');

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI).catch(err => console.error("Could not connect to MongoDB", err));

// Routes
// 1. Create User
app.post('/users', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.status(201).json(user);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Start the server
app.listen(8080, async () => {
    console.log('Connected to MongoDB');
});