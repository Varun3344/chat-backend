import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

// --------------------- SEND 1-1 MESSAGE ---------------------
export const sendDirectMessage = async (req, res) => {
  const { from, to, message } = req.body;

  if (!from || !to || !message) {
    return res.status(400).json({
      status: "error",
      message: "from, to & message fields are required",
    });
  }

  try {
    const payload = {
      from,
      to,
      message,
      createdAt: new Date(),
    };

    const result = await getCollection("directMessages").insertOne(payload);

    return res.status(201).json({
      status: "success",
      message: "Direct message saved",
      data: {
        id: result.insertedId,
        ...payload,
      },
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
export const getDirectMessages = async (req, res) => {
  const { userA, userB } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  if (!userA || !userB) {
    return res.status(400).json({
      status: "error",
      message: "userA and userB are required",
    });
  }

  try {
    const skip = (page - 1) * limit;

    const messages = await getCollection("directMessages")
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
export const deleteDirectMessage = async (req, res) => {
  const { messageId } = req.params;

  if (!ObjectId.isValid(messageId)) {
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
