const express = require("express");
const router = express.Router();
const Controller = require("../../../controllers/Admin/Battery-Animation/category");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");

router.post("/add", authenticateJWT, authorizePermission("animationcategories.create"), Controller.addBatteryCategory);
router.get("/get", authenticateJWT, authorizePermission("animationcategories.view"), Controller.getBatteryCategories);
router.get("/get/:id", authenticateJWT, authorizePermission("animationcategories.view"), Controller.getBatteryCategoryById);
router.put("/update/:id", authenticateJWT, authorizePermission("animationcategories.update"), Controller.updateBatteryCategory);
router.delete("/delete/:id", authenticateJWT, authorizePermission("animationcategories.delete"), Controller.deleteBatteryCategory);

module.exports = router;
