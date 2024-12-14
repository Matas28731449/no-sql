const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const authorize = require('./middleware/authorize');
const User = require('./models/user');
const Category = require('./models/category');
const Ad = require('./models/ad');

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI).catch(err => console.error("Could not connect to MongoDB", err));

// 1. Create User
app.post('/register', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.status(201).json({ user }); // Return both the user and the token
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 2. Login
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find the user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email' });
        }

        // Validate password (assuming plain-text; replace with hashed password comparison in production)
        if (password !== user.password) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ user, token });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Delete user
app.delete('/users/:id', authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params; // Get the user ID from the URL parameter
        const user = await User.findByIdAndDelete(id); // Delete user by ID
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.status(200).json({ message: 'User deleted successfully', user });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// 4. Get all users (admin only)
app.get('/users', authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-__v');
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch users' });
    }
});

// 5. Create category
app.post('/categories', authorize('admin'), async (req, res) => {
    try {
        const category = await Category.create(req.body);
        res.status(201).json(category);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 6. Get all categories (for all users)
app.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find({});
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Create Ad
app.post('/ads', authorize('user'), async (req, res) => {
    try {
        const { content, images, category_id, expires_at } = req.body;

        // Validate category
        const categoryExists = await Category.findById(category_id);
        if (!categoryExists) {
            return res.status(400).json({ error: 'Invalid category ID' });
        }

        // Create the ad with createdByUser from the token
        const ad = await Ad.create({
            content,
            images,
            category_id,
            createdBy: req.user.id,
            expires_at,
        });

        res.status(201).json(ad);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 8. Get All Ads
app.get('/ads', async (req, res) => {
    try {
        const { category, page = 1, limit = 10 } = req.query;

        // Pagination calculations
        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const skip = (pageNumber - 1) * pageSize;

        // Build the query object
        const query = {};
        if (category) {
            query.category_id = category; // Filter by category
        }

        const ads = await Ad.find(query)
            .populate('category_id', 'name') // Populate category name
            .populate('createdBy', 'name email') // Populate user details
            .skip(skip)
            .limit(pageSize);

        // Total ads count for pagination
        const totalAds = await Ad.countDocuments(query);
        const totalPages = Math.ceil(totalAds / pageSize);

        res.json({
            ads,
            totalPages,
            currentPage: pageNumber,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start the server
app.listen(8080, async () => {
    console.log('Connected to MongoDB');
});