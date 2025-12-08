import { getCollection } from "../config/db.js";

export const createGroup = async (req, res) => {
  try {
    const groups = getCollection("groups");

    const { groupName, createdBy, members } = req.body;

    if (!groupName || !createdBy) {
      return res.status(400).json({
        status: "error",
        message: "groupName and createdBy are required",
      });
    }

    const newGroup = {
      groupName,
      createdBy,
      members: members || [],
      createdAt: new Date(),
    };

    const result = await groups.insertOne(newGroup);

    return res.json({
      status: "success",
      message: "Group created successfully!",
      groupId: result.insertedId,
    });

  } catch (error) {
    console.error("Group creation error:", error);
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
