const User = require('../models/user');

const authorize = (requiredRole) => async (req, res, next) => {
    try {
        const userId = req.headers['user-id']; // Replace this with token-based user identification in production
        if (!userId) {
            return res.status(401).json({ error: 'User ID is required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.role !== requiredRole) {
            return res.status(403).json({ error: 'Access denied' });
        }

        req.user = user; // Attach user to the request for further use
        next();
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = authorize;
