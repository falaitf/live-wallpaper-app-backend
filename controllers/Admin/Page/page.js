const { Page, Section, SectionItem, Media, App, sequelize } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3");
const { Op, Sequelize } = require("sequelize");

const getS3Key = (url) => {
    if (!url) return null;
    const parts = url.split(".com/");
    return parts[1] || url;
};

// Create or Update Page
exports.savePage = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const loggedInUser = req.user;
        const { id, name, slug, appId } = req.body;
        let tags = req.body.tags;

        // Authorization checks
        if (!appId) throw new Error("appId is required to create or update a page");

        // App User not allowed
        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // AppAdmin can only modify pages for their own apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map(p => p.app.id);
            if (!adminAppIds.includes(appId)) {
                await t.rollback();
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to modify page for this app",
                });
            }
        }

        // Ensure app exists
        const app = await App.findByPk(appId, { transaction: t });
        if (!app) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "App not found" });
        }

        // Parse tags if it's a string
        if (typeof tags === "string") {
            try {
                tags = JSON.parse(tags);
            } catch {
                tags = [tags];
            }
        }

        // Parse sections
        let sections = [];
        try {
            sections = JSON.parse(req.body.sections);
            if (sections && sections.sections) sections = sections.sections;
        } catch (e) {
            sections = [];
        }
        if (!Array.isArray(sections)) sections = [];

        // Create or update Page
        let page;
        if (id) {
            page = await Page.findByPk(id, { transaction: t });
            if (!page) return res.status(404).json({ error: "Page not found" });
            await page.update({ name, slug, tags, appId }, { transaction: t });
        } else {
            page = await Page.create({ name, slug, tags, appId }, { transaction: t });
        }

        const addedSections = {};

        for (const sec of sections) {
            const { type, title, subtitle, description, buttonText, buttonLink, coloredTitle, media, items } = sec;

            const section = await Section.create(
                { pageId: page.id, type, title, subtitle, description, buttonText, buttonLink, coloredTitle },
                { transaction: t }
            );

            // Section media
            if (media && media.length) {
                for (const m of media) {
                    let url = m.url;
                    if (req.files && req.files.length > 0) {
                        const uploadedFile = req.files.find(f => f.fieldname === m.fieldName);
                        if (uploadedFile) {
                            url = getS3Key(await uploadToS3(uploadedFile, "pages/sections/"));
                        }
                    }
                    await Media.create(
                        { sectionId: section.id, type: m.type, url, alt: m.alt || "" },
                        { transaction: t }
                    );
                }
            }

            // Section items
            if (items && items.length) {
                for (const it of items) {
                    const item = await SectionItem.create(
                        {
                            sectionId: section.id,
                            title: it.title,
                            subtitle: it.subtitle,
                            description: it.description,
                            buttonText: it.buttonText,
                            buttonLink: it.buttonLink,
                            icon: it.icon,
                            question: it.question,
                            answer: it.answer,
                        },
                        { transaction: t }
                    );

                    // Item-level media
                    if (it.media && it.media.length) {
                        for (const m of it.media) {
                            let url = m.url;
                            if (req.files && req.files.length > 0) {
                                const uploadedFile = req.files.find(f => f.fieldname === m.fieldName);
                                if (uploadedFile) {
                                    url = getS3Key(await uploadToS3(uploadedFile, "pages/items/"));
                                }
                            }
                            await Media.create(
                                { itemId: item.id, type: m.type, url, alt: m.alt || "" },
                                { transaction: t }
                            );
                        }
                    }
                }
            }

            addedSections[type] = section.id;
        }

        // Fetch full page with sections
        const fullPage = await Page.findByPk(page.id, {
            include: [
                {
                    model: Section,
                    as: "sections",
                    where: { id: { [Op.in]: Object.values(addedSections) } },
                    required: false,
                    include: [
                        { model: Media, as: "media" },
                        { model: SectionItem, as: "items", include: [{ model: Media, as: "media" }] }
                    ]
                }
            ],
            transaction: t,
        });

        await t.commit();

        res.json({
            success: true,
            data: {
                id: page.id,
                name: page.name,
                slug: page.slug,
                appId: page.appId,
                tags: page.tags,
                sections: fullPage.sections,
            }
        });
    } catch (err) {
        await t.rollback();
        console.error("ERROR in savePage:", err);
        res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
    }
};

