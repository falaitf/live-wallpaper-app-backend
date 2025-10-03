const express = require("express");
const router = express.Router();
const { savePage, getPages, getPage, deletePage } = require("../../../controllers/Admin/Page/page");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const authorizePermission = require("../../../middlewares/authorizePermission");
const upload = require("../../../middlewares/upload");

router.post(
  "/save",
  authenticateJWT,
  authorizePermission("pages.save"),
  upload.any(), 
  savePage
);

router.get(
  "/get",
  authenticateJWT,
  authorizePermission("pages.view"),
  getPages
);

router.get(
  "/get-page",
  authenticateJWT,
  authorizePermission("pages.view"),
  getPage
);

router.delete(
  "/delete/:id",
  authenticateJWT,
  authorizePermission("pages.delete"),
  deletePage
);

module.exports = router;