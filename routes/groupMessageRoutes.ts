import express from "express";
import dotenv from "dotenv";
import { verifyApiKey } from "./middleware/apiKeyAuth.js";
import { 
  sendGroupMessage,
  getGroupMessages,
  deleteGroupMessage,
} from "../controllers/groupMessageController.js";

dotenv.config();

const router = express.Router();

const requireKeys = (label: string, ...keys: Array<string | undefined>): string[] => {
  const values = keys.filter((key): key is string => Boolean(key));
  if (values.length === 0) {
    throw new Error(`Missing API key configuration for ${label}`);
  }
  return values;
};

// Send a group message
router.post(
  "/send",
  verifyApiKey(
    requireKeys(
      "group message send",
      process.env.API_KEY_GROUP,
      process.env.API_KEY_ADMIN
    )
  ),
  sendGroupMessage
);

// Fetch messages for a group
router.get(
  "/messages/:groupId",
  verifyApiKey(
    requireKeys(
      "group message fetch",
      process.env.API_KEY_GROUP,
      process.env.API_KEY_ADMIN
    )
  ),
  getGroupMessages
);

// Delete group message
router.delete(
  "/messages/:messageId",
  verifyApiKey(
    requireKeys(
      "group message delete",
      process.env.API_KEY_GROUP_DELETE,
      process.env.API_KEY_ADMIN
    )
  ),
  deleteGroupMessage
);

export default router;
