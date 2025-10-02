const { Blog, BlogItem, App } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3");
const { v4: uuidv4 } = require("uuid");

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
    try {
        const { slug, title, appId } = req.body;
        const loggedInUser = req.user;

        // App User not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // AppAdmin can only add blog for their own apps
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to add blog for this app",
                });
            }
        }

        // Ensure app exists
        const app = await App.findByPk(appId);
        if (!app) {
            return res.status(404).json({ success: false, error: "App not found" });
        }

        const blog = await Blog.create({
            slug,
            title,
            appId,
        });

        res.status(201).json({ success: true, data: blog });
    } catch (err) {
        console.error("❌ Error creating blog:", err);
        res.status(500).json({ success: false, error: "Failed to create blog" });
    }
};

exports.addBlogItem = async (req, res) => {
    try {
        const { blogId, type, value } = req.body;
        const loggedInUser = req.user;

        // Validate required fields
        if (!blogId || !type) {
            return res.status(400).json({
                success: false,
                error: "blogId and type are required",
            });
        }

        // Validate type
        if (!["heading", "description", "image"].includes(type)) {
            return res.status(400).json({
                success: false,
                error: "Invalid type. Must be heading, description, or image",
            });
        }

        // ✅ Ensure blog exists
        const blog = await Blog.findByPk(blogId);
        if (!blog) {
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        // ✅ Authorization check
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to add blog item for this app",
                });
            }
        }

        // ✅ Handle value or upload image
        let finalValue = value;
        if (type === "image") {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Image file is required for type=image",
                });
            }
            const s3Url = await uploadToS3(req.file, "blogs/");
            finalValue = getS3Key(s3Url);
        } else {
            if (!value || !value.trim()) {
                return res.status(400).json({
                    success: false,
                    error: `Value is required for type=${type}`,
                });
            }
        }

        // ✅ Create BlogItem
        const item = await BlogItem.create({
            id: uuidv4(),
            blogId,
            type,
            value: finalValue,
        });

        return res.status(201).json({ success: true, item });
    } catch (err) {
        console.error("❌ Add Blog Item Error:", err);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

exports.getBlogs = async (req, res) => {
    try {
        const { appId } = req.query;
        const loggedInUser = req.user;

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ If appAdmin, restrict to their apps
        const where = {};
        if (appId) where.appId = appId;

        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (appId && !adminAppIds.includes(appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to view blogs for this app",
                });
            }
            // restrict query to only apps admin has
            where.appId = adminAppIds;
        }

        const blogs = await Blog.findAll({
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
        });

        // 🖼 Add proxy URL for image items (e.g., preview)
        const blogsWithPreview = blogs.map((blog) => {
            const json = blog.toJSON();

            // transform BlogItems so image.value becomes proxy URL
            const items = json.BlogItems?.map((item) => {
                if (item.type === "image") {
                    return {
                        ...item,
                        value: makeProxyUrl(req, item.id),
                    };
                }
                return item;
            });

            return {
                ...json,
                BlogItems: items,
            };
        });


        res.json({ success: true, data: blogsWithPreview });
    } catch (err) {
        console.error("❌ Error fetching blogs:", err);
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

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ AppAdmin can only access blogs of their apps
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
        jsonBlog.BlogItems = jsonBlog.BlogItems.map((item) => ({
            ...item,
            value: item.type === "image" ? makeProxyUrl(req, item.id) : item.value,
        }));

        res.json({ success: true, data: jsonBlog });
    } catch (err) {
        console.error("❌ Error fetching blog with items:", err);
        res.status(500).json({ success: false, error: "Failed to fetch blog" });
    }
};

exports.updateBlog = async (req, res) => {
    try {
        const { blogId } = req.params;
        const { slug, title } = req.body;
        const loggedInUser = req.user;

        const blog = await Blog.findByPk(blogId);
        if (!blog) {
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ AppAdmin restriction
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to update this blog",
                });
            }
        }

        blog.slug = slug || blog.slug;
        blog.title = title || blog.title;
        await blog.save();

        res.json({ success: true, data: blog });
    } catch (err) {
        console.error("❌ Error updating blog:", err);
        res.status(500).json({ success: false, error: "Failed to update blog" });
    }
};

exports.deleteBlog = async (req, res) => {
    try {
        const { blogId } = req.params;
        const loggedInUser = req.user;

        const blog = await Blog.findByPk(blogId, { include: [BlogItem] });
        if (!blog) {
            return res.status(404).json({ success: false, error: "Blog not found" });
        }

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ AppAdmin restriction
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to delete this blog",
                });
            }
        }

        // 🗑️ Delete blog items + S3 images
        for (const item of blog.BlogItems) {
            if (item.type === "image" && item.value) {
                await deleteFromS3(item.value);
            }
            await item.destroy();
        }

        await blog.destroy();

        res.json({ success: true, message: "Blog deleted successfully" });
    } catch (err) {
        console.error("❌ Error deleting blog:", err);
        res.status(500).json({ success: false, error: "Failed to delete blog" });
    }
};

exports.updateBlogItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { type, value } = req.body;
        const loggedInUser = req.user;

        const item = await BlogItem.findByPk(itemId, { include: [Blog] });
        if (!item) {
            return res.status(404).json({ success: false, error: "Blog item not found" });
        }

        const blog = item.Blog;

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ AppAdmin restriction
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to update this blog item",
                });
            }
        }

        // Handle updates
        if (type && !["heading", "description", "image"].includes(type)) {
            return res.status(400).json({
                success: false,
                error: "Invalid type. Must be heading, description, or image",
            });
        }

        if (type) item.type = type;

        if (item.type === "image") {
            if (req.file) {
                // delete old image
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

        await item.save();

        res.json({ success: true, data: item });
    } catch (err) {
        console.error("❌ Error updating blog item:", err);
        res.status(500).json({ success: false, error: "Failed to update blog item" });
    }
};

exports.deleteBlogItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const loggedInUser = req.user;

        const item = await BlogItem.findByPk(itemId, { include: [Blog] });
        if (!item) {
            return res.status(404).json({ success: false, error: "Blog item not found" });
        }

        const blog = item.Blog;

        // ❌ AppUser not allowed
        if (loggedInUser.userType === "appUser") {
            return res.status(403).json({ success: false, error: "Not authorized" });
        }

        // ✅ AppAdmin restriction
        if (loggedInUser.userType === "appAdmin") {
            const adminAppIds = loggedInUser.permissions.map((p) => p.app.id);
            if (!adminAppIds.includes(blog.appId)) {
                return res.status(403).json({
                    success: false,
                    error: "Not authorized to delete this blog item",
                });
            }
        }

        if (item.type === "image" && item.value) {
            await deleteFromS3(item.value);
        }

        await item.destroy();

        res.json({ success: true, message: "Blog item deleted successfully" });
    } catch (err) {
        console.error("❌ Error deleting blog item:", err);
        res.status(500).json({ success: false, error: "Failed to delete blog item" });
    }
};