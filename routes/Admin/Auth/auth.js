const express = require("express");
const router = express.Router();
const Controller = require("../../../controllers/Admin/Auth/auth");

router.post("/login", Controller.login);
router.post("/refreshToken", Controller.refreshToken);

module.exports = router;
