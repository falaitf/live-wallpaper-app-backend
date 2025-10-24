const { 
  BatteryCategory, 
  BatteryAnimation, 
  BatteryAnimationCategory, 
  sequelize 
} = require("../../../utils/db").loadModels();

const cache = require("../../../utils/cache");
const { deleteFromS3, getS3Key } = require("../../../utils/uploadToS3");
const { Op } = require("sequelize");

//  Helper to clear cache
function clearBatteryCategoryCache() {
  try {
    const keys = cache.keys();

    if (keys && keys.length > 0) {
      keys.forEach((key) => cache.del(key));
      console.log(`🧹 Cleared ${keys.length} battery category cache keys`);
    } else {
      console.log("🧹 No battery category cache keys to clear");
    }
  } catch (err) {
    console.error("❌ Error clearing battery category cache:", err);
  }
}

const addBatteryCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name)
      return res.status(400).json({ error: "Category name is required" });

    const alphaRegex = /^[A-Za-z\s]+$/;
    if (!alphaRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message:
          "Name must contain only alphabetic characters and spaces",
      });
    }

    //  ensure model is defined before using
    if (!BatteryCategory) {
      console.error("BatteryCategory model not found or not imported correctly");
      return res.status(500).json({ error: "Model not initialized" });
    }

    const existing = await BatteryCategory.findOne({ where: { name } });
    if (existing)
      return res.status(400).json({ error: "Category already exists" });

    const category = await BatteryCategory.create({ name });

    if (typeof clearBatteryCategoryCache === "function") {
      clearBatteryCategoryCache();
    }

    res.status(201).json(category);
  } catch (err) {
    console.error("Error adding battery category:", err);
    res.status(500).json({ error: "Server error" });
  }
};

//  Get all battery categories (with pagination + search)
const getBatteryCategories = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.query?.trim() || "";

    const offset = (page - 1) * limit;
    const cacheKey = `battery_categories_${page}_${limit}_${search}`;

    const cachedCategories = cache.get(cacheKey);
    if (cachedCategories) {
      console.log("📦 Battery categories cache hit");
      return res.json(cachedCategories);
    }

    const whereClause = search
      ? { name: { [Op.iLike]: `%${search}%` } }
      : {};

    const { count, rows: categories } = await BatteryCategory.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);
    const response = {
      currentPage: page,
      totalPages,
      totalItems: count,
      limit,
      data: categories,
    };

    cache.set(cacheKey, response, 86400); // 24 hours
    console.log("💾 Battery categories cache saved");

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};

//  Get single battery category by ID
const getBatteryCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }

    const category = await BatteryCategory.findOne({ where: { id } });

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
    console.error("❌ Error fetching battery category:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching category",
    });
  }
};

//  Update battery category
const updateBatteryCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Category name is required" });

    const alphaRegex = /^[A-Za-z\s]+$/;
    if (!alphaRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: "Name must contain only alphabetic characters and spaces",
      });
    }

    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }

    const category = await BatteryCategory.findByPk(id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    //  Check for existing name before update
    const existingCategory = await BatteryCategory.findOne({ where: { name } });
    if (existingCategory && existingCategory.id !== parseInt(id)) {
      return res.status(400).json({ error: "Category name already exists" });
    }

    category.name = name;
    await category.save();

    clearBatteryCategoryCache();

    res.json({ success: true, category });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};


//  Delete category and related animations
const deleteBatteryCategory = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;
    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }

    // Step 1: Find category
    const category = await BatteryCategory.findByPk(id, { transaction });
    if (!category) {
      await transaction.rollback();
      return res.status(404).json({ error: "Category not found" });
    }

    // Step 2: Find all linked animations
    const links = await BatteryAnimationCategory.findAll({
      where: { categoryId: id },
      transaction
    });

    const animationIds = links.map(link => link.animationId);

    if (animationIds.length > 0) {
      const animations = await BatteryAnimation.findAll({
        where: { id: animationIds },
        transaction
      });

      // Step 3: Delete files and DB records
      for (const animation of animations) {
        const filesToDelete = [];
        if (animation.url) filesToDelete.push(animation.url);
        if (animation.thumbnail) filesToDelete.push(animation.thumbnail);
        if (animation.gif) filesToDelete.push(animation.gif);

        await Promise.all(filesToDelete.map(fileKey => deleteFromS3(fileKey)));
        await animation.destroy({ transaction });
      }

      // Step 4: Remove links
      await BatteryAnimationCategory.destroy({
        where: { categoryId: id },
        transaction
      });
    }

    // Step 5: Delete category
    await category.destroy({ transaction });

    await transaction.commit();
    clearBatteryCategoryCache();

    res.json({ message: "Category and related battery animations deleted successfully" });
  } catch (err) {
    await transaction.rollback();
    console.error("❌ Error deleting battery category:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  addBatteryCategory,
  getBatteryCategories,
  getBatteryCategoryById,
  updateBatteryCategory,
  deleteBatteryCategory
};
