import { ObjectId } from "mongodb";
import { getCollection } from "../config/db.js";

const parseObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch (error) {
    return null;
  }
};

// Add a member to an existing group document
export const addMember = async (req, res) => {
  const { groupId, memberId } = req.body;

  if (!groupId || !memberId) {
    return res.status(400).json({
      status: "error",
      message: "groupId and memberId are required",
    });
  }

  const objectId = parseObjectId(groupId);

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

    const members = Array.isArray(group.members) ? group.members : [];

    if (members.includes(memberId)) {
      return res.status(400).json({
        status: "error",
        message: "Member already exists in group",
      });
    }

    const updatedGroup = await groups.findOneAndUpdate(
      { _id: objectId },
      { $addToSet: { members: memberId } },
      { returnDocument: "after" }
    );

    return res.json({
      status: "success",
      message: "Member added successfully",
      group: updatedGroup.value,
    });
  } catch (error) {
    console.error("Add member error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to add member",
    });
  }
};

// Remove an existing member from the group
export const removeMember = async (req, res) => {
  const { groupId, memberId } = req.body;

  if (!groupId || !memberId) {
    return res.status(400).json({
      status: "error",
      message: "groupId and memberId are required",
    });
  }

  const objectId = parseObjectId(groupId);

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

    const members = Array.isArray(group.members) ? group.members : [];

    if (!members.includes(memberId)) {
      return res.status(400).json({
        status: "error",
        message: "Member not part of this group",
      });
    }

    const updatedGroup = await groups.findOneAndUpdate(
      { _id: objectId },
      { $pull: { members: memberId } },
      { returnDocument: "after" }
    );

    return res.json({
      status: "success",
      message: "Member removed successfully",
      group: updatedGroup.value,
    });
  } catch (error) {
    console.error("Remove member error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to remove member",
    });
  }
};
