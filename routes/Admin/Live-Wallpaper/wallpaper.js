const express = require("express");
const router = express.Router();
const upload = require("../../../middlewares/upload");
const wallpaperController = require("../../../controllers/Admin/Live-Wallpaper/wallpaper");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");

router.post(
  "/add",
  authenticateJWT,
  authorizePermission("wallpapers.create"),
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "gif", maxCount: 1 },
  ]),
  wallpaperController.createWallpaper
);
router.get("/get", authenticateJWT,
  authorizePermission("wallpapers.view"), wallpaperController.searchVideos);
  router.get("/get/:id", authenticateJWT,
  authorizePermission("wallpapers.view"), wallpaperController.getWallpaperById);
router.get("/category/:categoryName", authenticateJWT,
  authorizePermission("wallpapers.view"), wallpaperController.getVideosByCategory);
router.get("/search", authenticateJWT,
  authorizePermission("wallpapers.view"), wallpaperController.searchVideos);
router.put("/update/:id", authenticateJWT,
  authorizePermission("wallpapers.update"), wallpaperController.updateWallpaper);
  router.delete("/delete/:id", authenticateJWT,
  authorizePermission("wallpapers.delete"), wallpaperController.deleteWallpaper);

module.exports = router;
