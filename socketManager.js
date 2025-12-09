import { Server } from "socket.io";

let ioInstance = null;

export const getDirectRoomId = (userA, userB) => {
  if (!userA || !userB) {
    return null;
  }

  return [String(userA), String(userB)].sort().join("_");
};

const getUserRoomId = (userId) => {
  if (!userId) return null;
  return `user:${String(userId)}`;
};

const emitToUserRooms = (rooms = [], eventName, payload) => {
  if (!ioInstance) return;
  const uniqueRooms = [...new Set(rooms.filter(Boolean))];
  uniqueRooms.forEach((room) => {
    ioInstance.to(room).emit(eventName, payload);
  });
};

export const emitDirectMessageEvent = (payload) => {
  if (!payload) return;
  const rooms = [getUserRoomId(payload.from), getUserRoomId(payload.to)];
  emitToUserRooms(rooms, "receive_direct_message", payload);
};

export const emitGroupMessageEvent = (groupId, payload) => {
  if (!ioInstance || !groupId || !payload) return;
  ioInstance.to(groupId).emit("receive_group_message", payload);
};

export const initSocket = (httpServer) => {
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

    const registerUser = (payload) => {
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

    socket.on("register_user", registerUser);

    socket.on("join_direct_room", ({ userA, userB }) => {
      const roomId = getDirectRoomId(userA, userB);

      if (!roomId) {
        return;
      }

      socket.join(roomId);
      console.log(`Socket ${socket.id} joined direct room ${roomId}`);
    });

    socket.on("send_direct_message", ({ from, to, message }) => {
      emitDirectMessageEvent({ from, to, message, senderSocketId: socket.id });
    });

    socket.on("join_group", (payload) => {
      const groupId = typeof payload === "string" ? payload : payload?.groupId;

      if (!groupId) {
        return;
      }

      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
    });

    socket.on("send_group_message", ({ groupId, from, message }) => {
      if (!groupId) {
        return;
      }

      ioInstance
        .to(groupId)
        .emit("receive_group_message", { groupId, from, message, senderSocketId: socket.id });
    });

    socket.on("sendMessage", (payload = {}) => {
      if (!payload.cipherText) {
        return;
      }

      const eventPayload = {
        cipherText: payload.cipherText,
        meta: payload.meta ?? {},
        senderId: payload.senderId ?? socket.id,
        createdAt: payload.createdAt ?? Date.now(),
      };

      ioInstance.emit("receiveMessage", eventPayload);
    });

    socket.on("disconnect", () => {
      const { userRoomId } = socket.data || {};
      if (userRoomId) {
        socket.leave(userRoomId);
      }
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return ioInstance;
};

export const getIO = () => {
  if (!ioInstance) {
    throw new Error("Socket.IO has not been initialized yet");
  }
  return ioInstance;
};
