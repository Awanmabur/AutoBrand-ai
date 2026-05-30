const User = require('../models/User');
const { verifyAccessToken } = require('../services/tokenService');

async function attachUser(req, res, next) {
  try {
    const bearer = req.get('authorization')?.replace('Bearer ', '');
    const token = req.cookies.accessToken || bearer;

    if (!token) return next();

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select('-passwordHash');

    if (user && user.status !== 'suspended') {
      req.user = user;
    }

    next();
  } catch (error) {
    next();
  }
}

module.exports = attachUser;
