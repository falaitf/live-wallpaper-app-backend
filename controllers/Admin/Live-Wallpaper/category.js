const { Category, Wallpaper, WallpaperCategory, sequelize } = require("../../../utils/db").loadModels();
const cache = require("../../../utils/cache");
const { deleteFromS3, getS3Key } = require("../../../utils/uploadToS3");
const { Op } = require("sequelize");

function clearCategoryCache() {
  try {
    const keys = cache.keys();

    if (keys && keys.length > 0) {
      keys.forEach((key) => cache.del(key));
      console.log(`🧹 Cleared ${keys.length} cache keys`);
    } else {
      console.log("🧹 No cache keys to clear");
    }
  } catch (err) {
    console.error("❌ Error clearing cache:", err);
  }
}

// Add new category
const addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Category name is required" });
    const alphaRegex = /^[A-Za-z\s]+$/;
    if (!alphaRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: "Name must contain only alphabetic characters and spaces",
      });
    }

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
    const search = req.query.query?.trim() || ""; //  use "search" not "query"

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
      order: [["sortOrder", "DESC"]],
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
    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }

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

    //  Validate ID first
    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }

    //  Validate name presence
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    //  Validate name characters
    const alphaRegex = /^[A-Za-z\s]+$/;
    if (!alphaRegex.test(name)) {
      return res.status(400).json({
        success: false,
        message: "Name must contain only alphabetic characters and spaces",
      });
    }

    //  Find existing category
    const category = await Category.findByPk(id);
    if (!category) return res.status(404).json({ error: "Category not found" });

    //  Check for duplicate name (excluding current ID)
    const existingCategory = await Category.findOne({ where: { name } });
    if (existingCategory && existingCategory.id !== parseInt(id)) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists",
      });
    }

    //  Update and save
    category.name = name.trim();
    await category.save();

    clearCategoryCache();

    return res.json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (err) {
    console.error("❌ Error updating category:", err);
    res.status(500).json({ error: "Server error" });
  }
};


const deleteCategory = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { id } = req.params;

    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID. It must be a positive integer.",
      });
    }


    //  Step 1: Find the category
    const category = await Category.findByPk(id, { transaction });
    if (!category) {
      await transaction.rollback();
      return res.status(404).json({ error: "Category not found" });
    }

    //  Step 2: Find all wallpaper links for this category
    const wallpaperLinks = await WallpaperCategory.findAll({
      where: { categoryId: id },
      transaction
    });

    // Extract wallpaper IDs
    const wallpaperIds = wallpaperLinks.map(link => link.wallpaperId);

    if (wallpaperIds.length > 0) {
      //  Step 3: Fetch all related wallpapers
      const wallpapers = await Wallpaper.findAll({
        where: { id: wallpaperIds },
        transaction
      });

      //  Step 4: Delete related wallpaper files and records
      for (const wallpaper of wallpapers) {
        const filesToDelete = [];

        if (wallpaper.url) filesToDelete.push(wallpaper.url);
        if (wallpaper.thumbnail) filesToDelete.push(wallpaper.thumbnail);
        if (wallpaper.gif) filesToDelete.push(wallpaper.gif);

        // Delete files from S3 (non-transactional)
        await Promise.all(filesToDelete.map(fileKey => deleteFromS3(fileKey)));

        // Delete wallpaper record (transactional)
        await wallpaper.destroy({ transaction });
      }

      //  Step 5: Delete category links
      await WallpaperCategory.destroy({
        where: { categoryId: id },
        transaction
      });
    }

    //  Step 6: Delete category itself
    await category.destroy({ transaction });

    //  Step 7: Commit transaction
    await transaction.commit();

    //  Step 8: Clear cache (after successful commit)
    clearCategoryCache();

    res.json({ message: "Category and related wallpapers deleted successfully" });
  } catch (err) {
    // Rollback if any error occurs
    await transaction.rollback();
    console.error("❌ Error deleting category and wallpapers:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const updateSortOrder = async (req, res) => {
  try {
    const { categories } = req.body; 

    for (const update of categories) {
      const movedCategory = await Category.findByPk(update.id);
      if (!movedCategory) continue;

      const oldOrder = movedCategory.sortOrder;
      const newOrder = update.sortOrder;

      if (oldOrder === newOrder) continue;

      // Moving DOWN (e.g., 8 → 13)
      if (oldOrder < newOrder) {
        await Category.increment(
          { sortOrder: -1 },
          {
            where: {
              sortOrder: { [Op.between]: [oldOrder + 1, newOrder] },
            },
          }
        );
      }
      // Moving UP (e.g., 13 → 8)
      else {
        await Category.increment(
          { sortOrder: 1 },
          {
            where: {
              sortOrder: { [Op.between]: [newOrder, oldOrder - 1] },
            },
          }
        );
      }

      // Finally, update the moved category to the new sortOrder
      await Category.update(
        { sortOrder: newOrder },
        { where: { id: update.id } }
      );
    }

    clearCategoryCache();

    return res.status(200).json({
      success: true,
      message: "Category order updated successfully",
    });
  } catch (error) {
    console.error("Error updating sort order:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports = {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoryById,
  updateSortOrder
};
