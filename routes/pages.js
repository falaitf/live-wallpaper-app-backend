const express = require("express");
const router = express.Router();
const Controller = require("../controllers/pages");

router.get("/get", Controller.getPage);

module.exports = router;
