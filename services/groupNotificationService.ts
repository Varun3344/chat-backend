import type { Document, InsertOneResult } from "mongodb";
import { getCollection } from "../config/db.js";
import { emitGroupMessageEvent } from "../socketManager.js";

const normalizeGroupId = (value?: string | number | null): string | null => {
  if (!value && value !== 0) return null;
  return String(value);
};

interface BroadcastOptions {
  groupId: string;
  from?: string;
  message: string;
  metadata?: Record<string, unknown>;
  memberIds?: string[];
}

interface SystemMessageRecord extends Document {
  groupId: string;
  from: string;
  message: string;
  createdAt: Date;
  system: true;
  [key: string]: unknown;
}

/**
 * Persist a lightweight system message for a group and fan it out over the socket.
 * This is used for creation / membership events so every member gets the update
 * even if they were not online when the action happened.
 */
export const broadcastGroupSystemMessage = async ({
  groupId,
  from = "system",
  message,
  metadata = {},
  memberIds = [],
}: BroadcastOptions): Promise<SystemMessageRecord & { id?: string }> => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId || !message) {
    throw new Error("groupId and message are required for system notifications");
  }

  const now = new Date();
  const record: SystemMessageRecord = {
    groupId: normalizedGroupId,
    from,
    message,
    createdAt: now,
    system: true,
    ...metadata,
  };

  const groupMessages = getCollection<SystemMessageRecord>("groupMessages");
  const result: InsertOneResult<SystemMessageRecord> =
    await groupMessages.insertOne(record);
  const payload = {
    id: result.insertedId?.toString(),
    ...record,
  };

  try {
    emitGroupMessageEvent(normalizedGroupId, payload, memberIds);
  } catch (socketError) {
    const messageText =
      socketError instanceof Error ? socketError.message : "unknown error";
    console.warn("System message emit skipped:", messageText);
  }

  return payload;
};
