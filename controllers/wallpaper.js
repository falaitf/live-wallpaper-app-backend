const { Wallpaper, Category } = require("../utils/db").loadModels();
const { Op, Sequelize } = require("sequelize");
const cache = require("../utils/cache");

exports.getAllVideos = async (req, res) => {
    try {
        let { page = 1, limit = 20 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Use cache key per page/limit combination
        const cacheKey = `allVideos_${page}_${limit}`;
        const cached = cache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const { count, rows } = await Wallpaper.findAndCountAll({
            include: [{ model: Category, as: "categories" }],
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            distinct: true,
        });

        const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

        const videos = rows.map((w) => ({
            id: w.id,
            category: w.categories?.[0]?.name || null,
            title: w.title,
            url: w.url ? w.url : null,
            thumbnail: w.thumbnail ? w.thumbnail : null,
            gif: w.gif ? w.gif : null,
            type: w.type,
            isPremium: w.isPremium
        }));


        const response = { page, limit, total: count, videos };

        // Store in cache
        cache.set(cacheKey, response);

        res.json(response);
    } catch (err) {
        console.error("❌ Error fetching videos:", err);
        res.status(500).json({ success: false, message: "Failed to fetch videos" });
    }
};

exports.getVideosByCategory = async (req, res) => {
    try {
        const { categoryName } = req.params;
        let { page = 1, limit = 20 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const cacheKey = `videosByCat_${categoryName}_${page}_${limit}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const category = await Category.findOne({ where: { name: categoryName } });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

        const { count, rows } = await Wallpaper.findAndCountAll({
            include: [
                {
                    model: Category,
                    as: "categories",
                    where: { id: category.id },
                },
            ],
            limit,
            offset,
            order: [["createdAt", "DESC"]],
        });

        const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

        const videos = rows.map((w) => ({
            id: w.id,
            category: w.categories?.[0]?.name || null,
            title: w.title,
            url: w.url ? w.url : null,
            thumbnail: w.thumbnail ? w.thumbnail : null,
            gif: w.gif ? w.gif : null,
            type: w.type,
            isPremium: w.isPremium
        }));

        const response = { page, limit, total: count, videos };
        cache.set(cacheKey, response);

        res.json(response);
    } catch (err) {
        console.error("❌ Error fetching videos by category:", err);
        res.status(500).json({ success: false, message: "Failed to fetch videos by category" });
    }
};

exports.getCategoriesWithWallpapers = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    // ✅ Cache key per page/limit
    const cacheKey = `categoriesWithWallpapers_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    // ✅ Fetch paginated categories
    const { count, rows: categories } = await Category.findAndCountAll({
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Wallpaper,
          as: "wallpapers",
          attributes: ["id", "title", "url", "thumbnail", "gif", "type", "isPremium"],
        },
      ],
      distinct: true,
    });

    // ✅ Prepare response
    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      totalWallpapers: cat.wallpapers?.length || 0,
      wallpapers: cat.wallpapers?.map((w) => ({
        id: w.id,
        title: w.title,
        url: w.url || null,
        thumbnail: w.thumbnail || null,
        gif: w.gif || null,
        type: w.type,
        isPremium: w.isPremium
      })),
    }));

    const response = {
      page,
      limit,
      totalCategories: count,
      categories: formatted,
    };

    // ✅ Cache response
    cache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching categories with wallpapers:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch categories with wallpapers" });
  }
};

exports.searchVideos = async (req, res) => {
    try {
        let { query, page = 1, limit = 20 } = req.query;

        if (!query) {
            return res.status(400).json({ message: "Search query is required" });
        }

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        var { count, rows } = await Wallpaper.findAndCountAll({
            include: [
                {
                    model: Category,
                    as: "categories",
                    through: { attributes: [] },
                    required: false, // LEFT JOIN
                },
            ],
            distinct: true, // ensure correct count with joins
            limit,
            offset,
            order: [["createdAt", "DESC"]],
        });

        // filter again if query should match categories
        if (query) {
            rows = rows.filter(wp =>
                wp.title.toLowerCase().includes(query.toLowerCase()) ||
                wp.categories.some(cat => cat.name.toLowerCase().includes(query.toLowerCase()))
            );
            count = rows.length;
        }

        // If no results found in categories, search again only in title
        if (rows.length === 0) {
            const fallback = await Wallpaper.findAndCountAll({
                where: {
                    title: { [Op.iLike]: `%${query}%` },
                },
                include: [
                    {
                        model: Category,
                        as: "categories",
                        through: { attributes: [] },
                        required: false,
                    },
                ],
                distinct: true,
                limit,
                offset,
                order: [["createdAt", "DESC"]],
            });

            const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

            return res.json({
                success: true,
                total: fallback.count,
                page,
                limit,
                wallpapers: fallback.rows.map((w) => ({
                    id: w.id,
                    title: w.title,
                    url: w.url ? w.url : null,
                    thumbnail: w.thumbnail ? w.thumbnail : null,
                    gif: w.gif ? w.gif : null,
                    type: w.type,
                    status: w.status,
                    isPremium: w.isPremium,
                    categories: w.categories.map((c) => c.name),
                })),
            });
        }

        const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

        res.json({
            success: true,
            total: count,
            page,
            limit,
            wallpapers: rows.map((w) => ({
                id: w.id,
                title: w.title,
                url: w.url ? w.url : null,
                thumbnail: w.thumbnail ? w.thumbnail : null,
                gif: w.gif ? w.gif : null,
                type: w.type,
                category: w.categories?.[0]?.name || null, 
                isPremium: w.isPremium
            })),
        });
    } catch (error) {
        console.error("❌ Error searching videos:", error);
        res.status(500).json({ success: false, message: "Error searching videos" });
    }
};

