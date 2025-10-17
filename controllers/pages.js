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

exports.getAppPages = async (req, res) => {
  try {
    const { slug } = req.params; // app can be identified by slug or appId
    let { page = 1, limit = 20 } = req.query;

    // Convert pagination params
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    // Ensure at least one identifier
    if (!slug) {
      return res.status(400).json({ success: false, error: "App slug is required" });
    }

    // Find the app
    const app = await App.findOne({
  where: { slug },
  attributes: ["id", "name", "slug"],
});

    if (!app) {
      return res.status(404).json({ success: false, error: "App not found" });
    }

    // Fetch all pages of the app with pagination
    const { count, rows: pages } = await Page.findAndCountAll({
      where: { appId: app.id },
      distinct: true,
      attributes: ["id", "name", "slug", "tags", "createdAt"],
    //   include: [
    //     {
    //       model: Section,
    //       as: "sections",
    //       include: [
    //         { model: Media, as: "media" },
    //         {
    //           model: SectionItem,
    //           as: "items",
    //           include: [{ model: Media, as: "media" }],
    //         },
    //       ],
    //     },
    //   ],
      limit,
      offset,
      order: [
        ["createdAt", "DESC"],
        // [{ model: Section, as: "sections" }, "createdAt", "ASC"],
        // [{ model: Section, as: "sections" }, { model: SectionItem, as: "items" }, "createdAt", "ASC"],
      ],
    });

    res.json({
      success: true,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
      data: {
        app: {
          id: app.id,
          name: app.name,
          slug: app.slug,
        },
        pages,
      },
    });
  } catch (err) {
    console.error("ERROR in getAppPages:", err);
    res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
  }
};
