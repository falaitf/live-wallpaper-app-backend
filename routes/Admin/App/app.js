const express = require("express");
const router = express.Router();
const Controller = require("../../../controllers/Admin/App/app");

router.get("/getApps", Controller.getApps);
router.get("/getAppPermissions/:appId", Controller.getAppPermissions);

module.exports = router;
