import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { verifyApiKey } from "./routes/middleware/apiKeyAuth.js";
import { connectDB } from "./config/db.js";
import { connectMongoose } from "./config/mongoose.js";

import directMessageRoutes from "./routes/directMessageRoutes.js";
import groupMessageRoutes from "./routes/groupMessageRoutes.js";
import groupCreateRoutes from "./routes/groupCreateRoutes.js";
import groupMemberRoutes from "./routes/groupMemberRoutes.js";
import directAttachmentRoutes from "./routes/directAttachmentRoutes.js";
import groupAttachmentRoutes from "./routes/groupAttachmentRoutes.js";
import { swaggerSpec, swaggerUiMiddleware } from "./swagger/swagger.js";
import keyRoutes from "./routes/keyRoutes.js";

import { createServer } from "http";
import detectPort from "detect-port";
import { initSocket } from "./socketManager.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
connectDB();
void connectMongoose().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Mongoose connection error:", message);
});

const gatherKeys = (label: string, ...keys: Array<string | undefined>): string[] => {
  const values = keys.filter((key): key is string => Boolean(key));
  if (values.length === 0) {
    throw new Error(`Missing API key configuration for ${label}`);
  }
  return values;
};

// REST API ROUTES
app.use("/chat/direct", directMessageRoutes);
app.use("/chat/direct", directAttachmentRoutes);

app.use(
  "/chat/group/create",
  verifyApiKey(
    gatherKeys(
      "group create",
      process.env.API_KEY_GROUP_CREATE,
      process.env.API_KEY_ADMIN
    )
  ),
  groupCreateRoutes
);

app.use(
  "/chat/group/member",
  verifyApiKey(
    gatherKeys(
      "group member",
      process.env.API_KEY_GROUP_MEMBER,
      process.env.API_KEY_ADMIN
    )
  ),
  groupMemberRoutes
);

app.use("/chat/group/attachment", groupAttachmentRoutes);
app.use("/chat/group", groupMessageRoutes);
app.use("/keys", keyRoutes);
app.use("/docs", swaggerUiMiddleware.serve, swaggerUiMiddleware.setup(swaggerSpec));

console.log("Swagger Docs available at /docs");

const DEFAULT_PORT = Number(process.env.PORT ?? 5000);

const httpServer = createServer(app);
initSocket(httpServer);

const startServer = async (): Promise<void> => {
  try {
    const availablePort = await detectPort(DEFAULT_PORT);

    if (availablePort !== DEFAULT_PORT) {
      console.warn(
        `Port ${DEFAULT_PORT} is busy, switched server to port ${availablePort}`
      );
    }

    httpServer.listen(availablePort, () => {
      console.log(`Server + Socket.IO running on port ${availablePort}`);
    });
  } catch (error) {
    console.error("Unable to start server:", error);
    process.exit(1);
  }
};
startServer();
