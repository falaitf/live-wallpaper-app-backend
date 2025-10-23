const express = require("express");
const router = express.Router();
const wallpaperController = require("../controllers/animation");

router.get("/get", wallpaperController.getAllBatteryAnimations);
router.get("/category/:categoryName", wallpaperController.getBatteryAnimationsByCategory);
router.get("/search", wallpaperController.searchBatteryAnimations);
router.get("/getCategoryAnimations", wallpaperController.getBatteryCategoriesWithAnimations);


module.exports = router;
