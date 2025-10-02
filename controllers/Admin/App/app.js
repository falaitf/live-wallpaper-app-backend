const { App, Permission } = require("../../../utils/db").loadModels();
const { Op } = require("sequelize");
const { validate: isUuid } = require("uuid");

// 🔹 Get all apps
exports.getApps = async (req, res) => {
    try {
        const apps = await App.findAll({
            attributes: ["id", "name", "slug", "createdAt", "updatedAt"],
        });

        res.json({ success: true, apps });
    } catch (err) {
        console.error("❌ Error fetching apps:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// 🔹 Get permissions of a specific app
exports.getAppPermissions = async (req, res) => {
    try {
        const { appId } = req.params; // can be ID or slug

        console.log(appId)

        let whereClause;
        if (isUuid(appId)) {
            whereClause = { id: appId }; // valid UUID
        } else {
            whereClause = { slug: appId }; // treat as slug
        }

        const app = await App.findOne({
            where: whereClause,
            include: [
                {
                    model: Permission,
                    as: "permissions",
                    attributes: ["id", "code", "name", "description"],
                    through: { attributes: [] }, // hide join table
                },
            ],
        });
        if (!app) {
            return res.status(404).json({ success: false, error: "App not found" });
        }

        res.json({
            success: true,
            app: {
                id: app.id,
                name: app.name,
                slug: app.slug,
            },
            permissions: app.permissions,
        });
    } catch (err) {
        console.error("❌ Error fetching app permissions:", err);
        res.status(500).json({ success: false, error: "Internal server error" });
    }
};
