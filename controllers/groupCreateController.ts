import { InsertOneResult, Document } from "mongodb";
import { Request, Response } from "express";
import { getCollection } from "../config/db.js";
import { broadcastGroupSystemMessage } from "../services/groupNotificationService.js";
import { emitGroupCreatedEvent } from "../socketManager.js";

interface GroupRecord extends Document {
  groupName: string;
  createdBy: string;
  members: string[];
  createdAt: Date;
}

interface GroupPayload {
  id: string;
  groupId: string;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: Date;
  description: string;
  eventType: string;
  [key: string]: unknown;
}

const scheduleMicrotask = (callback: () => void): void => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
  } else {
    setTimeout(callback, 0);
  }
};

const sanitizeMembers = (
  createdBy: string,
  members: unknown = []
): string[] => {
  const normalized = Array.isArray(members) ? members : [];
  const fullList = [createdBy, ...normalized]
    .filter(Boolean)
    .map((member) => member!.toString());
  return [...new Set(fullList)];
};

export const createGroup = async (req: Request, res: Response) => {
  try {
    const groups = getCollection<GroupRecord>("groups");

    const { groupName, createdBy, members } = req.body as {
      groupName?: string;
      createdBy?: string;
      members?: string[];
    };

    if (!groupName || !createdBy) {
      return res.status(400).json({
        status: "error",
        message: "groupName and createdBy are required",
      });
    }

    const safeMembers = sanitizeMembers(createdBy, members);
    const newGroup: GroupRecord = {
      groupName,
      createdBy,
      members: safeMembers,
      createdAt: new Date(),
    };

    const result: InsertOneResult<GroupRecord> = await groups.insertOne(newGroup);
    const groupId = result.insertedId?.toString();
    if (!groupId) {
      throw new Error("Group creation failed: unable to determine groupId");
    }
    const createdPayload: GroupPayload = {
      id: groupId,
      groupId,
      name: groupName,
      members: safeMembers,
      createdBy,
      createdAt: newGroup.createdAt,
      description: "Custom group",
      eventType: "created",
    };

    scheduleMicrotask(() => {
      try {
        emitGroupCreatedEvent(createdPayload);
      } catch (socketError) {
        const message =
          socketError instanceof Error ? socketError.message : "unknown error";
        console.warn("Group create notification failed:", message);
      }
    });

    scheduleMicrotask(() => {
      const addedCount = Math.max(safeMembers.length - 1, 0);
      const summary =
        addedCount === 0
          ? `${createdBy} created ${groupName}.`
          : `${createdBy} created ${groupName} and added ${addedCount} teammate${
              addedCount === 1 ? "" : "s"
            }.`;

      broadcastGroupSystemMessage({
        groupId,
        from: createdBy,
        message: summary,
        metadata: { eventType: "group_created" },
        memberIds: safeMembers,
      }).catch((notificationError) => {
        const message =
          notificationError instanceof Error
            ? notificationError.message
            : "unknown error";
        console.warn("Group creation message skipped:", message);
      });
    });

    return res.json({
      status: "success",
      message: "Group created successfully!",
      groupId,
      group: createdPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Group creation error:", error);
    return res.status(500).json({
      status: "error",
      message,
    });
  }
};
