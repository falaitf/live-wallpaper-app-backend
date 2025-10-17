const express = require("express");
const router = express.Router();
const Controller = require("../controllers/pages");

router.get("/get-page", Controller.getPage);
router.get("/get/:slug", Controller.getAppPages);

module.exports = router;
