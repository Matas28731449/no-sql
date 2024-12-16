const jwt = require('jsonwebtoken');

const authorize = (requiredRole) => (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token is required' });
    }

    const token = authHeader.split(' ')[1]; // Extract token

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
        // Allow admin role to bypass further checks
        if (decoded.role === 'admin' || !requiredRole || decoded.role === requiredRole) {
            req.user = decoded; // Attach decoded user info to the request
            return next();
        }
    
        return res.status(403).json({ error: 'Access denied' });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

module.exports = authorize;
