import { ObjectId, InsertOneResult, Document } from "mongodb";
import { Request, Response } from "express";
import type { Express } from "express";
import { getCollection } from "../config/db.js";
import {
  emitDirectAttachmentEvent,
  emitGroupAttachmentEvent,
} from "../socketManager.js";

interface AttachmentDocument extends Document {
  from: string;
  type: "attachment";
  fileName: string;
  mimeType: string;
  size: number;
  fileBuffer: Buffer;
  createdAt: Date;
  to?: string;
  groupId?: string;
  message?: string;
}

type AttachmentRequest = Request & { file?: Express.Multer.File };

const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const ATTACHMENT_LIMIT_MESSAGE = "Attachment exceeds 20 MB limit";

const buildAttachmentDocument = (
  from: string,
  file: Express.Multer.File,
  extraFields: Partial<AttachmentDocument> = {}
): AttachmentDocument => ({
  from,
  type: "attachment",
  fileName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  fileBuffer: file.buffer,
  createdAt: new Date(),
  ...extraFields,
});

const respondSuccess = (
  res: Response,
  result: InsertOneResult<AttachmentDocument>,
  payload: AttachmentDocument
) => {
  return res.status(201).json({
    status: "success",
    message: "Attachment sent successfully",
    data: {
      id: result.insertedId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size: payload.size,
    },
  });
};

export const uploadDirectAttachment = async (req: AttachmentRequest, res: Response) => {
  const { from, to, message } = req.body as { from?: string; to?: string; message?: string };

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Attachment file is required",
    });
  }

  if (req.file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return res.status(413).json({
      status: "error",
      message: ATTACHMENT_LIMIT_MESSAGE,
    });
  }

  if (!from || !to) {
    return res.status(400).json({
      status: "error",
      message: "from & to fields are required",
    });
  }

  try {
    const payload = buildAttachmentDocument(from, req.file, {
      to,
      message,
    });
    const result = await getCollection<AttachmentDocument>("directMessages").insertOne(
      payload
    );

    const eventPayload = {
      id: result.insertedId?.toString(),
      from,
      to,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size: payload.size,
      createdAt: payload.createdAt,
      type: payload.type,
      message,
    };

    try {
      emitDirectAttachmentEvent(eventPayload);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      console.warn("Direct attachment socket emit skipped:", detail);
    }

    return respondSuccess(res, result, payload);
  } catch (error) {
    console.error("Attachment upload error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to upload attachment",
    });
  }
};

export const uploadGroupAttachment = async (req: AttachmentRequest, res: Response) => {
  const { from, groupId, message } = req.body as {
    from?: string;
    groupId?: string;
    message?: string;
  };

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Attachment file is required",
    });
  }

  if (req.file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return res.status(413).json({
      status: "error",
      message: ATTACHMENT_LIMIT_MESSAGE,
    });
  }

  if (!from || !groupId) {
    return res.status(400).json({
      status: "error",
      message: "from & groupId fields are required",
    });
  }

  if (!ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid groupId",
    });
  }

  try {
    const groups = getCollection("groups");
    const objectId = new ObjectId(groupId);
    const group = await groups.findOne({ _id: objectId });

    if (!group) {
      return res.status(404).json({
        status: "error",
        message: "Group not found",
      });
    }

    const payload = buildAttachmentDocument(from, req.file, {
      groupId: group._id.toString(),
      message,
    });

    const result = await getCollection<AttachmentDocument>("groupMessages").insertOne(
      payload
    );

    const memberIds = Array.isArray(group.members)
      ? (group.members
          .map((member) => member?.toString?.() ?? "")
          .filter((value): value is string => Boolean(value)))
      : [];
    const eventPayload = {
      id: result.insertedId?.toString(),
      from,
      groupId: payload.groupId,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      size: payload.size,
      createdAt: payload.createdAt,
      type: payload.type,
      message,
    };

    try {
      emitGroupAttachmentEvent(payload.groupId!, eventPayload, memberIds);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      console.warn("Group attachment socket emit skipped:", detail);
    }

    return respondSuccess(res, result, payload);
  } catch (error) {
    console.error("Group attachment upload error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to upload attachment",
    });
  }
};
