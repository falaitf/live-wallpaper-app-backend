const { BatteryAnimation, BatteryCategory, sequelize } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3ForBattery");
const { Op, Sequelize } = require("sequelize");
const cache = require("../../../utils/cache");

//  Create Battery Animation
exports.createBatteryAnimation = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { title, type, categoryIds, isPremium } = req.body;
        const { video, thumbnail, gif } = req.files || {};

        //  Step 1: Validate required fields
        if (!title || !type || !categoryIds) {
            await transaction.rollback();
            return res
                .status(400)
                .json({ success: false, message: "Title, type, and categoryIds are required" });
        }

        const alphaRegex = /^[A-Za-z\s]+$/;
        if (!alphaRegex.test(title)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Title must contain only alphabetic characters and spaces",
            });
        }

        //  Step 2: Handle uploaded files
        const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
        const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
        const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

        if (!videoFile || !thumbnailFile) {
            await transaction.rollback();
            return res
                .status(400)
                .json({ success: false, message: "Video and thumbnail are required" });
        }

        //  Step 3: Validate file types
        if (!videoFile.mimetype.startsWith("video/")) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid video file type. Only video formats are allowed",
            });
        }

        const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedImageTypes.includes(thumbnailFile.mimetype)) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid thumbnail file type. Only JPG, PNG, or WEBP images are allowed",
            });
        }

        if (gifFile && gifFile.mimetype !== "image/gif") {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid GIF file type. Only .gif format is allowed",
            });
        }

        //  Step 4: Validate file sizes
        const maxVideoSize = 20 * 1024 * 1024; // 20MB
        const maxImageSize = 3 * 1024 * 1024; // 3MB

        if (videoFile.size > maxVideoSize) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Video exceeds 20MB limit" });
        }

        if (thumbnailFile.size > maxImageSize) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "Thumbnail exceeds 3MB limit" });
        }

        if (gifFile && gifFile.size > maxImageSize) {
            await transaction.rollback();
            return res.status(400).json({ success: false, message: "GIF exceeds 3MB limit" });
        }

        //  Step 5: Parse and validate categories
        let parsedIds = categoryIds;
        if (typeof categoryIds === "string") {
            try {
                parsedIds = JSON.parse(categoryIds);
            } catch {
                parsedIds = [categoryIds];
            }
        }
        if (!Array.isArray(parsedIds)) parsedIds = [parsedIds];

        const categories = await BatteryCategory.findAll({
            where: { id: { [Op.in]: parsedIds } },
            transaction,
        });

        if (categories.length !== parsedIds.length) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "One or more provided categories do not exist",
            });
        }

        //  Step 6: Upload files to S3
        const videoUrl = await uploadToS3(videoFile, "battery-videos");
        const thumbnailUrl = await uploadToS3(thumbnailFile, "battery-thumbnails");
        const gifUrl = gifFile ? await uploadToS3(gifFile, "battery-gifs") : null;

        //  Step 7: Create battery animation
        const batteryAnimation = await BatteryAnimation.create(
            {
                title,
                url: getS3Key(videoUrl),
                thumbnail: getS3Key(thumbnailUrl),
                gif: gifUrl ? getS3Key(gifUrl) : null,
                type,
                isPremium: isPremium || false,
            },
            { transaction }
        );

        //  Step 8: Link categories
        await batteryAnimation.setCategories(parsedIds, { transaction });

        await transaction.commit();

        //  Step 9: Fetch result and clear cache
        const result = await BatteryAnimation.findByPk(batteryAnimation.id, {
            include: [{ model: BatteryCategory, as: "categories" }],
        });

        clearBatteryCache();

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating battery animation:", error);
        await transaction.rollback();
        return res.status(500).json({ success: false, message: "Failed to create battery animation" });
    }
};

//  Get All Battery Animations
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
            order: [["sortOrder", "DESC"]],
            distinct: true,
        });

        const animations = rows.map((a) => ({
            id: a.id,
            category: a.categories?.[0]?.name || null,
            title: a.title,
            url: a.url,
            thumbnail: a.thumbnail,
            gif: a.gif,
            type: a.type,
            isPremium: a.isPremium,
            sortOrder: w.sortOrder
        }));

        const response = { page, limit, total: count, animations };
        cache.set(cacheKey, response);

        res.json(response);
    } catch (err) {
        console.error("❌ Error fetching battery animations:", err);
        res.status(500).json({ success: false, message: "Failed to fetch battery animations" });
    }
};

