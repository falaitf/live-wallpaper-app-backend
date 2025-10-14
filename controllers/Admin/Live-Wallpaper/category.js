const { Category } = require("../../../utils/db").loadModels();
const cache = require("../../../utils/cache");
const { Op } = require("sequelize");

function clearCategoryCache() {
  const keys = cache.keys();
  keys.forEach((key) => {
    if (key.startsWith("categories_")) {
      cache.del(key);
    }
  });
  console.log("🧹 Cleared all category-related cache entries");
}

// Add new category
const addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const existing = await Category.findOne({ where: { name } });
    if (existing) return res.status(400).json({ error: "Category already exists" });

    const category = await Category.create({ name });

    clearCategoryCache();

    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const getCategories = async (req, res) => {
  try {
    // 🔹 Extract query params with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.query?.trim() || ""; // ✅ use "search" not "query"

    console.log("Incoming query params:", req.query);

    // 🔹 Calculate offset for pagination
    const offset = (page - 1) * limit;

    // 🔹 Generate cache key (based on page & search)
    const cacheKey = `categories_${page}_${limit}_${search}`;

    // 1️⃣ Check cache
    const cachedCategories = cache.get(cacheKey);
    if (cachedCategories) {
      console.log("📦 Categories cache hit");
      return res.json(cachedCategories);
    }

    // 2️⃣ Build query filters
    const whereClause = search
      ? {
        name: {
          [Op.iLike]: `%${search}%`, // match substring
        },
      }
      : {};

    // 3️⃣ Fetch from DB with pagination & search
    const { count, rows: categories } = await Category.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // 4️⃣ Prepare paginated response
    const totalPages = Math.ceil(count / limit);
    const response = {
      currentPage: page,
      totalPages,
      totalItems: count,
      limit,
      data: categories,
    };

    // 5️⃣ Save to cache
    cache.set(cacheKey, response, 86400); // 24 hours
    console.log("💾 Categories cache saved");

    // 6️⃣ Send response
    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch category by ID
    const category = await Category.findOne({
      where: { id },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      category,
    });
  } catch (error) {
    console.error("❌ Error fetching category:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching category",
    });
  }
};

// Update category
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const category = await Category.findByPk(id);
    if (!category) return res.status(404).json({ error: "Category not found" });
    if (!name) return res.status(400).json({ error: "Category name is required" });

    category.name = name || category.name;
    await category.save();

    clearCategoryCache();

    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

// Delete category
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    await category.destroy();

    clearCategoryCache();

    res.json({ message: "Category deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoryById
};
