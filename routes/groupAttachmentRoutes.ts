import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { verifyApiKey } from "./middleware/apiKeyAuth.js";
import { uploadGroupAttachment } from "../controllers/directAttachmentController.js";

dotenv.config();

const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
});

const handleAttachmentUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const middleware = upload.single("file");
  middleware(req, res, (error: unknown) => {
    if (!error) {
      return next();
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        status: "error",
        message: "Attachment exceeds 20 MB limit",
      });
    }
    const message =
      error instanceof Error ? error.message : "Unable to process attachment";
    return res.status(400).json({
      status: "error",
      message,
    });
  });
};

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
  handleAttachmentUpload,
  uploadGroupAttachment
);

export default router;