//  Get Battery Animation By ID
exports.getBatteryAnimationById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id) || parseInt(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID. It must be a positive integer.",
            });
        }

        const animation = await BatteryAnimation.findOne({
            where: { id },
            include: [
                {
                    model: BatteryCategory,
                    as: "categories",
                    through: { attributes: [] },
                    attributes: ["id", "name"],
                },
            ],
        });

        if (!animation) {
            return res.status(404).json({
                success: false,
                message: "Battery animation not found",
            });
        }

        res.json({
            success: true,
            animation: {
                id: animation.id,
                title: animation.title,
                url: animation.url,
                thumbnail: animation.thumbnail,
                gif: animation.gif,
                type: animation.type,
                isPremium: animation.isPremium,
                categories: animation.categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                })),
                createdAt: animation.createdAt,
                updatedAt: animation.updatedAt,
            },
        });
    } catch (error) {
        console.error("❌ Error fetching battery animation:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching battery animation details",
        });
    }
};

//  Get Battery Animations By Category
exports.getBatteryAnimationsByCategory = async (req, res) => {
    try {
        const { categoryName } = req.params;
        let { page = 1, limit = 20 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const cacheKey = `batteryByCat_${categoryName}_${page}_${limit}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const category = await BatteryCategory.findOne({ where: { name: categoryName } });
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found" });
        }

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
            order: [["sortOrder", "DESC"]],
        });

        const animations = rows.map((a) => ({
            id: a.id,
            category: category.name,
            title: a.title,
            url: a.url,
            thumbnail: a.thumbnail,
            gif: a.gif,
            type: a.type,
            isPremium: a.isPremium,
            sortOrder: w.sortOrder
        }));

        const response = { page, limit, total: count, animations };
        cache.set(cacheKey, response);

        res.json(response);
    } catch (err) {
        console.error("❌ Error fetching battery animations by category:", err);
        res.status(500).json({ success: false, message: "Failed to fetch by category" });
    }
};

//  Helper Functions
const clearBatteryCache = () => {
    try {
        const keys = cache.keys();
        if (keys && keys.length > 0) {
            keys.forEach((key) => cache.del(key));
            console.log(`🧹 Cleared ${keys.length} battery cache keys`);
        } else {
            console.log("🧹 No cache keys to clear");
        }
    } catch (err) {
        console.error("❌ Error clearing cache:", err);
    }
};

const getS3Key = (url) => {
    if (!url) return null;
    const parts = url.split(".com/");
    return parts[1] || url;
};

exports.searchBatteryAnimations = async (req, res) => {
    try {
        let { query = '', page = 1, limit = 20, categories = '' } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Parse category IDs if provided
        let categoryIds = [];
        if (categories) {
            categoryIds = categories.split(',').map(id => parseInt(id.trim())).filter(Boolean);
        }

        const whereCondition = {};
        if (query) {
            whereCondition.title = { [Op.iLike]: `%${query}%` };
        }

        const includeCondition = [
            {
                model: BatteryCategory,
                as: "categories",
                through: { attributes: [] },
                required: categoryIds.length > 0, // inner join if filtering by categories
                ...(categoryIds.length > 0 && {
                    where: { id: categoryIds }
                })
            },
        ];

        const { count, rows } = await BatteryAnimation.findAndCountAll({
            where: whereCondition,
            include: includeCondition,
            distinct: true,
            limit,
            offset,
            order: [["sortOrder", "DESC"]],
        });

        const baseUrl = process.env.BACKEND_URI || `${req.protocol}://${req.get("host")}`;

        return res.json({
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
                status: a.status,
                isPremium: a.isPremium,
                sortOrder: a.sortOrder,
                category: a.categories?.[0]?.name || null,
            })),
        });

    } catch (error) {
        console.error("❌ Error searching battery animations:", error);
        res.status(500).json({
            success: false,
            message: "Error searching battery animations",
        });
    }
};


