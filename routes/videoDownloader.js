const express = require("express");
const router = express.Router();
const wallpaperController = require("../controllers/videoDownloader");

router.post("/download", wallpaperController.downloadMedia);


module.exports = router;
