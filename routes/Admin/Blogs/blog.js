const express = require("express");
const router = express.Router();
const { addBlog, addBlogItem, getBlogWithItems, getBlogs, updateBlog, deleteBlog, updateBlogItem, deleteBlogItem } = require("../../../controllers/Admin/Blogs/blog");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");
const upload = require("../../../middlewares/upload");

router.post(
  "/add",
  authenticateJWT,
  authorizePermission("blogs.write"),
  addBlog
);

router.post(
  "/add-item",
  authenticateJWT,
  authorizePermission("blogs.write"),
  upload.single("image"), // for uploading images
  addBlogItem
);

router.get(
  "/get",
  authenticateJWT,
  authorizePermission("blogs.read"),
  getBlogs
);

router.get(
  "/get-blog/:blogId",
  authenticateJWT,
  authorizePermission("blogs.read"),
  getBlogWithItems
);

router.put(
  "/update/:blogId",
  authenticateJWT,
  authorizePermission("blogs.update"),
  updateBlog
);

router.delete(
  "/delete/:blogId",
  authenticateJWT,
  authorizePermission("blogs.delete"),
  deleteBlog
);

router.put(
  "/update-item/:itemId",
  authenticateJWT,
  authorizePermission("blogs.update"),
  updateBlogItem
);

router.delete(
  "/delete-item/:itemId",
  authenticateJWT,
  authorizePermission("blogs.delete"),
  deleteBlogItem
);

module.exports = router;
