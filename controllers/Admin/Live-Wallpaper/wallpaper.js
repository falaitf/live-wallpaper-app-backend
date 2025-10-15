const { Wallpaper, Category } = require("../../../utils/db").loadModels();
const { uploadToS3, deleteFromS3 } = require("../../../utils/uploadToS3");
const { Op, Sequelize } = require("sequelize");
const cache = require("../../../utils/cache");

exports.createWallpaper = async (req, res) => {
    try {
        const { title, type, categoryIds, isPremium } = req.body;
        const { video, thumbnail, gif } = req.files || {};

        const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
        const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
        const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

        if (videoFile && videoFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Video exceeds 10MB limit" });
        }
        if (thumbnailFile && thumbnailFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Thumbnail exceeds 10MB limit" });
        }
        if (gifFile && gifFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Gif exceeds 10MB limit" });
        }

        // Upload to S3
        const videoUrl = videoFile ? await uploadToS3(videoFile, "videos") : null;
        const thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile, "thumbnails") : null;
        const gifUrl = gifFile ? await uploadToS3(gifFile, "gifs") : null;

        // Save in DB
        const wallpaper = await Wallpaper.create({
            title,
            url: getS3Key(videoUrl),
            thumbnail: getS3Key(thumbnailUrl),
            gif: getS3Key(gifUrl),
            type,
            isPremium
        });

        // Handle categories (string from Postman needs parsing)
        if (categoryIds) {
            let parsedIds = categoryIds;

            if (typeof categoryIds === "string") {
                try {
                    parsedIds = JSON.parse(categoryIds);
                } catch (e) {
                    parsedIds = [categoryIds];
                }
            }

            if (!Array.isArray(parsedIds)) {
                parsedIds = [parsedIds];
            }

            await wallpaper.setCategories(parsedIds);
        }


        // Fetch with categories
        const result = await Wallpaper.findByPk(wallpaper.id, {
            include: [{ model: Category, as: "categories" }],
        });

        clearCacheExceptCategories();

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating wallpaper:", error);
        res.status(500).json({ success: false, message: "Failed to create wallpaper" });
    }
};

const clearCacheExceptCategories = () => {
    const keys = cache.keys(); 

    keys.forEach((key) => {
        if (key.startsWith("categories") || key.startsWith("videosByCat_")) {
            cache.del(key);
        }
    });
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
                category: w.categories[0].name,
                isPremium: w.isPremium
            })),
        });
    } catch (error) {
        console.error("❌ Error searching videos:", error);
        res.status(500).json({ success: false, message: "Error searching videos" });
    }
};

exports.updateWallpaper = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, type, categoryIds, isPremium } = req.body;
        const { video, thumbnail, gif } = req.files || {};

        // Find wallpaper
        const wallpaper = await Wallpaper.findByPk(id);
        if (!wallpaper) {
            return res.status(404).json({ success: false, message: "Wallpaper not found" });
        }

        // Handle file uploads
        const videoFile = video ? (Array.isArray(video) ? video[0] : video) : null;
        const thumbnailFile = thumbnail ? (Array.isArray(thumbnail) ? thumbnail[0] : thumbnail) : null;
        const gifFile = gif ? (Array.isArray(gif) ? gif[0] : gif) : null;

        if (videoFile && videoFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Video exceeds 10MB limit" });
        }
        if (thumbnailFile && thumbnailFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Thumbnail exceeds 10MB limit" });
        }
        if (gifFile && gifFile.size > 10 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "Gif exceeds 10MB limit" });
        }

        // Upload new files to S3 if provided
        const videoUrl = videoFile ? await uploadToS3(videoFile, "videos") : null;
        const thumbnailUrl = thumbnailFile ? await uploadToS3(thumbnailFile, "thumbnails") : null;
        const gifUrl = gifFile ? await uploadToS3(gifFile, "gifs") : null;

        // Update wallpaper fields
        await wallpaper.update({
            title: title || wallpaper.title,
            type: type || wallpaper.type,
            url: videoUrl ? getS3Key(videoUrl) : wallpaper.url,
            thumbnail: thumbnailUrl ? getS3Key(thumbnailUrl) : wallpaper.thumbnail,
            gif: gifUrl ? getS3Key(gifUrl) : wallpaper.gif,
            isPremium: isPremium || wallpaper.isPremium
        });

        // Update categories
        if (categoryIds) {
            let parsedIds = categoryIds;
            if (typeof categoryIds === "string") {
                try {
                    parsedIds = JSON.parse(categoryIds);
                } catch (e) {
                    parsedIds = [categoryIds];
                }
            }
            if (!Array.isArray(parsedIds)) {
                parsedIds = [parsedIds];
            }
            await wallpaper.setCategories(parsedIds);
        }

        // Fetch updated wallpaper with categories
        const result = await Wallpaper.findByPk(id, {
            include: [{ model: Category, as: "categories" }],
        });

        clearCacheExceptCategories();

        res.status(200).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error updating wallpaper:", error);
        res.status(500).json({ success: false, message: "Failed to update wallpaper" });
    }
};

exports.deleteWallpaper = async (req, res) => {
    try {
        const { id } = req.params;

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
