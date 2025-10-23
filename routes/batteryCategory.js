const express = require("express");
const router = express.Router();
const Controller = require("../controllers/batteryCategory");

router.get("/get", Controller.getBatteryCategories);

module.exports = router;
