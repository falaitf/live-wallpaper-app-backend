const express = require("express");
const router = express.Router();
const Controller = require("../../../controllers/Admin/Live-Wallpaper/category");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");

router.post("/add", authenticateJWT, authorizePermission("categories.create"), Controller.addCategory);
router.get("/get", authenticateJWT, authorizePermission("categories.view"), Controller.getCategories);
router.get("/get/:id", authenticateJWT, authorizePermission("categories.view"), Controller.getCategoryById);
router.put("/update/:id", authenticateJWT, authorizePermission("categories.update"), Controller.updateCategory);
router.delete("/delete/:id", authenticateJWT, authorizePermission("categories.delete"), Controller.deleteCategory);
router.put("/updateOrder", authenticateJWT, authorizePermission("categories.update"), Controller.updateSortOrder);

module.exports = router;
