const { BatteryAnimation, BatteryCategory } = require("../utils/db").loadModels();
const { Op, Sequelize } = require("sequelize");
const cache = require("../utils/cache");

exports.getAllBatteryAnimations = async (req, res) => {
  try {
    let { page = 1, limit = 20 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const cacheKey = `allBatteryAnimations_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const { count, rows } = await BatteryAnimation.findAndCountAll({
      include: [{ model: BatteryCategory, as: "categories" }],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      distinct: true,
    });

    const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

    const animations = rows.map((a) => ({
      id: a.id,
      category: a.categories?.[0]?.name || null,
      title: a.title,
      url: a.url || null,
      thumbnail: a.thumbnail || null,
      gif: a.gif || null,
      type: a.type,
      isPremium: a.isPremium,
    }));

    const response = { page, limit, total: count, animations };
    cache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching battery animations:", err);
    res.status(500).json({ success: false, message: "Failed to fetch battery animations" });
  }
};

exports.getBatteryAnimationsByCategory = async (req, res) => {
  try {
    const { categoryName } = req.params;
    let { page = 1, limit = 20 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const cacheKey = `batteryAnimationsByCat_${categoryName}_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const category = await BatteryCategory.findOne({ where: { name: categoryName } });
    if (!category)
      return res.status(404).json({ success: false, message: "Category not found" });

    const { count, rows } = await BatteryAnimation.findAndCountAll({
      include: [
        {
          model: BatteryCategory,
          as: "categories",
          where: { id: category.id },
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const animations = rows.map((a) => ({
      id: a.id,
      category: a.categories?.[0]?.name || null,
      title: a.title,
      url: a.url || null,
      thumbnail: a.thumbnail || null,
      gif: a.gif || null,
      type: a.type,
      isPremium: a.isPremium,
    }));

    const response = { page, limit, total: count, animations };
    cache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching battery animations by category:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch battery animations by category" });
  }
};

exports.getBatteryCategoriesWithAnimations = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const cacheKey = `batteryCategoriesWithAnimations_${page}_${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const { count, rows: categories } = await BatteryCategory.findAndCountAll({
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: BatteryAnimation,
          as: "animations",
          attributes: ["id", "title", "url", "thumbnail", "gif", "type", "isPremium"],
        },
      ],
      distinct: true,
    });

    categories.forEach((cat) => {
      cat.animations.sort((a, b) => b.id - a.id);
    });

    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      totalAnimations: cat.animations?.length || 0,
      animations: cat.animations.map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url || null,
        thumbnail: a.thumbnail || null,
        gif: a.gif || null,
        type: a.type,
        isPremium: a.isPremium,
      })),
    }));

    const response = {
      page,
      limit,
      totalCategories: count,
      categories: formatted,
    };

    cache.set(cacheKey, response);
    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching battery categories with animations:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch battery categories with animations" });
  }
};

exports.searchBatteryAnimations = async (req, res) => {
  try {
    let { query, page = 1, limit = 20 } = req.query;

    if (!query)
      return res.status(400).json({ message: "Search query is required" });

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    var { count, rows } = await BatteryAnimation.findAndCountAll({
      include: [
        {
          model: BatteryCategory,
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

    // Filter by title or category
    rows = rows.filter(
      (a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.categories.some((cat) =>
          cat.name.toLowerCase().includes(query.toLowerCase())
        )
    );
    count = rows.length;

    // Fallback to title-only search if no matches
    if (rows.length === 0) {
      const fallback = await BatteryAnimation.findAndCountAll({
        where: {
          title: { [Op.like]: `%${query}%` }, // use iLike if using PostgreSQL
        },
        include: [
          {
            model: BatteryCategory,
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

      return res.json({
        success: true,
        total: fallback.count,
        page,
        limit,
        animations: fallback.rows.map((a) => ({
          id: a.id,
          title: a.title,
          url: a.url || null,
          thumbnail: a.thumbnail || null,
          gif: a.gif || null,
          type: a.type,
          status: a.status,
          isPremium: a.isPremium,
          categories: a.categories.map((c) => c.name),
        })),
      });
    }

    res.json({
      success: true,
      total: count,
      page,
      limit,
      animations: rows.map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url || null,
        thumbnail: a.thumbnail || null,
        gif: a.gif || null,
        type: a.type,
        category: a.categories?.[0]?.name || null,
        isPremium: a.isPremium,
      })),
    });
  } catch (error) {
    console.error("❌ Error searching battery animations:", error);
    res
      .status(500)
      .json({ success: false, message: "Error searching battery animations" });
  }
};
