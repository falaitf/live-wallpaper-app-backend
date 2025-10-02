const express = require("express");
const router = express.Router();
const fileProxyController = require("../controllers/fileProxy");

router.get("/:id/:type", fileProxyController.getFile);
router.get("/blogs/:id/image", fileProxyController.getBlogFile);


module.exports = router;
