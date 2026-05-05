module.exports = function(allowedRoles) {
  return (req, res, next) => {

    const user = req.user;

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        message: "Acceso denegado"
      });
    }

    next();
  };
};