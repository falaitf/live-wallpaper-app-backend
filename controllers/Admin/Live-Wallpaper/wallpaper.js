const { Wallpaper, Category, sequelize } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3");
const { Op, Sequelize } = require("sequelize");
const cache = require("../../../utils/cache");

exports.createWallpaper = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { title, type, categoryIds, isPremium } = req.body;
        const { video, thumbnail, gif } = req.files || {};

        // 🟩 Step 1: Validate required fields
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

        // 🟩 Step 2: Handle uploaded files
        const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
        const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
        const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

        if (!videoFile || !thumbnailFile) {
            await transaction.rollback();
            return res
                .status(400)
                .json({ success: false, message: "Video and thumbnail are required" });
        }

        // 🟩 Step 3: Validate file types
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

        // 🟩 Step 4: Validate file sizes
        const maxVideoSize = 20 * 1024 * 1024;     // 20 MB
        const maxImageSize = 3 * 1024 * 1024;      // 3 MB (for thumbnail & GIF)

        if (videoFile.size > maxVideoSize) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Video exceeds 20MB limit",
            });
        }

        if (thumbnailFile.size > maxImageSize) {
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


        // 🟩 Step 4: Parse categoryIds
        let parsedIds = categoryIds;
        if (typeof categoryIds === "string") {
            try {
                parsedIds = JSON.parse(categoryIds);
            } catch {
                parsedIds = [categoryIds];
            }
        }
        if (!Array.isArray(parsedIds)) parsedIds = [parsedIds];

        // 🟩 Step 5: Validate categories
        const categories = await Category.findAll({
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

        // 🟩 Step 6: Upload files to S3
        const videoUrl = await uploadToS3(videoFile, "videos");
        const thumbnailUrl = await uploadToS3(thumbnailFile, "thumbnails");
        const gifUrl = gifFile ? await uploadToS3(gifFile, "gifs") : null;

        // 🟩 Step 7: Create wallpaper
        const wallpaper = await Wallpaper.create(
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

        // 🟩 Step 8: Link categories
        await wallpaper.setCategories(parsedIds, { transaction });

        // 🟩 Step 9: Commit transaction
        await transaction.commit();

        // 🟩 Step 10: Fetch result and clear cache
        const result = await Wallpaper.findByPk(wallpaper.id, {
            include: [{ model: Category, as: "categories" }],
        });

        clearCacheExceptCategories();

        return res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating wallpaper:", error);
        await transaction.rollback();
        return res.status(500).json({ success: false, message: "Failed to create wallpaper" });
    }
};

const clearCacheExceptCategories = () => {
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
};

const getS3Key = (url) => {
    if (!url) return null;
    const parts = url.split(".com/");
    return parts[1] || url;
};

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

exports.getWallpaperById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id) || parseInt(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid wallpaper ID. It must be a positive integer.",
            });
        }

        // Fetch wallpaper by ID with categories
        const wallpaper = await Wallpaper.findOne({
            where: { id },
            include: [
                {
                    model: Category,
                    as: "categories",
                    through: { attributes: [] },
                    required: false, // LEFT JOIN
                    attributes: ["id", "name"], // fetch only these fields
                },
            ],
        });

        if (!wallpaper) {
            return res.status(404).json({
                success: false,
                message: "Wallpaper not found",
            });
        }

        // Respond with wallpaper details
        res.json({
            success: true,
            wallpaper: {
                id: wallpaper.id,
                title: wallpaper.title,
                description: wallpaper.description || null,
                url: wallpaper.url ? wallpaper.url : null,
                thumbnail: wallpaper.thumbnail ? wallpaper.thumbnail : null,
                gif: wallpaper.gif ? wallpaper.gif : null,
                type: wallpaper.type,
                status: wallpaper.status,
                isPremium: wallpaper.isPremium,
                categories: wallpaper.categories.map((c) => ({
                    id: c.id,
                    name: c.name,
                })),
                createdAt: wallpaper.createdAt,
                updatedAt: wallpaper.updatedAt,
            },
        });
    } catch (error) {
        console.error("❌ Error fetching wallpaper details:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching wallpaper details",
        });
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
            category: category.name || null,
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


