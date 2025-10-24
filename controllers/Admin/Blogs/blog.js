const { Blog, BlogItem, App, sequelize } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");

const getS3Key = (url) => {
    if (!url) return null;
    const parts = url.split(".com/");
    return parts[1] || url;
};

const makeProxyUrl = (req, item) => {
    const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;
    return `${baseUrl}/api/v1/files/blogs/${item}/image`;
};

exports.addBlog = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { slug, title, appId } = req.body;
        const loggedInUser = req.user;

        // App User not allowed
        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // AppAdmin can only add blog for their own apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(appId)) {
                await t.rollback();
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to add blog for this app",
                });
            }
        }

        // Ensure app exists (inside transaction)
        const app = await App.findByPk(appId, { transaction: t });
        if (!app) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "App not found" });
        }

        // Create blog (inside transaction)
        const blog = await Blog.create(
            { slug, title, appId },
            { transaction: t }
        );

        await t.commit();

        res.status(201).json({ success: true, data: blog });
    } catch (err) {
        await t.rollback();
        console.error(" Error creating blog:", err);
        res.status(500).json({ success: false, error: "Failed to create blog" });
    }
};

exports.addBlogItem = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { blogId, type, value } = req.body;
        const loggedInUser = req.user;

        if (!blogId || !type) {
            await t.rollback();
            return res.status(400).json({ success: false, error: "blogId and type are required" });
        }

        if (!["heading", "description", "image"].includes(type)) {
            await t.rollback();
            return res.status(400).json({ success: false, error: "Invalid type" });
        }

        const blog = await Blog.findByPk(blogId, { transaction: t });
        if (!blog) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        // Authorization
        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                await t.rollback();
                return res.status(403).json({ success: false, error: "Not authorized" });
            }
        }

        let finalValue = value;
        if (type === "image") {
            if (!req.file) {
                await t.rollback();
                return res.status(400).json({ success: false, error: "Image required" });
            }
            const s3Url = await uploadToS3(req.file, "blogs/");
            finalValue = getS3Key(s3Url);
        } else {
            if (!value || !value.trim()) {
                await t.rollback();
                return res.status(400).json({ success: false, error: `Value required for type=${type}` });
            }
        }

        const item = await BlogItem.create(
            { id: uuidv4(), blogId, type, value: finalValue },
            { transaction: t }
        );

        await t.commit();
        return res.status(201).json({ success: true, item });
    } catch (err) {
        await t.rollback();
        console.error(" Add Blog Item Error:", err);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

exports.getBlogs = async (req, res) => {
  try {
    const { appId, query = "", page = 1, limit = 20 } = req.query;
    const loggedInUser = req.user;

    // Convert pagination to numbers
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    //  Block appUser
    if (loggedInUser.userType === "appUser") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    //  Build base filter
    const where = {};

    //  Handle search (case-insensitive for Postgres)
    if (query.trim()) {
      where[Op.or] = [
        { slug: { [Op.iLike]: `%${query}%` } },
        { title: { [Op.iLike]: `%${query}%` } },
      ];
    }

    //  Restrict by appId and permissions
    if (loggedInUser.userType === "appAdmin") {
      const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);

      if (appId) {
        // AppId provided — check access
        if (!adminAppIds.includes(appId)) {
          return res.status(403).json({
            success: false,
            error: "Not authorized to view blogs for this app",
          });
        }
        where.appId = appId;
      } else {
        // Otherwise restrict to all admin apps
        where.appId = adminAppIds;
      }
    } else if (appId) {
      where.appId = appId;
    }

    //  Fetch blogs with pagination
    const { count, rows: blogs } = await Blog.findAndCountAll({
      where,
      include: [
        {
          model: App,
          attributes: ["id", "name", "slug"],
        },
        {
          model: BlogItem,
          attributes: ["id", "type", "value"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset,
      distinct: true,
    });

    // 🖼 Transform blogs
    const blogsWithPreview = blogs.map((blog) => {
      const json = blog.toJSON();
      return {
        ...json,
        BlogItems: json.BlogItems || [],
      };
    });

    //  Paginated response
    const totalPages = Math.ceil(count / limitNum);

    res.json({
      success: true,
      currentPage: pageNum,
      totalPages,
      totalItems: count,
      limit: limitNum,
      data: blogsWithPreview,
    });
  } catch (err) {
    console.error(" Error fetching blogs:", err);
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
};


exports.getBlogWithItems = async (req, res) => {
    try {
        const { blogId } = req.params;
        const loggedInUser = req.user;

        const blog = await Blog.findByPk(blogId, {
            include: [
                {
                    model: BlogItem,
                    order: [["createdAt", "ASC"]],
                },
                {
                    model: App,
                    attributes: ["id", "name", "slug"],
                },
            ],
        });

        if (!blog) {
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        //  AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        //  AppAdmin can only access blogs of their apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to view this blog",
                });
            }
        }

        // 🖼 Convert image items to proxy URLs
        const jsonBlog = blog.toJSON();

        res.json({ success: true, data: jsonBlog });
    } catch (err) {
        console.error(" Error fetching blog with items:", err);
        res.status(500).json({ success: false, error: "Failed to fetch blog" });
    }
};

exports.updateBlog = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { blogId } = req.params;
        const { slug, title } = req.body;
        const loggedInUser = req.user;

        //  fetch blog inside transaction
        const blog = await Blog.findByPk(blogId, { transaction: t });
        if (!blog) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        //  AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        //  AppAdmin restriction
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                await t.rollback();
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to update this blog",
                });
            }
        }

        //  update fields inside transaction
        blog.slug = slug || blog.slug;
        blog.title = title || blog.title;
        await blog.save({ transaction: t });

        await t.commit();
        res.json({ success: true, data: blog });
    } catch (err) {
        await t.rollback();
        console.error(" Error updating blog:", err);
        res.status(500).json({ success: false, error: "Failed to update blog" });
    }
};

