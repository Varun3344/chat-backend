import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { verifyApiKey } from "./middleware/apiKeyAuth.js";
import { uploadGroupAttachment } from "../controllers/directAttachmentController.js";

dotenv.config();

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

const requireKeys = (label: string, ...keys: Array<string | undefined>): string[] => {
  const values = keys.filter((key): key is string => Boolean(key));
  if (values.length === 0) {
    throw new Error(`Missing API key configuration for ${label}`);
  }
  return values;
};

router.post(
  "/send",
  verifyApiKey(
    requireKeys(
      "group attachment",
      process.env.API_KEY_DIRECT_ATTACHMENT,
      process.env.API_KEY_ADMIN
    )
  ),
  upload.single("file"),
  uploadGroupAttachment
);

export default router;
