import express from "express";
import dotenv from "dotenv";
import { verifyApiKey } from "../middleware/apiKeyAuth.js";
import { 
  sendGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
} from "../controllers/groupMessageController.js";

dotenv.config();

const router = express.Router();

// Send a group message
router.post(
  "/send",
  verifyApiKey([process.env.API_KEY_GROUP, process.env.API_KEY_ADMIN]),
  sendGroupMessage
);

// Fetch messages for a group
router.get(
  "/messages/:groupId",
  verifyApiKey([process.env.API_KEY_GROUP, process.env.API_KEY_ADMIN]),
  getGroupMessages
);

// Delete group message
router.delete(
  "/messages/:messageId",
  verifyApiKey([process.env.API_KEY_GROUP_DELETE, process.env.API_KEY_ADMIN]),
  deleteGroupMessage
);

export default router;
