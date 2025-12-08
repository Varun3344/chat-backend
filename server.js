import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { verifyApiKey } from "./middleware/apiKeyAuth.js";
import { connectDB } from "./config/db.js";

import directMessageRoutes from "./routes/directMessageRoutes.js";
import groupMessageRoutes from "./routes/groupMessageRoutes.js";
import groupCreateRoutes from "./routes/groupCreateRoutes.js";
import groupMemberRoutes from "./routes/groupMemberRoutes.js";
import directAttachmentRoutes from "./routes/directAttachmentRoutes.js";
import groupAttachmentRoutes from "./routes/groupAttachmentRoutes.js";
import { swaggerSpec, swaggerUiMiddleware } from "./swagger/swagger.js";

import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
connectDB();

// REST API ROUTES
app.use("/chat/direct", directMessageRoutes);
app.use("/chat/direct", directAttachmentRoutes);

app.use(
  "/chat/group/create",
  verifyApiKey([process.env.API_KEY_GROUP_CREATE, process.env.API_KEY_ADMIN]),
  groupCreateRoutes
);

app.use(
  "/chat/group/member",
  verifyApiKey([
    process.env.API_KEY_GROUP_MEMBER,
    process.env.API_KEY_ADMIN,
  ]),
  groupMemberRoutes
);

app.use("/chat/group/attachment", groupAttachmentRoutes);
app.use("/chat/group", groupMessageRoutes);
app.use("/docs", swaggerUiMiddleware.serve, swaggerUiMiddleware.setup(swaggerSpec));

console.log("Swagger Docs available at /docs");

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const getDirectRoomId = (userA, userB) => {
  if (!userA || !userB) {
    return null;
  }

  return [String(userA), String(userB)].sort().join("_");
};

io.on("connection", (socket) => {
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

    io.to(roomId).emit("receive_direct_message", { from, to, message });
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

    io.to(groupId).emit("receive_group_message", { groupId, from, message });
  });

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server + Socket.IO running on port ${PORT}`);
});

export { io };
