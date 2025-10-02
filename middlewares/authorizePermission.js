// middlewares/authorizePermission.js
module.exports = function authorizePermission(requiredPermission) {
  return (req, res, next) => {
    try {
      // req.user is already set by authenticateJWT
      if (!req.user) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { userType, permissions } = req.user;

      // SuperAdmin always has full access
      if (userType === "superAdmin") {
        return next();
      }

      // Check if permission exists in user's assigned permissions
      if (permissions && permissions.includes(requiredPermission)) {
        return next();
      }

      return res.status(403).json({
        success: false,
        error: "Forbidden: You don't have permission",
      });
    } catch (err) {
      console.error("❌ Authorization Error:", err);
      return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
  };
};
