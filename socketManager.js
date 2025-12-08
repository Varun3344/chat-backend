import { Server } from "socket.io";

let ioInstance = null;

export const getDirectRoomId = (userA, userB) => {
  if (!userA || !userB) {
    return null;
  }

  return [String(userA), String(userB)].sort().join("_");
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

    socket.on("join_direct_room", ({ userA, userB }) => {
      const roomId = getDirectRoomId(userA, userB);

      if (!roomId) {
        return;
      }

      socket.join(roomId);
      console.log(`Socket ${socket.id} joined direct room ${roomId}`);
    });

    socket.on("send_direct_message", ({ from, to, message }) => {
      const roomId = getDirectRoomId(from, to);

      if (!roomId) {
        return;
      }

      ioInstance.to(roomId).emit("receive_direct_message", { from, to, message });
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

      ioInstance.to(groupId).emit("receive_group_message", { groupId, from, message });
    });

    socket.on("disconnect", () => {
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
