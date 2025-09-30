const express = require("express");
const router = express.Router();
const Controller = require("../controllers/category");

router.get("/get", Controller.getCategories);

module.exports = router;
