import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";
import { emitGroupMessageEvent } from "../socketManager.js";

const toObjectId = (id) => {
  if (!id || !ObjectId.isValid(id)) {
    return null;
  }

  return new ObjectId(id);
};

export const sendGroupMessage = async (req, res) => {
  const { groupId, from, message, suppressRealtime } = req.body;

  if (!groupId || !from || !message) {
    return res.status(400).json({
      status: "error",
      message: "groupId, from, and message fields are required",
    });
  }

  const objectId = toObjectId(groupId);

  if (!objectId) {
    return res.status(400).json({
      status: "error",
      message: "Invalid groupId",
    });
  }

  try {
    const groups = getCollection("groups");
    const group = await groups.findOne({ _id: objectId });

    if (!group) {
      return res.status(404).json({
        status: "error",
        message: "Group not found",
      });
    }

    const payload = {
      groupId: objectId.toString(),
      from,
      message,
      createdAt: new Date(),
    };

    const result = await getCollection("groupMessages").insertOne(payload);
    const insertedId = result.insertedId?.toString();
    const responsePayload = {
      id: insertedId,
      ...payload,
    };

    if (!suppressRealtime) {
      try {
        emitGroupMessageEvent(payload.groupId, responsePayload);
      } catch (socketError) {
        console.warn("Group socket emit skipped:", socketError.message);
      }
    }

    return res.status(201).json({
      status: "success",
      message: "Group message saved",
      data: responsePayload,
    });
  } catch (error) {
    console.error("Group message DB error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to save group message",
    });
  }
};

export const getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

    const objectId = toObjectId(groupId);

    if (!objectId) {
      return res.status(400).json({
        status: "error",
        message: "Invalid groupId",
      });
    }

    const skip = (page - 1) * limit;
    const normalizedGroupId = objectId.toString();

    const messages = await getCollection("groupMessages")
      .find({ groupId: normalizedGroupId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      status: "success",
      count: messages.length,
      page,
      messages,
    });
  } catch (error) {
    console.error("Group messages fetch error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to fetch group messages",
    });
  }
};

export const deleteGroupMessage = async (req, res) => {
  const { messageId } = req.params;

  const objectId = toObjectId(messageId);

  if (!objectId) {
    return res.status(400).json({
      status: "error",
      message: "Invalid messageId",
    });
  }

  try {
    const result = await getCollection("groupMessages").deleteOne({
      _id: objectId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Message not found",
      });
    }

    return res.json({
      status: "success",
      message: "Group message deleted successfully",
    });
  } catch (error) {
    console.error("Delete group message error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to delete group message",
    });
  }
};
