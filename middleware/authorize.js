const jwt = require('jsonwebtoken');
// const User = require('../models/user');

const authorize = (requiredRole) => (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token is required' });
    }

    const token = authHeader.split(' ')[1]; // Extract token

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (requiredRole && decoded.role !== requiredRole) {
            return res.status(403).json({ error: 'Access denied' });
        }

        req.user = decoded; // Attach decoded user info to the request
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = authorize;
