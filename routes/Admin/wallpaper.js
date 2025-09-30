const express = require("express");
const router = express.Router();
const upload = require("../../middlewares/upload");
const wallpaperController = require("../../controllers/Admin/wallpaper");

router.post(
  "/add",
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "gif", maxCount: 1 },
  ]),
  wallpaperController.createWallpaper
);
router.get("/get", wallpaperController.getAllVideos);
router.get("/category/:categoryName", wallpaperController.getVideosByCategory);
router.get("/search", wallpaperController.searchVideos);


module.exports = router;
