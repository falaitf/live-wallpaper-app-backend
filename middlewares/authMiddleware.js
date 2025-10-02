const jwt = require("jsonwebtoken");

exports.authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, userType, permissions }
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err);
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
};
