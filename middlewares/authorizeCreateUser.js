exports.authorizeCreateUser = (req, res, next) => {
  const { userType, appId } = req.body;
  const loggedInUser = req.user; // from JWT payload

  //  SuperAdmin can create anyone
  if (loggedInUser.userType === "superAdmin") {
    return next();
  }

  //  AppAdmin → can only create appUsers for their own apps
  if (loggedInUser.userType === "appAdmin") {
    if (userType !== "appUser") {
      return res
        .status(403)
        .json({ success: false, error: "App admin can only create app users" });
    }

    // Extract apps from JWT permissions
    const userApps = loggedInUser.permissions.map((p) => p.app.id);

    if (!userApps.includes(appId)) {
      return res
        .status(403)
        .json({ success: false, error: "You are not allowed to assign this app" });
    }

    return next();
  }

  //  Other roles cannot create users
  return res.status(403).json({ success: false, error: "Not authorized to perform this action" });
};
