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
import { verifyApiKey } from "../middleware/apiKeyAuth.js";
import {
  sendDirectMessage,
  getDirectMessages,
  deleteDirectMessage,
} from "../controllers/directMessageController.js";

dotenv.config();

const router = express.Router();

// SEND DIRECT MESSAGE
router.post(
  "/send",
  verifyApiKey([process.env.API_KEY_DIRECT, process.env.API_KEY_ADMIN]),
  sendDirectMessage
);

// FETCH DIRECT CHAT (userA <--> userB)
router.get(
  "/messages/:userA/:userB",
  verifyApiKey([process.env.API_KEY_DIRECT_FETCH, process.env.API_KEY_ADMIN]),
  getDirectMessages
);

// DELETE DIRECT MESSAGE
router.delete(
  "/messages/:messageId",
  verifyApiKey([process.env.API_KEY_DIRECT_DELETE, process.env.API_KEY_ADMIN]),
  deleteDirectMessage
);

export default router;
