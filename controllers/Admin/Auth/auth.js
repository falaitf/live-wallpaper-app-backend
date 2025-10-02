const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, App, Permission, UserAppPermission } = require("../../../utils/db").loadModels();

// Helper: sha256 hash
const hashPassword = (password) =>
  crypto.createHash("sha256").update(password).digest("hex");

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ id: payload.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
};

// 🔹 Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid email" });

    if (!user.isActive) {
      return res.status(403).json({ error: "Your account is inactive. Please contact admin." });
    }

    // Compare sha256 hash
    const hash = hashPassword(password);
    if (user.passwordHash !== hash)
      return res.status(401).json({ error: "Invalid password" });

    // Fetch permissions
    const userPermissions = await UserAppPermission.findAll({
      where: { userId: user.id, granted: true },
      include: [App, Permission],
    });

    const permissions = userPermissions.map((up) => ({
      app: { id: up.App.id, name: up.App.name, slug: up.App.slug },
      permission: { code: up.Permission.code, name: up.Permission.name },
    }));

    // Generate tokens
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      userType: user.userType,
      permissions,
    });

    res.json({
      message: "Login successful",
      user: { id: user.id, email: user.email, name: user.name, userType: user.userType },
      permissions,
      ...tokens,
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 🔹 Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: "Refresh token required" });

    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) return res.status(403).json({ error: "Invalid or expired refresh token" });

      const user = await User.findByPk(decoded.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Fetch permissions again
      const userPermissions = await UserAppPermission.findAll({
        where: { userId: user.id, granted: true },
        include: [App, Permission],
      });

      const permissions = userPermissions.map((up) => ({
        app: { id: up.App.id, name: up.App.name, slug: up.App.slug },
        permission: { code: up.Permission.code, name: up.Permission.name },
      }));

      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        userType: user.userType,
        permissions,
      });

      res.json(tokens);
    });
  } catch (err) {
    console.error("❌ Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
