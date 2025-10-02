const crypto = require("crypto");
const { sequelize, User, App, Permission, UserAppPermission } = require("../../../utils/db").loadModels();;
const { transporter } = require("../../../utils/nodemailer");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize"); // <-- add this


// Utility: hash password with SHA256
const hashPassword = (password) => {
    return crypto.createHash("sha256").update(password).digest("hex");
};

// Utility: generate random password
const generatePassword = (length = 10) => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
    let pwd = "";
    for (let i = 0; i < length; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
};

exports.createUser = async (req, res) => {
    const t = await sequelize.transaction(); // start transaction

    try {
        const { name, email, userType, appId, permissionIds } = req.body;

        // check if user already exists
        let existing = await User.findOne({ where: { email }, transaction: t });
        if (existing) {
            await t.rollback();
            return res.status(400).json({ success: false, error: "User already exists" });
        }

        // generate random password
        const plainPassword = generatePassword(12);
        const passwordHash = hashPassword(plainPassword);

        // create user
        const user = await User.create(
            {
                id: uuidv4(),
                name,
                email,
                passwordHash,
                userType: userType || "appUser",
            },
            { transaction: t }
        );

        // validate app
        const app = await App.findByPk(appId, { transaction: t });
        if (!app) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "App not found" });
        }

        // assign permissions
        if (permissionIds && Array.isArray(permissionIds)) {
            for (const permId of permissionIds) {
                await UserAppPermission.create(
                    {
                        id: uuidv4(),
                        userId: user.id,
                        appId: app.id,
                        permissionId: permId,
                        granted: true,
                    },
                    { transaction: t }
                );
            }
        }

        // send email with credentials
        await transporter.sendMail({
            from: `"Terafort Admin" <${process.env.EMAIL}>`,
            to: email,
            subject: "🎉 Welcome to Terafort – Your Account Details",
            html: `
                <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; background: #f9f9f9;">
                
                <h2 style="color: #2c3e50; text-align: center;">Welcome to <span style="color: #0073e6;">Terafort</span> 👋</h2>
                
                <p>Dear <strong>${name}</strong>,</p>
                
                <p>We’re excited to let you know that your account has been successfully created. You can now log in and start using the platform.</p>
                
                <div style="background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Email:</strong> ${email}</p>
                    <p style="margin: 0;"><strong>Password:</strong> ${plainPassword}</p>
                </div>
                
                <p>👉 For security, we recommend that you log in and change your password immediately.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://your-login-link.com" 
                    style="background: #0073e6; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Login to Your Account
                    </a>
                </div>
                
                <p>If you face any issues, feel free to reach out to our support team.</p>
                
                <p style="margin-top: 30px;">Best Regards,<br/>
                <strong>Terafort Team</strong></p>
                
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
                <p style="font-size: 12px; color: #777; text-align: center;">
                    This is an automated message. Please do not reply to this email.
                </p>
                </div>
            `,
        });

        // commit transaction before sending email
        await t.commit();

        res.json({
            success: true,
            message: "User created successfully and credentials sent via email",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                userType: user.userType,
            },
        });
    } catch (err) {
        // rollback on error
        await t.rollback();
        console.error("❌ Error creating user:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

exports.getUsers = async (req, res) => {
    try {
        const loggedInUser = req.user;

        // appUser cannot access
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // pagination params
        let { page = 1, limit = 20 } = req.query;
        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const offset = (page - 1) * limit;

        // base condition: exclude superAdmin
        let whereCondition = { userType: { [Op.not]: "superAdmin" } };
        let permissionWhere = {};

        // appAdmin → only their appUsers
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            whereCondition.userType = "appUser";
            permissionWhere.appId = adminAppIds;
        }

        // fetch with pagination
        const { count, rows } = await User.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: UserAppPermission,
                    where: Object.keys(permissionWhere).length ? permissionWhere : undefined,
                    include: [
                        { model: App, attributes: ["id", "name", "slug"] },
                        { model: Permission, attributes: ["id", "code", "name", "description"] },
                    ],
                    required: false,
                },
            ],
            distinct: true,
            limit,
            offset,
        });

        // transform
        const result = rows.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            userType: user.userType,
            permissions: user.UserAppPermissions?.map((up) => ({
                app: {
                    id: up.App.id,
                    name: up.App.name,
                    slug: up.App.slug,
                },
                permission: {
                    id: up.Permission.id,
                    code: up.Permission.code,
                    name: up.Permission.name,
                    description: up.Permission.description,
                },
                granted: up.granted,
            })),
        }));

        res.json({
            success: true,
            page,
            limit,
            total: count,
            users: result,
        });
    } catch (err) {
        console.error("❌ Error fetching users:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};


exports.toggleUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const loggedInUser = req.user; // from JWT payload

        // appUser cannot toggle
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        const user = await User.findByPk(userId, {
            include: [
                {
                    model: UserAppPermission,
                    include: ["App"],
                },
            ],
        });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // SuperAdmin can toggle anyone
        if (loggedInUser.userType === "superAdmin") {
            user.isActive = !user.isActive;
            await user.save();
            return res.json({
                success: true,
                message: `User has been ${user.isActive ? "activated" : "deactivated"}`,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    userType: user.userType,
                    isActive: user.isActive,
                },
            });
        }

        // AppAdmin → can only toggle appUsers for their own apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            const userAppIds = user.UserAppPermissions.map((p) => p.appId);

            // check if user belongs to admin's apps
            const hasAccess = userAppIds.some((id) => adminAppIds.includes(id));

            if (!hasAccess) {
                return res.status(403).json({ success: false, error: "You are not authorized to toggle this user" });
            }

            // toggle status
            user.isActive = !user.isActive;
            await user.save();

            return res.json({
                success: true,
                message: `User has been ${user.isActive ? "activated" : "deactivated"}`,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    userType: user.userType,
                    isActive: user.isActive,
                },
            });
        }

        // fallback (should not reach here)
        return res.status(403).json({ success: false, error: "Not authorized" });

    } catch (err) {
        console.error("❌ Error toggling user status:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

exports.updateUserPermissions = async (req, res) => {
    try {
        const loggedInUser = req.user; // from JWT
        const { userId, appId, permissionIds } = req.body;

        // ❌ appUser cannot update permissions
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // Find target user
        const user = await User.findByPk(userId, {
            include: [{ model: UserAppPermission }],
        });
        if (!user) return res.status(404).json({ success: false, error: "User not found" });

        // ❌ Cannot update superAdmin
        if (user.userType === "superAdmin") {
            return res.status(403).json({ success: false, error: "Cannot update superAdmin" });
        }

        // Authorization check for appAdmin
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(appId)) {
                return res.status(403).json({ success: false, error: "Not allowed to update this app" });
            }
            if (user.userType !== "appUser") {
                return res.status(403).json({ success: false, error: "Can only update appUsers" });
            }
        }

        // Remove existing permissions for this user & app
        await UserAppPermission.destroy({ where: { userId, appId } });

        // Assign new permissions
        const newPermissions = permissionIds.map((permId) => ({
            id: uuidv4(),
            userId,
            appId,
            permissionId: permId,
            granted: true,
        }));

        await UserAppPermission.bulkCreate(newPermissions);

        res.json({ success: true, message: "Permissions updated successfully" });
    } catch (err) {
        console.error("❌ Error updating permissions:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

exports.getUser = async (req, res) => {
    try {
        const loggedInUser = req.user;
        const { userId } = req.params;

        // ❌ appUser cannot access
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // Find target user
        const user = await User.findByPk(userId, {
            include: [
                {
                    model: UserAppPermission,
                    include: [
                        { model: App, attributes: ["id", "name", "slug"] },
                        { model: Permission, attributes: ["id", "code", "name", "description"] },
                    ],
                    required: false,
                },
            ],
        });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // ❌ Exclude superAdmin from being fetched by others
        if (user.userType === "superAdmin") {
            return res.status(403).json({ success: false, error: "Cannot fetch superAdmin" });
        }

        // ✅ AppAdmin can only fetch appUsers from their apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);

            if (user.userType !== "appUser") {
                return res.status(403).json({ success: false, error: "AppAdmin can only fetch appUsers" });
            }

            // check if user belongs to admin’s apps
            const belongsToAdminApp = user.UserAppPermissions.some((up) =>
                adminAppIds.includes(up.appId)
            );

            if (!belongsToAdminApp) {
                return res.status(403).json({ success: false, error: "Not allowed to access this user" });
            }
        }

        // format response
        const result = {
            id: user.id,
            name: user.name,
            email: user.email,
            userType: user.userType,
            permissions: user.UserAppPermissions?.map((up) => ({
                app: {
                    id: up.App.id,
                    name: up.App.name,
                    slug: up.App.slug,
                },
                permission: {
                    id: up.Permission.id,
                    code: up.Permission.code,
                    name: up.Permission.name,
                    description: up.Permission.description,
                },
                granted: up.granted,
            })),
        };

        res.json({ success: true, user: result });
    } catch (err) {
        console.error("❌ Error fetching user:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};
