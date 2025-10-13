const express = require("express");
const router = express.Router();
const wallpaperController = require("../controllers/wallpaper");

router.get("/get", wallpaperController.getAllVideos);
router.get("/category/:categoryName", wallpaperController.getVideosByCategory);
router.get("/search", wallpaperController.searchVideos);
router.get("/getCategoryWallpaper", wallpaperController.getCategoriesWithWallpapers);


module.exports = router;
