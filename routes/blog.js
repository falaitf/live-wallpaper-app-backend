const express = require("express");
const router = express.Router();
const Controller = require("../controllers/blogs");

router.get("/get/:slug", Controller.getBlogs);
router.get("/get-blog/:blogId", Controller.getBlogWithItems);

module.exports = router;
