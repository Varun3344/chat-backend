import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { verifyApiKey } from "../middleware/apiKeyAuth.js";
import { uploadDirectAttachment } from "../controllers/directAttachmentController.js";

const router = express.Router();
dotenv.config();

const requireKeys = (label: string, ...keys: Array<string | undefined>): string[] => {
  const values = keys.filter((key): key is string => Boolean(key));
  if (values.length === 0) {
    throw new Error(`Missing API key configuration for ${label}`);
  }
  return values;
};

// Multer memory storage (binary stored directly)
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post(
  "/attachment/send",
  verifyApiKey(
    requireKeys(
      "direct attachment",
      process.env.API_KEY_DIRECT_ATTACHMENT,
      process.env.API_KEY_ADMIN
    )
  ),
  upload.single("file"),
  uploadDirectAttachment
);

export default router;
