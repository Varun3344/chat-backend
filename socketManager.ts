import type { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";

interface DirectMessagePayload {
  from: string;
  to: string;
  message: string;
  senderSocketId?: string;
}

interface GroupMessagePayload {
  groupId: string;
  from: string;
  message: string;
  senderSocketId?: string;
}

interface GroupSocketPayload {
  id?: string;
  groupId?: string;
  name?: string;
  members?: string[];
  createdBy?: string;
  [key: string]: unknown;
}

type Nullable<T> = T | null | undefined;

let ioInstance: Server | null = null;

export const getDirectRoomId = (
  userA?: string | number | null,
  userB?: string | number | null
): string | null => {
  if (!userA || !userB) {
    return null;
  }

  return [String(userA), String(userB)].sort().join("_");
};

const getUserRoomId = (userId?: string | number | null): string | null => {
  if (!userId) return null;
  return `user:${String(userId)}`;
};

const emitToUserRooms = (
  rooms: Nullable<string>[] = [],
  eventName: string,
  payload: unknown
): void => {
  if (!ioInstance) return;
  const uniqueRooms = [...new Set(rooms.filter(Boolean))] as string[];
  uniqueRooms.forEach((room) => {
    ioInstance!.to(room).emit(eventName, payload);
  });
};

export const emitDirectMessageEvent = (payload: DirectMessagePayload): void => {
  if (!payload) return;
  const rooms = [getUserRoomId(payload.from), getUserRoomId(payload.to)];
  emitToUserRooms(rooms, "receive_direct_message", payload);
};

export const emitGroupMessageEvent = (
  groupId: string,
  payload: GroupMessagePayload
): void => {
  if (!ioInstance || !groupId || !payload) return;
  ioInstance.to(groupId).emit("receive_group_message", payload);
};

export const emitGroupCreatedEvent = (group: GroupSocketPayload): void => {
  if (!group) return;
  const members = Array.isArray(group.members) ? group.members : [];
  const rooms = [
    ...members.map((memberId) => getUserRoomId(memberId)),
    getUserRoomId(group.createdBy),
  ];
  emitToUserRooms(rooms, "group_created", group);
};

const registerUserFactory =
  (socket: Socket) =>
  (payload: { userId?: string; id?: string } | string): void => {
    const userId =
      typeof payload === "string" ? payload : payload?.userId ?? payload?.id;
    const roomId = getUserRoomId(userId);
    if (!roomId) {
      return;
    }

    if (socket.data?.userRoomId && socket.data.userRoomId !== roomId) {
      socket.leave(socket.data.userRoomId);
    }

    socket.join(roomId);
    socket.data.userRoomId = roomId;
    console.log(`Socket ${socket.id} registered user ${userId}`);
  };

export const initSocket = (httpServer: HTTPServer): Server => {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  ioInstance.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on("register_user", registerUserFactory(socket));

    socket.on(
      "join_direct_room",
      ({ userA, userB }: { userA?: string; userB?: string }) => {
        const roomId = getDirectRoomId(userA, userB);

        if (!roomId) {
          return;
        }

        socket.join(roomId);
        console.log(`Socket ${socket.id} joined direct room ${roomId}`);
      }
    );

    socket.on(
      "send_direct_message",
      ({ from, to, message }: DirectMessagePayload) => {
        emitDirectMessageEvent({
          from,
          to,
          message,
          senderSocketId: socket.id,
        });
      }
    );

    socket.on("join_group", (payload: string | { groupId?: string }) => {
      const groupId = typeof payload === "string" ? payload : payload?.groupId;

      if (!groupId) {
        return;
      }

      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
    });

    socket.on(
      "send_group_message",
      ({ groupId, from, message }: GroupMessagePayload) => {
        if (!groupId) {
          return;
        }

        ioInstance!
          .to(groupId)
          .emit("receive_group_message", {
            groupId,
            from,
            message,
            senderSocketId: socket.id,
          });
      }
    );

    socket.on(
      "sendMessage",
      (payload: {
        cipherText?: string;
        meta?: Record<string, unknown>;
        senderId?: string;
        createdAt?: number;
      } = {}) => {
        if (!payload.cipherText) {
          return;
        }

        const eventPayload = {
          cipherText: payload.cipherText,
          meta: payload.meta ?? {},
          senderId: payload.senderId ?? socket.id,
          createdAt: payload.createdAt ?? Date.now(),
        };

        ioInstance!.emit("receiveMessage", eventPayload);
      }
    );

    socket.on("disconnect", () => {
      const { userRoomId } = (socket.data || {}) as { userRoomId?: string };
      if (userRoomId) {
        socket.leave(userRoomId);
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
};

export const getIO = (): Server => {
  if (!ioInstance) {
    throw new Error("Socket.IO has not been initialized yet");
  }
  return ioInstance;
};
