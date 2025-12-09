import { ObjectId, InsertOneResult, Document } from "mongodb";
import { Request, Response } from "express";
import { getCollection } from "../config/db.js";
import { emitDirectMessageEvent } from "../socketManager.js";

interface DirectMessageRecord extends Document {
  from: string;
  to: string;
  message: string;
  createdAt: Date;
}

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

// --------------------- SEND 1-1 MESSAGE ---------------------
export const sendDirectMessage = async (req: Request, res: Response) => {
  const { from, to, message, suppressRealtime } = req.body as {
    from?: string;
    to?: string;
    message?: string;
    suppressRealtime?: boolean;
  };

  if (!from || !to || !message) {
    return res.status(400).json({
      status: "error",
      message: "from, to & message fields are required",
    });
  }

  try {
    const payload: DirectMessageRecord = {
      from,
      to,
      message,
      createdAt: new Date(),
    };

    const collection = getCollection<DirectMessageRecord>("directMessages");
    const result: InsertOneResult<DirectMessageRecord> =
      await collection.insertOne(payload);
    const insertedId = result.insertedId?.toString();
    const responsePayload = {
      id: insertedId,
      ...payload,
    };

    // Let REST-originated messages appear instantly for connected sockets.
    if (!suppressRealtime) {
      try {
        emitDirectMessageEvent(responsePayload);
      } catch (socketError) {
        const messageText =
          socketError instanceof Error ? socketError.message : "unknown error";
        console.warn("Socket emit skipped:", messageText);
      }
    }

    return res.status(201).json({
      status: "success",
      message: "Direct message saved",
      data: responsePayload,
    });
  } catch (error) {
    console.error("Direct message DB error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to save direct message",
    });
  }
};

// --------------------- FETCH 1-1 CHAT MESSAGES ---------------------
export const getDirectMessages = async (req: Request, res: Response) => {
  const { userA, userB } = req.params as { userA?: string; userB?: string };
  const page = parseNumber(req.query.page, 1);
  const limit = parseNumber(req.query.limit, 20);

  if (!userA || !userB) {
    return res.status(400).json({
      status: "error",
      message: "userA and userB are required",
    });
  }

  try {
    const skip = (page - 1) * limit;

    const messages = await getCollection<DirectMessageRecord>("directMessages")
      .find({
        $or: [
          { from: userA, to: userB },
          { from: userB, to: userA }
        ]
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      status: "success",
      page,
      limit,
      data: messages,
    });
  } catch (error) {
    console.error("Fetch 1-1 messages error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to fetch direct messages",
    });
  }
};
// --------------------- DELETE 1-1 MESSAGE ---------------------
export const deleteDirectMessage = async (req: Request, res: Response) => {
  const { messageId } = req.params as { messageId?: string };

  if (!messageId || !ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid messageId",
    });
  }

  try {
    const result = await getCollection("directMessages").deleteOne({
      _id: new ObjectId(messageId),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Message not found",
      });
    }

    return res.json({
      status: "success",
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.error("Delete direct message error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to delete message",
    });
  }
};
