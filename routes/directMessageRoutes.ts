/**
 * @swagger
 * /chat/direct/send:
 *   post:
 *     summary: Send direct message
 *     security:
 *       - ApiKeyAuth: []
 *     tags: [Direct Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DirectMessage'
 *     responses:
 *       201:
 *         description: Message sent
 */

import express from "express";
import dotenv from "dotenv";
import { verifyApiKey } from "./middleware/apiKeyAuth.js";
import {
  sendDirectMessage,
  getDirectMessages,
  deleteDirectMessage,
} from "../controllers/directMessageController.js";

dotenv.config();

const router = express.Router();

const requireKeys = (label: string, ...keys: Array<string | undefined>): string[] => {
  const values = keys.filter((key): key is string => Boolean(key));
  if (values.length === 0) {
    throw new Error(`Missing API key configuration for ${label}`);
  }
  return values;
};

// SEND DIRECT MESSAGE
router.post(
  "/send",
  verifyApiKey(
    requireKeys(
      "direct send",
      process.env.API_KEY_DIRECT,
      process.env.API_KEY_ADMIN
    )
  ),
  sendDirectMessage
);

// FETCH DIRECT CHAT (userA <--> userB)
router.get(
  "/messages/:userA/:userB",
  verifyApiKey(
    requireKeys(
      "direct fetch",
      process.env.API_KEY_DIRECT_FETCH,
      process.env.API_KEY_ADMIN
    )
  ),
  getDirectMessages
);

// DELETE DIRECT MESSAGE
router.delete(
  "/messages/:messageId",
  verifyApiKey(
    requireKeys(
      "direct delete",
      process.env.API_KEY_DIRECT_DELETE,
      process.env.API_KEY_ADMIN
    )
  ),
  deleteDirectMessage
);

export default router;
