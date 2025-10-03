const { Page, Section, SectionItem, Media, App } = require("../utils/db").loadModels();

exports.getPage = async (req, res) => {
    try {
        const { id, slug } = req.query; 

        let whereClause = {};
        if (id) whereClause.id = id;
        if (slug) whereClause.slug = slug;

        if (!id && !slug) {
            return res.status(400).json({ success: false, error: "Page id or slug is required" });
        }

        // Fetch page with sections + items + media
        const page = await Page.findOne({
            where: whereClause,
            attributes: ["id", "name", "slug", "tags", "appId"],
            include: [
                {
                    model: App,
                    as: "app",
                    attributes: ["id", "name"]
                },
                {
                    model: Section,
                    as: "sections",
                    include: [
                        { model: Media, as: "media" },
                        {
                            model: SectionItem,
                            as: "items",
                            include: [
                                { model: Media, as: "media" }
                            ]
                        }
                    ]
                }
            ],
            order: [
                ["createdAt", "DESC"],
                [{ model: Section, as: "sections" }, "createdAt", "ASC"],
                [{ model: Section, as: "sections" }, { model: SectionItem, as: "items" }, "createdAt", "ASC"]
            ]
        });

        if (!page) {
            return res.status(404).json({ success: false, error: "Page not found or not authorized" });
        }

        res.json({
            success: true,
            data: {
                id: page.id,
                name: page.name,
                slug: page.slug,
                tags: page.tags,
                appId: page.appId,
                appName: page.app ? page.app.name : null,
                sections: page.sections
            }
        });
    } catch (err) {
        console.error("ERROR in getPageDetail:", err);
        res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
    }
};