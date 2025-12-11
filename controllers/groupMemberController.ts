import { ObjectId, WithId, Document, UpdateFilter } from "mongodb";
import { Request, Response } from "express";
import { getCollection } from "../config/db.js";
import {
  emitGroupMemberAddedEvent,
  emitGroupMemberRemovedEvent,
} from "../socketManager.js";
import { broadcastGroupSystemMessage } from "../services/groupNotificationService.js";

interface GroupDocument extends Document {
  _id: ObjectId;
  groupName?: string;
  name?: string;
  members?: string[];
  createdBy: string;
  createdAt: Date;
}

interface NormalizedGroup {
  id: string;
  groupId: string;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: Date;
}

const parseObjectId = (id?: string) => {
  try {
    return id ? new ObjectId(id) : null;
  } catch {
    return null;
  }
};

const mapGroup = (group?: WithId<GroupDocument> | null): NormalizedGroup | null => {
  if (!group) return null;
  const members = Array.isArray(group.members)
    ? group.members.map((member) => member.toString())
    : [];
  const identifier = group._id?.toString();
  return {
    id: identifier,
    groupId: identifier,
    name: group.groupName ?? group.name ?? "Untitled group",
    members,
    createdBy: group.createdBy,
    createdAt: group.createdAt,
  };
};

const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
  } else {
    setTimeout(callback, 0);
  }
};

// Add a member to an existing group document
export const addMember = async (req: Request, res: Response) => {
  const { groupId, memberId, addedBy } = req.body as {
    groupId?: string;
    memberId?: string;
    addedBy?: string;
  };

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
    const groups = getCollection<GroupDocument>("groups");
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
      { $addToSet: { members: memberId } } as unknown as UpdateFilter<GroupDocument>,
      { returnDocument: "after", includeResultMetadata: true }
    );
    if (!updatedGroup || !updatedGroup.value) {
      return res.status(500).json({
        status: "error",
        message: "Unable to add member",
      });
    }
    const normalizedGroup = mapGroup(updatedGroup.value);

    if (normalizedGroup) {
      scheduleMicrotask(() => {
        try {
          emitGroupMemberAddedEvent({
            ...normalizedGroup,
            eventType: "member_added",
            newlyAddedMemberId: memberId,
            memberId,
            addedBy,
            initiatedBy: addedBy || memberId,
          });
        } catch (socketError) {
          const message =
            socketError instanceof Error ? socketError.message : "unknown error";
          console.warn("Member add notification skipped:", message);
        }
      });

      scheduleMicrotask(() => {
        const summary =
          addedBy && addedBy !== memberId
            ? `${addedBy} added ${memberId} to ${normalizedGroup.name}.`
            : `${memberId} joined ${normalizedGroup.name}.`;

        broadcastGroupSystemMessage({
          groupId: normalizedGroup.groupId,
          from: addedBy || memberId,
          message: summary,
          metadata: { eventType: "member_added", memberId },
          memberIds: normalizedGroup.members,
        }).catch((notificationError) => {
          const message =
            notificationError instanceof Error
              ? notificationError.message
              : "unknown error";
          console.warn("Member add message skipped:", message);
        });
      });
    }

    return res.json({
      status: "success",
      message: "Member added successfully",
      group: normalizedGroup ?? updatedGroup.value,
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
export const removeMember = async (req: Request, res: Response) => {
  const { groupId, memberId, removedBy } = req.body as {
    groupId?: string;
    memberId?: string;
    removedBy?: string;
  };

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
    const groups = getCollection<GroupDocument>("groups");
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
      { $pull: { members: memberId } } as unknown as UpdateFilter<GroupDocument>,
      { returnDocument: "after", includeResultMetadata: true }
    );
    if (!updatedGroup || !updatedGroup.value) {
      return res.status(500).json({
        status: "error",
        message: "Unable to remove member",
      });
    }
    const normalizedGroup = mapGroup(updatedGroup.value);

    if (normalizedGroup) {
      scheduleMicrotask(() => {
        try {
          emitGroupMemberRemovedEvent({
            ...normalizedGroup,
            eventType: "member_removed",
            removedMemberId: memberId,
            memberId,
            removedBy,
            initiatedBy: removedBy || memberId,
          });
        } catch (socketError) {
          const message =
            socketError instanceof Error ? socketError.message : "unknown error";
          console.warn("Member removal notification skipped:", message);
        }
      });

      scheduleMicrotask(() => {
        const summary =
          removedBy && removedBy !== memberId
            ? `${removedBy} removed ${memberId} from ${normalizedGroup.name}.`
            : `${memberId} left ${normalizedGroup.name}.`;

        broadcastGroupSystemMessage({
          groupId: normalizedGroup.groupId,
          from: removedBy || memberId,
          message: summary,
          metadata: { eventType: "member_removed", memberId },
          memberIds: normalizedGroup.members,
        }).catch((notificationError) => {
          const message =
            notificationError instanceof Error
              ? notificationError.message
              : "unknown error";
          console.warn("Member removal message skipped:", message);
        });
      });
    }

    return res.json({
      status: "success",
      message: "Member removed successfully",
      group: normalizedGroup ?? updatedGroup.value,
    });
  } catch (error) {
    console.error("Remove member error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to remove member",
    });
  }
};

export const getGroupsForUser = async (req: Request, res: Response) => {
  const { userId } = req.params as { userId?: string };

  if (!userId) {
    return res.status(400).json({
      status: "error",
      message: "userId is required",
    });
  }

  try {
    const groups = getCollection<GroupDocument>("groups");
    const cursor = groups
      .find({
        $or: [{ members: userId }, { createdBy: userId }],
      })
      .sort({ createdAt: -1 });

    const results = await cursor.toArray();

    return res.json({
      status: "success",
      count: results.length,
      groups: results.map(mapGroup).filter(Boolean),
    });
  } catch (error) {
    console.error("Fetch user groups error:", error);
    return res.status(500).json({
      status: "error",
      message: "Unable to load user groups",
    });
  }
};
