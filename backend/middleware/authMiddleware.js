const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const auth = req.headers.authorization;

    if (!auth) {
        return res.status(401).json({ message: 'Token tidak ada' });
    }

    const token = auth.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user_id = decoded.user_id; // 👈 KUNCI
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Token invalid' });
    }
};
