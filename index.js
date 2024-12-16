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

// 3. Get all users (admin only)
app.get('/users', authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-__v');
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ error: 'Unable to fetch users' });
    }
});

// 4. Delete user (admin only)
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

// 5. Create category (admin only)
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
        const categories = await Category.find({}).select('-__v');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Delete category (admin only)
app.delete('/categories/:id', authorize('admin'), async (req, res) => {
    const { id } = req.params;  // Extract category ID from the URL

    try {
        // Find and delete the category by its ID
        const category = await Category.findByIdAndDelete(id);

        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.status(200).json({ message: 'Category deleted successfully', category });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Create ad
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

// 9. Get all ads
app.get('/ads', async (req, res) => {
    try {
        const { category, page = 1, limit = 10 } = req.query;

        const pageNumber = parseInt(page, 10);
        const pageSize = parseInt(limit, 10);
        const skip = (pageNumber - 1) * pageSize;

        const query = { expires_at: { $gte: new Date() } };
        if (category) {
            query.category_id = category;
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

// 9. Search ads by title
app.get('/ads/search', async (req, res) => {
    try {
        const { title } = req.query;

        if (!title) {
            return res.status(400).json({ error: 'Title query parameter is required' });
        }

        // Perform a case-insensitive regex search for partial matches
        const ads = await Ad.find({
            'content.title': { $regex: title, $options: 'i' }, // Case-insensitive title search
            expires_at: { $gte: new Date() } // Only show ads that haven't expired
        });

        if (ads.length === 0) {
            return res.status(404).json({ message: 'No matching ads found' });
        }

        res.status(200).json(ads);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// 11. Update Ad Status (User can only edit his own)
app.patch('/ads', authorize('user'), async (req, res) => {
    try {
        const adId = req.query.id; // Extract the ad ID from the query parameter
        if (!adId) {
            return res.status(400).json({ error: 'Ad ID is required' });
        }

        const updates = req.body;

        // Find the ad
        const ad = await Ad.findById(adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Check permissions
        if (ad.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You are not authorized to edit this ad' });
        }

        // Validate status if being updated
        if (updates.status && !['Active', 'Reserved', 'Sold'].includes(updates.status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        // Update the ad
        const updatedAd = await Ad.findByIdAndUpdate(adId, updates, { new: true, runValidators: true });
        res.status(200).json(updatedAd);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// 12. Delete ADS (User can only delete his own)
app.delete('/ads', authorize('user'), async (req, res) => {
    try {
        const adId = req.query.id; // Extract the ad ID from the query parameter
        if (!adId) {
            return res.status(400).json({ error: 'Ad ID is required' });
        }

        // Find the ad
        const ad = await Ad.findById(adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        // Check permissions
        if (ad.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You are not authorized to delete this ad' });
        }

        // Delete the ad
        await Ad.findByIdAndDelete(adId);
        res.status(200).json({ message: 'Ad successfully deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Endpoint for deleting the DB (ONLY FOR DEVELOPMENT!)
app.delete('/flush', async (req, res) => {
    try {
        // Delete all records from the collections
        await Ad.deleteMany({});
        await Category.deleteMany({});
        await User.deleteMany({});

        res.status(200).json({ message: 'Database flushed successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start the server
app.listen(8080, async () => {
    console.log('Connected to MongoDB');
});