exports.getPages = async (req, res) => {
  try {
    const loggedInUser = req.user;

    //  Pagination & search params
    const pageNumber = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (pageNumber - 1) * limit;
    const search = req.query.query?.trim() || "";

    //  Base filter
    let whereClause = {};

    //  Restrict based on user type
    if (loggedInUser.userType === "appUser" || loggedInUser.userType === "appAdmin") {
      const allowedAppIds = loggedInUser.permissions.map((p) => p.app.id);
      if (allowedAppIds.length === 0) {
        return res.json({ success: true, data: [], total: 0, page: pageNumber, limit });
      }
      whereClause.appId = { [Op.in]: allowedAppIds };
    }

    //  Apply search filter (case-insensitive)
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { slug: { [Op.iLike]: `%${search}%` } },
        Sequelize.literal(`CAST("tags" AS TEXT) ILIKE '%${search}%'`), 
      ];
    }

    //  Fetch pages with pagination and app info
    const { count, rows } = await Page.findAndCountAll({
      where: whereClause,
      attributes: ["id", "name", "slug", "tags", "appId"],
      include: [
        {
          model: App,
          as: "app",
          attributes: ["id", "name"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    //  Format response
    const formatted = rows.map((p) => ({
      pageId: p.id,
      name: p.name,
      slug: p.slug,
      tags: p.tags,
      appId: p.appId,
      appName: p.app ? p.app.name : null,
    }));

    //  Paginated response
    const totalPages = Math.ceil(count / limit);

    res.json({
      success: true,
      totalItems: count,
      totalPages,
      currentPage: pageNumber,
      limit,
      data: formatted,
    });
  } catch (err) {
    console.error("❌ ERROR in getPages:", err);
    res.status(500).json({
      success: false,
      error: "Something went wrong",
      details: err.message,
    });
  }
};


exports.getPage = async (req, res) => {
    try {
        const loggedInUser = req.user;
        const { id, slug } = req.query; 

        let whereClause = {};
        if (id) whereClause.id = id;
        if (slug) whereClause.slug = slug;

        if (!id && !slug) {
            return res.status(400).json({ success: false, error: "Page id or slug is required" });
        }

        // Restrict access for appUser / appAdmin
        if (loggedInUser.userType === "appUser" || loggedInUser.userType === "appAdmin") {
            const allowedAppIds = loggedInUser.permissions.map(p => p.app.id);
            if (allowedAppIds.length === 0) {
                return res.status(403).json({ success: false, error: "Not authorized to view this page" });
            }
            whereClause.appId = { [Op.in]: allowedAppIds };
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

// Delete Page Controller
exports.deletePage = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const loggedInUser = req.user;
        const { id } = req.params;

        if (!id) {
            await t.rollback();
            return res.status(400).json({ success: false, error: "Page id is required" });
        }

        // Fetch page
        const page = await Page.findByPk(id, {
            include: [
                {
                    model: Section,
                    as: "sections",
                    include: [
                        { model: Media, as: "media" },
                        {
                            model: SectionItem,
                            as: "items",
                            include: [{ model: Media, as: "media" }]
                        }
                    ]
                }
            ],
            transaction: t
        });

        if (!page) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Page not found" });
        }

        // Authorization checks
        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map(p => p.app.id);
            if (!adminAppIds.includes(page.appId)) {
                await t.rollback();
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to delete page for this app",
                });
            }
        }

        // Delete all related media from S3
        for (const section of page.sections) {
            if (section.media && section.media.length) {
                for (const m of section.media) {
                    await deleteFromS3(m.url);
                }
            }
            if (section.items && section.items.length) {
                for (const item of section.items) {
                    if (item.media && item.media.length) {
                        for (const m of item.media) {
                            await deleteFromS3(m.url);
                        }
                    }
                }
            }
        }

        // Delete cascade (items, media, sections, page)
        await Media.destroy({ where: { sectionId: { [Op.in]: page.sections.map(s => s.id) } }, transaction: t });
        const itemIds = page.sections.flatMap(s => s.items.map(i => i.id));
        if (itemIds.length > 0) {
            await Media.destroy({ where: { itemId: { [Op.in]: itemIds } }, transaction: t });
            await SectionItem.destroy({ where: { id: { [Op.in]: itemIds } }, transaction: t });
        }
        await Section.destroy({ where: { pageId: page.id }, transaction: t });
        await Page.destroy({ where: { id: page.id }, transaction: t });

        await t.commit();

        res.json({ success: true, message: "Page and related data deleted successfully" });
    } catch (err) {
        await t.rollback();
        console.error("ERROR in deletePage:", err);
        res.status(500).json({ success: false, error: "Something went wrong", details: err.message });
    }
};
