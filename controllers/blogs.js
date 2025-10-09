const { Blog, BlogItem, App } = require("../utils/db").loadModels();

const makeProxyUrl = (req, item) => {
    const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;
    return `${baseUrl}/api/v1/files/blogs/${item}/image`;
};

exports.getBlogs = async (req, res) => {
  try {
    const { slug } = req.params;
    let { page = 1, limit = 20 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    const offset = (page - 1) * limit;

    // Find the app first by slug
    const app = await App.findOne({ where: { slug } });
    if (!app) {
      return res.status(404).json({ success: false, error: "App not found" });
    }

    // Fetch blogs for this app with pagination
    const { rows, count } = await Blog.findAndCountAll({
      where: { appId: app.id },
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
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    // 🖼 Convert image items to proxy URLs
    const blogs = rows.map((blog) => {
      const json = blog.toJSON();
      const BlogItems = json.BlogItems
      return { ...json, BlogItems };
    });

    res.json({
      success: true,
      data: blogs,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (err) {
    console.error("❌ Error fetching blogs:", err);
    res.status(500).json({ success: false, error: "Failed to fetch blogs" });
  }
};

exports.getBlogWithItems = async (req, res) => {
  try {
    const { blogId } = req.params;

    const blog = await Blog.findByPk(blogId, {
      include: [
        { model: BlogItem,  order: [["createdAt", "ASC"]] },
        { model: App, attributes: ["id", "name", "slug"] },
      ],
    });

    if (!blog) return res.status(404).json({ success: false, error: "Blog not found" });

    // 🖼️ Convert image items to proxy URLs
    const BlogItems = blog.BlogItems

    res.json({ success: true, data: { ...blog.toJSON(), BlogItems } });
  } catch (err) {
    console.error("❌ Error fetching blog with items:", err);
    res.status(500).json({ success: false, error: "Failed to fetch blog" });
  }
};