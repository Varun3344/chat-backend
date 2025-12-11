import type { Socket, Server } from "socket.io";
import EncryptedMessageModel from "../models/EncryptedMessage.js";

interface EncryptedPayload {
  conversationId?: string;
  from?: string;
  to?: string;
  ciphertext?: string;
  iv?: string;
}

const sanitize = (value?: string): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildUserRoom = (userId?: string | null) =>
  userId ? `user:${String(userId)}` : null;

export const registerEncryptedMessageHandlers = (socket: Socket, io: Server): void => {
  socket.on("sendMessage", async (payload: EncryptedPayload = {}) => {
    const conversationId = sanitize(payload.conversationId);
    const from = sanitize(payload.from);
    const to = sanitize(payload.to);
    const ciphertext = sanitize(payload.ciphertext);
    const iv = sanitize(payload.iv);

    if (!conversationId || !from || !to || !ciphertext || !iv) {
      socket.emit("newMessage:error", {
        message: "conversationId, from, to, ciphertext and iv are required",
      });
      return;
    }

    try {
      const record = await EncryptedMessageModel.create({
        conversationId,
        from,
        to,
        ciphertext,
        iv,
      });

      const outbound = {
        conversationId,
        from,
        to,
        ciphertext,
        iv,
        createdAt: record.createdAt?.toISOString?.() ?? new Date().toISOString(),
      };

      socket.emit("newMessage", outbound);

      const recipientRoom = buildUserRoom(to);
      if (recipientRoom) {
        socket.to(recipientRoom).emit("newMessage", outbound);
      } else {
        io.emit("newMessage", outbound);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to persist encrypted message";
      socket.emit("newMessage:error", { message });
    }
  });
};

export default registerEncryptedMessageHandlers;