exports.updateBatteryAnimation = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { title, type, categoryIds, isPremium } = req.body;
    const { video, thumbnail, gif } = req.files || {};

    if (!id || isNaN(id) || parseInt(id) <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid animation ID. Must be a positive integer.",
      });
    }

    const animation = await BatteryAnimation.findByPk(id, { transaction });
    if (!animation) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: "Animation not found" });
    }

    const updatedData = {};

    if (title !== undefined) {
      const alphaRegex = /^[A-Za-z\s]+$/;
      if (!alphaRegex.test(title)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Title must contain only alphabetic characters and spaces",
        });
      }
      updatedData.title = title;
    }

    const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
    const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
    const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

    if (videoFile && !videoFile.mimetype.startsWith("video/")) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid video file type. Only video formats allowed.",
      });
    }

    const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
    if (thumbnailFile && !allowedImageTypes.includes(thumbnailFile.mimetype)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid thumbnail type. Only JPG, PNG, or WEBP allowed.",
      });
    }

    if (gifFile && gifFile.mimetype !== "image/gif") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid GIF type. Only .gif format allowed.",
      });
    }

    const maxVideoSize = 20 * 1024 * 1024;
    const maxImageSize = 3 * 1024 * 1024;

    if (videoFile && videoFile.size > maxVideoSize) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Video exceeds 20MB limit",
      });
    }

    if (thumbnailFile && thumbnailFile.size > maxImageSize) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Thumbnail exceeds 3MB limit",
      });
    }

    if (gifFile && gifFile.size > maxImageSize) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "GIF exceeds 3MB limit",
      });
    }

    const videoUrl = videoFile ? await uploadToS3(videoFile, "battery-animations/videos") : null;
    const thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile, "battery-animations/thumbnails") : null;
    const gifUrl = gifFile ? await uploadToS3(gifFile, "battery-animations/gifs") : null;

    const getS3Key = (url) => (url ? url.split(".com/")[1] : null);

    if (type) updatedData.type = type;
    if (videoUrl) updatedData.url = getS3Key(videoUrl);
    if (thumbnailUrl) updatedData.thumbnail = getS3Key(thumbnailUrl);
    if (gifUrl) updatedData.gif = getS3Key(gifUrl);
    if (typeof isPremium !== "undefined") updatedData.isPremium = isPremium;

    await animation.update(updatedData, { transaction });

    if (categoryIds) {
      let parsedIds = Array.isArray(categoryIds)
        ? categoryIds
        : JSON.parse(categoryIds || "[]");

      const categories = await BatteryCategory.findAll({
        where: { id: { [Op.in]: parsedIds } },
        transaction,
      });

      if (categories.length !== parsedIds.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "One or more categories not found",
        });
      }

      await animation.setCategories(parsedIds, { transaction });
    }

    await transaction.commit();

    const result = await BatteryAnimation.findByPk(id, {
      include: [{ model: BatteryCategory, as: "categories" }],
    });

    clearBatteryCache();

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("❌ Error updating battery animation:", error);
    await transaction.rollback();
    res.status(500).json({ success: false, message: "Failed to update battery animation" });
  }
};

exports.deleteBatteryAnimation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id) || parseInt(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid animation ID. Must be a positive integer.",
      });
    }

    const animation = await BatteryAnimation.findByPk(id);
    if (!animation) {
      return res.status(404).json({ success: false, message: "Animation not found" });
    }

    const getS3Key = (url) => (url ? url.split(".com/")[1] : null);

    const filesToDelete = [];
    if (animation.url) filesToDelete.push(getS3Key(animation.url));
    if (animation.thumbnail) filesToDelete.push(getS3Key(animation.thumbnail));
    if (animation.gif) filesToDelete.push(getS3Key(animation.gif));

    await Promise.all(filesToDelete.map((fileKey) => deleteFromS3(fileKey)));

    await animation.destroy();

    clearBatteryCache();

    res.status(200).json({
      success: true,
      message: "Battery animation and related files deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting battery animation:", error);
    res.status(500).json({ success: false, message: "Failed to delete battery animation" });
  }
};

exports.updateSortOrder = async (req, res) => {
    try {
        const { categories } = req.body;

        for (const update of categories) {
            const movedBatteryAnimation = await BatteryAnimation.findByPk(update.id);
            if (!movedBatteryAnimation) continue;

            const oldOrder = movedBatteryAnimation.sortOrder;
            const newOrder = update.sortOrder;

            if (oldOrder === newOrder) continue;

            // Moving DOWN (e.g., 8 → 13)
            if (oldOrder < newOrder) {
                await BatteryAnimation.increment(
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
                await BatteryAnimation.increment(
                    { sortOrder: 1 },
                    {
                        where: {
                            sortOrder: { [Op.between]: [newOrder, oldOrder - 1] },
                        },
                    }
                );
            }

            // Finally, update the moved BatteryAnimation to the new sortOrder
            await BatteryAnimation.update(
                { sortOrder: newOrder },
                { where: { id: update.id } }
            );
        }

        clearBatteryCache();

        return res.status(200).json({
            success: true,
            message: "BatteryAnimation order updated successfully",
        });
    } catch (error) {
        console.error("Error updating sort order:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
