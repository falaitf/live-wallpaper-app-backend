const multer = require("multer");

// Use in-memory storage (files are kept in RAM)
const upload = multer({
  storage: multer.memoryStorage(),
});

module.exports = upload;