exports.searchVideos = async (req, res) => {
    try {
        let { query = '', page = 1, limit = 20 } = req.query;

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

exports.updateWallpaper = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { title, type, categoryIds, isPremium } = req.body;
        const { video, thumbnail, gif } = req.files || {};

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

        // 🟩 Validate ID
        if (!id || isNaN(id) || parseInt(id) <= 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid wallpaper ID. It must be a positive integer.",
            });
        }

        const wallpaper = await Wallpaper.findByPk(id, { transaction });
        if (!wallpaper) {
            await transaction.rollback();
            return res.status(404).json({ success: false, message: "Wallpaper not found" });
        }

        // 🟩 Extract uploaded files (if provided)
        const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
        const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
        const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

        // 🟩 Step 3: Validate file types (only if file exists)
        if (videoFile && !videoFile.mimetype.startsWith("video/")) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Invalid video file type. Only video formats are allowed",
            });
        }

        const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
        if (thumbnailFile && !allowedImageTypes.includes(thumbnailFile.mimetype)) {
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

        // 🟩 Step 4: Validate file sizes (only if file exists)
        const maxVideoSize = 20 * 1024 * 1024; // 20 MB
        const maxImageSize = 3 * 1024 * 1024;  // 3 MB

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

        // 🟩 Step 5: Upload to S3 only if new files provided
        const videoUrl = videoFile ? await uploadToS3(videoFile, "videos") : null;
        const thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile, "thumbnails") : null;
        const gifUrl = gifFile ? await uploadToS3(gifFile, "gifs") : null;

        // 🟩 Step 6: Update wallpaper
        await wallpaper.update(
            {
                ...(title && { title }),
                ...(type && { type }),
                ...(videoUrl && { url: getS3Key(videoUrl) }),
                ...(thumbnailUrl && { thumbnail: getS3Key(thumbnailUrl) }),
                ...(gifUrl && { gif: getS3Key(gifUrl) }),
                ...(typeof isPremium !== "undefined" && { isPremium }),
            },
            { transaction }
        );

        // 🟩 Step 7: Update categories if provided
        if (categoryIds) {
            let parsedIds = categoryIds;
            if (typeof categoryIds === "string") {
                try {
                    parsedIds = JSON.parse(categoryIds);
                } catch {
                    parsedIds = [categoryIds];
                }
            }
            if (!Array.isArray(parsedIds)) parsedIds = [parsedIds];

            const categories = await Category.findAll({
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

            await wallpaper.setCategories(parsedIds, { transaction });
        }

        // 🟩 Step 8: Commit and return updated record
        await transaction.commit();

        const result = await Wallpaper.findByPk(id, {
            include: [{ model: Category, as: "categories" }],
        });

        clearCacheExceptCategories();

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error updating wallpaper:", error);
        await transaction.rollback();
        res.status(500).json({ success: false, message: "Failed to update wallpaper" });
    }
};



exports.deleteWallpaper = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || isNaN(id) || parseInt(id) <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid wallpaper ID. It must be a positive integer.",
            });
        }

        const wallpaper = await Wallpaper.findByPk(id);
        if (!wallpaper) {
            return res.status(404).json({ success: false, message: "Wallpaper not found" });
        }

        // ✅ Delete files from S3 if they exist
        const filesToDelete = [];
        if (wallpaper.url) filesToDelete.push(getS3Key(wallpaper.url));
        if (wallpaper.thumbnail) filesToDelete.push(getS3Key(wallpaper.thumbnail));
        if (wallpaper.gif) filesToDelete.push(getS3Key(wallpaper.gif));

        await Promise.all(filesToDelete.map((fileKey) => deleteFromS3(fileKey)));

        // ✅ Delete wallpaper record
        await wallpaper.destroy();

        clearCacheExceptCategories();

        res.status(200).json({ success: true, message: "Wallpaper and files deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting wallpaper:", error);
        res.status(500).json({ success: false, message: "Failed to delete wallpaper" });
    }
};