exports.deleteBlog = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { blogId } = req.params;
        const loggedInUser = req.user;

        const blog = await Blog.findByPk(blogId, { include: [BlogItem], transaction: t });
        if (!blog) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                await t.rollback();
                return res.status(403).json({ success: false, error: "Not authorized" });
            }
        }

        for (const item of blog.BlogItems) {
            if (item.type === "image" && item.value) {
                await deleteFromS3(item.value); // external, cannot rollback
            }
            await item.destroy({ transaction: t });
        }

        await blog.destroy({ transaction: t });
        await t.commit();

        res.json({ success: true, message: "Blog deleted successfully" });
    } catch (err) {
        await t.rollback();
        console.error(" Error deleting blog:", err);
        res.status(500).json({ success: false, error: "Failed to delete blog" });
    }
};

exports.updateBlogItem = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { itemId } = req.params;
        const { type, value } = req.body;
        const loggedInUser = req.user;

        const item = await BlogItem.findByPk(itemId, { include: [Blog], transaction: t });
        if (!item) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Blog item not found" });
        }

        const blog = item.Blog;

        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                await t.rollback();
                return res.status(403).json({ success: false, error: "Not authorized" });
            }
        }

        if (type && !["heading", "description", "image"].includes(type)) {
            await t.rollback();
            return res.status(400).json({ success: false, error: "Invalid type" });
        }

        if (type) item.type = type;

        if (item.type === "image") {
            if (req.file) {
                if (item.value) {
                    await deleteFromS3(item.value);
                }
                const s3Url = await uploadToS3(req.file, "blogs/");
                item.value = getS3Key(s3Url);
            }
        } else {
            if (value && value.trim()) {
                item.value = value;
            }
        }

        await item.save({ transaction: t });
        await t.commit();

        res.json({ success: true, data: item });
    } catch (err) {
        await t.rollback();
        console.error(" Error updating blog item:", err);
        res.status(500).json({ success: false, error: "Failed to update blog item" });
    }
};


exports.deleteBlogItem = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { itemId } = req.params;
        const loggedInUser = req.user;

        const item = await BlogItem.findByPk(itemId, { include: [Blog], transaction: t });
        if (!item) {
            await t.rollback();
            return res.status(404).json({ success: false, error: "Blog item not found" });
        }

        const blog = item.Blog;

        if (loggedInUser.userType === "appUser") {
            await t.rollback();
            return res.status(403).json({ success: false, error: "Not authorized" });
        }
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                await t.rollback();
                return res.status(403).json({ success: false, error: "Not authorized" });
            }
        }

        if (item.type === "image" && item.value) {
            await deleteFromS3(item.value); // cannot rollback external
        }

        await item.destroy({ transaction: t });
        await t.commit();

        res.json({ success: true, message: "Blog item deleted successfully" });
    } catch (err) {
        await t.rollback();
        console.error(" Error deleting blog item:", err);
        res.status(500).json({ success: false, error: "Failed to delete blog item" });
    }
};