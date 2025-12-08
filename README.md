# Chat Backend

Node.js + Socket.IO backend that handles REST chat APIs, MongoDB persistence, and realtime delivery for both direct and group messaging.

## Requirements
- Node.js 18+ (includes npm)
- Access to a MongoDB database (Atlas or self-hosted)
- `.env` file with the following variables (sample values shown):
  ```bash
  PORT=5001
  API_KEY_DIRECT=LAW-DIRECT-12345
  API_KEY_DIRECT_FETCH=LAW-DIRECT-FETCH-88990
  API_KEY_ADMIN=LAW-ADMIN-55555
  API_KEY_GROUP=LAW-GROUP-98765
  API_KEY_GROUP_CREATE=LAW-GROUP-CREATE-44556
  API_KEY_GROUP_MEMBER=LAW-GROUP-MEMBER-77889
  API_KEY_DIRECT_ATTACHMENT=LAW-DIRECT-ATTACH-55667
  API_KEY_DIRECT_DELETE=LAW-DIRECT-DELETE-11223
  API_KEY_GROUP_DELETE=LAW-GROUP-DELETE-33445
  MONGO_URI=mongodb+srv://<user>:<pass>@cluster/chatApp
  ```

## Installation & Local Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server with hot reload for development:
   ```bash
   npm run dev
   ```
   or run once with:
   ```bash
   npm start
   ```
3. REST endpoints are served from `http://localhost:<PORT>` and Swagger docs are at `http://localhost:<PORT>/docs`.

## Socket.IO Realtime Messaging
The HTTP server is upgraded to Socket.IO (`server.js`) and accepts clients from any origin. Point your clients to `ws://<host>:<PORT>` or use the default `http://` transport provided by the Socket.IO client SDK.

### Rooms & Events
- **Direct messaging**
  - Join a room that uniquely identifies two users:
    - Event: `join_direct_room`
    - Payload: `{ "userA": "<senderId>", "userB": "<receiverId>" }`
    - Room id is automatically generated server-side as `"minId_maxId"`.
  - Send message:
    - Event: `send_direct_message`
    - Payload: `{ "from": "<senderId>", "to": "<receiverId>", "message": "<text>" }`
    - Server emits `receive_direct_message` to both participants.
- **Group messaging**
  - Event: `join_group`
    - Payload: `{ "groupId": "<groupId>" }` (string payload is also accepted).
  - Event: `send_group_message`
    - Payload: `{ "groupId": "<groupId>", "from": "<senderId>", "message": "<text>" }`
    - Server emits `receive_group_message` to all sockets in that group room.

### Client Example (browser/React/Vue/etc.)
Install the client companion library:
```bash
npm install socket.io-client
```

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5001", {
  transports: ["websocket"], // helps on restricted networks/devices
});

socket.on("connect", () => {
  socket.emit("join_direct_room", { userA: "user1", userB: "user2" });
});

socket.on("receive_direct_message", (payload) => {
  console.log("Direct:", payload);
});

function sendMessage(text) {
  socket.emit("send_direct_message", { from: "user1", to: "user2", message: text });
}
```

### Verifying Cross-Device Realtime
1. Run the backend once on a machine reachable by others (LAN/public) and ensure the `PORT` is open.
2. Connect two devices with the client SDK, emit the `join_*` events, and send sample messages.
3. Watch the backend logs (`Socket connected`, `joined`, `receive_*`) to confirm traffic.
4. Optionally use `npx socket.io-client` CLI or Postman’s WebSocket tab to test without a UI.

Following the steps above ensures Socket.IO is installed, configured, and operating like a realtime chat system across devices.
