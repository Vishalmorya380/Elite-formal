const User = require('../models/User');

const attachUser = async (req, res, next) => {
  if (!req.session.userId) {
    return next();
  }

  try {
    const user = await User.findById(req.session.userId);
    if (user) {
      req.user = user;
    }
    next();
  } catch (error) {
    console.error(error);
    next();
  }
};

module.exports = attachUser;
