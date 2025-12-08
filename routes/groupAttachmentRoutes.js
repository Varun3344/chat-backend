import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { verifyApiKey } from "../middleware/apiKeyAuth.js";
import { uploadGroupAttachment } from "../controllers/directAttachmentController.js";

dotenv.config();

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post(
  "/send",
  verifyApiKey([process.env.API_KEY_DIRECT_ATTACHMENT, process.env.API_KEY_ADMIN]),
  upload.single("file"),
  uploadGroupAttachment
);

export default router;
