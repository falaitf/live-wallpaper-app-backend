const { BatteryCategory } = require("../utils/db").loadModels();
const cache = require("../utils/cache");

const getBatteryCategories = async (req, res) => {
  try {
    // 1️⃣ Check cache
    const cached = cache.get("batteryCategories");
    if (cached) {
      console.log("📦 Battery categories cache hit");
      return res.json(cached);
    }

    // 2️⃣ Fetch from DB
    const categories = await BatteryCategory.findAll({
      order: [["createdAt", "DESC"]],
    });

    // 3️⃣ Save to cache (24h TTL)
    cache.set("batteryCategories", categories, 86400);
    console.log("💾 Battery categories cache saved");

    res.json(categories);
  } catch (err) {
    console.error("❌ Error fetching battery categories:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getBatteryCategories,
};
