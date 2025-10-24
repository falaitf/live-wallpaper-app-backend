const { Category } = require("../utils/db").loadModels();
const cache = require("../utils/cache");

const getCategories = async (req, res) => {
  try {
    //  Check cache
    const cachedCategories = cache.get("categories");
    if (cachedCategories) {
      console.log("📦 Categories cache hit");
      return res.json(cachedCategories);
    }

    //  Fetch from DB
    const categories = await Category.findAll({ order: [["createdAt", "DESC"]] });

    //  Save to cache
    cache.set("categories", categories, 86400); // 24 hours TTL
    console.log(" Categories cache saved");

    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getCategories,
};
