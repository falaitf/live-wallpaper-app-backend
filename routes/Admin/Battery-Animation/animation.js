const express = require("express");
const router = express.Router();
const upload = require("../../../middlewares/upload");
const animationController = require("../../../controllers/Admin/Battery-Animation/animation");
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
  animationController.createBatteryAnimation
);
router.get("/get", authenticateJWT,
  authorizePermission("animation.view"), animationController.searchBatteryAnimations);
router.get("/get/:id", authenticateJWT,
  authorizePermission("animation.view"), animationController.getBatteryAnimationById);
router.get("/category/:categoryName", authenticateJWT,
  authorizePermission("animation.view"), animationController.getBatteryAnimationsByCategory);
router.get("/search", authenticateJWT,
  authorizePermission("animation.view"), animationController.searchBatteryAnimations);
router.put("/update/:id", authenticateJWT,
  authorizePermission("animation.update"), upload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
    { name: "gif", maxCount: 1 },
  ]), animationController.updateBatteryAnimation);
router.delete("/delete/:id", authenticateJWT,
  authorizePermission("animation.delete"), animationController.deleteBatteryAnimation);
router.put("/updateOrder", authenticateJWT, authorizePermission("animation.update"), animationController.updateSortOrder);

module.exports = router;
