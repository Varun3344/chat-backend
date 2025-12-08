import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

const buildAttachmentDocument = (from, file, extraFields = {}) => ({
  from,
  type: "attachment",
  fileName: file.originalname,
  mimeType: file.mimetype,
  size: file.size,
  fileBuffer: file.buffer,
  createdAt: new Date(),
  ...extraFields,
});

const respondSuccess = (res, result, payload) => {
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

export const uploadDirectAttachment = async (req, res) => {
  const { from, to } = req.body;

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Attachment file is required",
    });
  }

  if (!from || !to) {
    return res.status(400).json({
      status: "error",
      message: "from & to fields are required",
    });
  }

  try {
    const payload = buildAttachmentDocument(from, req.file, { to });
    const result = await getCollection("directMessages").insertOne(payload);

    return respondSuccess(res, result, payload);
  } catch (error) {
    console.error("Attachment upload error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to upload attachment",
    });
  }
};

export const uploadGroupAttachment = async (req, res) => {
  const { from, groupId } = req.body;

  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Attachment file is required",
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
    const group = await groups.findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return res.status(404).json({
        status: "error",
        message: "Group not found",
      });
    }

    const payload = buildAttachmentDocument(from, req.file, {
      groupId: group._id.toString(),
    });

    const result = await getCollection("groupMessages").insertOne(payload);

    return respondSuccess(res, result, payload);
  } catch (error) {
    console.error("Group attachment upload error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to upload attachment",
    });
  }
};
