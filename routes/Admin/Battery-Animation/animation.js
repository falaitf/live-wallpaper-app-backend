const express = require("express");
const router = express.Router();
const upload = require("../../../middlewares/upload");
const wallpaperController = require("../../../controllers/Admin/Battery-Animation/animation");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");

router.post(
  "/add",
  authenticateJWT,
  authorizePermission("animation.create"),
  upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "gif", maxCount: 1 },
  ]),
  wallpaperController.createBatteryAnimation
);
router.get("/get", authenticateJWT,
  authorizePermission("animation.view"), wallpaperController.searchBatteryAnimations);
router.get("/get/:id", authenticateJWT,
  authorizePermission("animation.view"), wallpaperController.getBatteryAnimationById);
router.get("/category/:categoryName", authenticateJWT,
  authorizePermission("animation.view"), wallpaperController.getBatteryAnimationsByCategory);
router.get("/search", authenticateJWT,
  authorizePermission("animation.view"), wallpaperController.searchBatteryAnimations);
router.put("/update/:id", authenticateJWT,
  authorizePermission("animation.update"), upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "gif", maxCount: 1 },
  ]), wallpaperController.updateBatteryAnimation);
router.delete("/delete/:id", authenticateJWT,
  authorizePermission("animation.delete"), wallpaperController.deleteBatteryAnimation);

module.exports = router;
