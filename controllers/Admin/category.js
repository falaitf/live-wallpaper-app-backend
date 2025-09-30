const { Category } = require("../../utils/db").loadModels();
const cache = require("../../utils/cache");

// Add new category
const addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Category name is required" });

    const existing = await Category.findOne({ where: { name } });
    if (existing) return res.status(400).json({ error: "Category already exists" });

    const category = await Category.create({ name });

    cache.del("categories");

    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

const getCategories = async (req, res) => {
  try {
    // 1️⃣ Check cache
    const cachedCategories = cache.get("categories");
    if (cachedCategories) {
      console.log("📦 Categories cache hit");
      return res.json(cachedCategories);
    }

    // 2️⃣ Fetch from DB
    const categories = await Category.findAll({ order: [["createdAt", "DESC"]] });

    // 3️⃣ Save to cache
    cache.set("categories", categories, 86400); // 24 hour TTL
    console.log("💾 Categories cache saved");

    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
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

    cache.del("categories");

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

    cache.del("categories");

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
};
