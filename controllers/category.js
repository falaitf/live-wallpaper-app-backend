const { Category } = require("../utils/db").loadModels();
const cache = require("../utils/cache");

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
    cache.set("categories", categories, 86400); // 24 hours TTL
    console.log("💾 Categories cache saved");

    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getCategories,
};
