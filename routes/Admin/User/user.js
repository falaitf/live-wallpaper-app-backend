const express = require("express");
const router = express.Router();
const Controller = require("../../../controllers/Admin/User/user");
const { authenticateJWT } = require("../../../middlewares/authMiddleware");
const { authorizeCreateUser } = require("../../../middlewares/authorizeCreateUser");

router.post("/create", authenticateJWT, authorizeCreateUser, Controller.createUser);
router.get("/get", authenticateJWT, authorizeCreateUser, Controller.getUsers);
router.get("/get/:userId", authenticateJWT, authorizeCreateUser, Controller.getUser);
router.patch("/toggleStatus/:userId", authenticateJWT, authorizeCreateUser, Controller.toggleUserStatus);
router.put("/updatePermissions", authenticateJWT, authorizeCreateUser, Controller.updateUserPermissions);

module.exports = router;
