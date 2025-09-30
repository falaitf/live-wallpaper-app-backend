const express = require("express");
const router = express.Router();
const Controller = require("../../controllers/Admin/category");

router.post("/add", Controller.addCategory);
router.get("/get", Controller.getCategories);
router.put("/update/:id", Controller.updateCategory);
router.delete("/delete/:id", Controller.deleteCategory);

module.exports = router;
