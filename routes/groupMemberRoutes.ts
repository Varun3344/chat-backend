import express from "express";
import {
  addMember,
  removeMember,
  getGroupsForUser,
} from "../controllers/groupMemberController.js";

const router = express.Router();

// POST /chat/group/member/add
router.post("/add", addMember);

// POST /chat/group/member/remove
router.post("/remove", removeMember);

// GET /chat/group/member/:userId
router.get("/:userId", getGroupsForUser);

export default router;
