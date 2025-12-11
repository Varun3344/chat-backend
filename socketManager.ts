import type { Server as HTTPServer } from "http";
import { Server, Socket } from "socket.io";
import { registerEncryptedMessageHandlers } from "./socketHandlers/encryptedMessages.js";

interface DirectMessagePayload {
  from: string;
  to: string;
  message: string;
  senderSocketId?: string;
  clientMessageId?: string;
  presenceStatus?: PresenceStatus;
}

interface GroupMessagePayload {
  groupId: string;
  from: string;
  message: string;
  senderSocketId?: string;
  clientMessageId?: string;
  system?: boolean;
  presenceStatus?: PresenceStatus;
  memberIds?: string[];
  [key: string]: unknown;
}

interface GroupSocketPayload {
  id?: string;
  groupId?: string;
  name?: string;
  members?: string[];
  createdBy?: string;
  description?: string;
  initiatedBy?: string;
  memberId?: string;
  addedBy?: string;
  removedBy?: string;
  presenceStatus?: PresenceStatus;
  eventType?: string;
  [key: string]: unknown;
}

interface AttachmentSocketPayload {
  id?: string;
  from: string;
  to?: string;
  groupId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date | string | number;
  type: "attachment";
  message?: string;
  presenceStatus?: PresenceStatus;
  [key: string]: unknown;
}

type Nullable<T> = T | null | undefined;
type PresenceStatus = "online" | "offline";

interface UserRealtimeState {
  userId: string;
  userRoomId: string;
  sockets: Set<string>;
  status: PresenceStatus;
  lastSeen: number;
  activeDirectPeerId: string | null;
  activeGroupRoomId: string | null;
  directUnread: Map<string, number>;
  groupUnread: Map<string, number>;
}

interface UnreadSummary {
  userId: string;
  direct: Record<string, number>;
  group: Record<string, number>;
}

interface SocketMeta {
  userId?: string;
  userRoomId?: string;
  activeDirectRoomId?: string | null;
  activeGroupRoomId?: string | null;
}

const GROUP_JOIN_EVENTS = ["join_group", "join_group_room"];
const GROUP_LEAVE_EVENTS = ["leave_group", "leave_group_room"];
const LEGACY_DIRECT_TYPING_EVENT = "direct_typing";
const LEGACY_GROUP_TYPING_EVENT = "group_typing";
const TYPING_EVENT = "typing";
const GROUP_MESSAGE_EVENT = "group:message";
const LEGACY_GROUP_MESSAGE_EVENT = "receive_group_message";
const LEGACY_GROUP_ACTIVITY_EVENT = "group_created";
const GROUP_CREATED_EVENT = "group:created";
const GROUP_UPDATED_EVENT = "group:updated";
const GROUP_MEMBER_ADDED_EVENT = "group:memberAdded";
const GROUP_MEMBER_REMOVED_EVENT = "group:memberRemoved";
const GROUP_EVENT_TYPE_LOOKUP: Record<string, string> = {
  [GROUP_CREATED_EVENT]: "created",
  [GROUP_UPDATED_EVENT]: "updated",
  [GROUP_MEMBER_ADDED_EVENT]: "member_added",
  [GROUP_MEMBER_REMOVED_EVENT]: "member_removed",
};

let ioInstance: Server | null = null;
const userStates = new Map<string, UserRealtimeState>();

const resolvePresenceStatus = (userId?: string | null): PresenceStatus => {
  if (!userId) {
    return "offline";
  }
  const normalizedId = String(userId);
  return userStates.get(normalizedId)?.status ?? "offline";
};

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

const initializeUserState = (
  userId: string,
  userRoomId: string
): UserRealtimeState => ({
  userId,
  userRoomId,
  sockets: new Set<string>(),
  status: "offline",
  lastSeen: Date.now(),
  activeDirectPeerId: null,
  activeGroupRoomId: null,
  directUnread: new Map<string, number>(),
  groupUnread: new Map<string, number>(),
});

const getOrCreateUserState = (userId: string): UserRealtimeState => {
  const userRoomId = getUserRoomId(userId);
  if (!userRoomId) {
    throw new Error(`Unable to determine room for user ${userId}`);
  }
  const existing = userStates.get(userId);
  if (existing) {
    return existing;
  }
  const next = initializeUserState(userId, userRoomId);
  userStates.set(userId, next);
  return next;
};

const mapUnreadToObject = (source: Map<string, number>): Record<string, number> => {
  const entries = [...source.entries()].filter(([, value]) => value > 0);
  return Object.fromEntries(entries);
};

const buildUnreadSummary = (state: UserRealtimeState): UnreadSummary => ({
  userId: state.userId,
  direct: mapUnreadToObject(state.directUnread),
  group: mapUnreadToObject(state.groupUnread),
});

const emitUnreadSummary = (state: UserRealtimeState, socket?: Socket): void => {
  const summary = buildUnreadSummary(state);
  if (socket) {
    socket.emit("unread_counts", summary);
    return;
  }
  emitToUserRooms([state.userRoomId], "unread_counts", summary);
};

const presenceSnapshot = () =>
  [...userStates.values()].map((state) => ({
    userId: state.userId,
    status: state.status,
    lastSeen: state.lastSeen,
  }));

const sendPresenceSnapshot = (socket: Socket): void => {
  socket.emit("presence_snapshot", presenceSnapshot());
};

const broadcastPresenceUpdate = (state: UserRealtimeState): void => {
  if (!ioInstance) return;
  ioInstance.emit("user_presence", {
    userId: state.userId,
    status: state.status,
    lastSeen: state.lastSeen,
  });
};

const markUserOnline = (userId: string): UserRealtimeState => {
  const state = getOrCreateUserState(userId);
  state.status = "online";
  state.lastSeen = Date.now();
  broadcastPresenceUpdate(state);
  return state;
};

const markUserOffline = (userId: string): void => {
  const state = getOrCreateUserState(userId);
  state.status = "offline";
  state.lastSeen = Date.now();
  state.activeDirectPeerId = null;
  state.activeGroupRoomId = null;
  broadcastPresenceUpdate(state);
};

const setActiveDirectPeer = (userId: string, peerId: string | null): void => {
  const state = getOrCreateUserState(userId);
  state.activeDirectPeerId = peerId;
  if (peerId) {
    state.directUnread.delete(peerId);
  }
  emitUnreadSummary(state);
};

const clearActiveDirectPeer = (userId: string): void => {
  setActiveDirectPeer(userId, null);
};

const setActiveGroupRoom = (userId: string, groupId: string | null): void => {
  const state = getOrCreateUserState(userId);
  state.activeGroupRoomId = groupId;
  if (groupId) {
    state.groupUnread.delete(groupId);
  }
  emitUnreadSummary(state);
};

const clearActiveGroupRoom = (userId: string): void => {
  setActiveGroupRoom(userId, null);
};

const incrementDirectUnread = (userId: string, peerId: string): void => {
  if (!peerId) return;
  const state = getOrCreateUserState(userId);
  if (state.activeDirectPeerId === peerId) {
    if (state.directUnread.delete(peerId)) {
      emitUnreadSummary(state);
    }
    return;
  }
  const nextCount = (state.directUnread.get(peerId) ?? 0) + 1;
  state.directUnread.set(peerId, nextCount);
  emitUnreadSummary(state);
};

const incrementGroupUnread = (userId: string, groupId: string): void => {
  if (!groupId) return;
  const state = getOrCreateUserState(userId);
  if (state.activeGroupRoomId === groupId) {
    if (state.groupUnread.delete(groupId)) {
      emitUnreadSummary(state);
    }
    return;
  }
  const nextCount = (state.groupUnread.get(groupId) ?? 0) + 1;
  state.groupUnread.set(groupId, nextCount);
  emitUnreadSummary(state);
};

const trackDirectDelivery = (payload: Pick<DirectMessagePayload, "from" | "to">): void => {
  if (payload.to) {
    incrementDirectUnread(payload.to, payload.from);
  }
};

const sanitizeMemberIds = (members: unknown): string[] => {
  if (!Array.isArray(members)) return [];
  return members.map((member) => member?.toString?.() ?? "").filter(Boolean);
};

const trackGroupDelivery = (groupId: string, senderId: string | undefined, members: string[]): void => {
  members
    .filter((memberId) => memberId && memberId !== senderId)
    .forEach((memberId) => incrementGroupUnread(memberId, groupId));
};

export const emitDirectMessageEvent = (payload: DirectMessagePayload): void => {
  if (!payload) return;
  const rooms = [getUserRoomId(payload.from), getUserRoomId(payload.to)];
  const enrichedPayload: DirectMessagePayload = {
    ...payload,
    presenceStatus: payload.presenceStatus ?? resolvePresenceStatus(payload.from),
  };
  emitToUserRooms(rooms, "receive_direct_message", enrichedPayload);
  trackDirectDelivery(payload);
};

export const emitDirectAttachmentEvent = (payload: AttachmentSocketPayload): void => {
  if (!payload) return;
  const rooms = [getUserRoomId(payload.from), getUserRoomId(payload.to)];
  const enrichedPayload: AttachmentSocketPayload = {
    ...payload,
    presenceStatus: payload.presenceStatus ?? resolvePresenceStatus(payload.from),
  };
  emitToUserRooms(rooms, "direct_attachment_uploaded", enrichedPayload);
  if (payload.to) {
    incrementDirectUnread(payload.to, payload.from);
  }
};

export const emitGroupMessageEvent = (
  groupId: string,
  payload: GroupMessagePayload,
  memberIds: string[] = []
): void => {
  if (!ioInstance || !groupId || !payload) return;
  const enrichedPayload: GroupMessagePayload = {
    ...payload,
    presenceStatus: payload.presenceStatus ?? resolvePresenceStatus(payload.from),
  };
  ioInstance.to(groupId).emit(GROUP_MESSAGE_EVENT, enrichedPayload);
  ioInstance.to(groupId).emit(LEGACY_GROUP_MESSAGE_EVENT, enrichedPayload);
  trackGroupDelivery(groupId, payload.from, memberIds);
};

export const emitGroupAttachmentEvent = (
  groupId: string,
  payload: AttachmentSocketPayload,
  memberIds: string[] = []
): void => {
  if (!ioInstance || !groupId) return;
  const enrichedPayload: AttachmentSocketPayload = {
    ...payload,
    presenceStatus: payload.presenceStatus ?? resolvePresenceStatus(payload.from),
  };
  ioInstance.to(groupId).emit("group_attachment_uploaded", enrichedPayload);
  trackGroupDelivery(groupId, payload.from, memberIds);
};

const emitGroupActivityEvent = (
  eventName: string,
  payload: GroupSocketPayload,
  memberIds?: string[]
): void => {
  if (!payload) return;
  const resolvedMembers =
    memberIds && memberIds.length > 0
      ? sanitizeMemberIds(memberIds)
      : sanitizeMemberIds(payload.members ?? []);
  const extras: Array<string | undefined> = [
    payload.createdBy,
    payload.initiatedBy,
    payload.memberId,
    payload.addedBy,
    payload.removedBy,
  ];
  const rooms = [
    ...resolvedMembers.map((memberId) => getUserRoomId(memberId)),
    ...extras.map((memberId) => getUserRoomId(memberId)),
  ]
    .filter((roomId): roomId is string => Boolean(roomId));
  if (rooms.length === 0) {
    return;
  }
  const uniqueRooms = [...new Set(rooms)];
  const eventType =
    payload.eventType ?? GROUP_EVENT_TYPE_LOOKUP[eventName] ?? eventName;
  const presenceStatus =
    payload.presenceStatus ??
    resolvePresenceStatus(
      payload.initiatedBy ?? payload.addedBy ?? payload.removedBy ?? payload.createdBy
    );
  const enrichedPayload: GroupSocketPayload = {
    ...payload,
    eventType,
    presenceStatus,
  };
  emitToUserRooms(uniqueRooms, eventName, enrichedPayload);
  emitToUserRooms(uniqueRooms, LEGACY_GROUP_ACTIVITY_EVENT, enrichedPayload);
};

export const emitGroupCreatedEvent = (
  group: GroupSocketPayload,
  memberIds?: string[]
): void => {
  if (!group) return;
  const payload: GroupSocketPayload = {
    ...group,
    initiatedBy: group.initiatedBy ?? group.createdBy,
    eventType: group.eventType ?? GROUP_EVENT_TYPE_LOOKUP[GROUP_CREATED_EVENT],
  };
  emitGroupActivityEvent(GROUP_CREATED_EVENT, payload, memberIds);
};

export const emitGroupUpdatedEvent = (
  group: GroupSocketPayload,
  memberIds?: string[]
): void => {
  if (!group) return;
  emitGroupActivityEvent(GROUP_UPDATED_EVENT, group, memberIds);
};

export const emitGroupMemberAddedEvent = (
  group: GroupSocketPayload,
  memberIds?: string[]
): void => {
  if (!group) return;
  const payload: GroupSocketPayload = {
    ...group,
    eventType: group.eventType ?? GROUP_EVENT_TYPE_LOOKUP[GROUP_MEMBER_ADDED_EVENT],
  };
  emitGroupActivityEvent(GROUP_MEMBER_ADDED_EVENT, payload, memberIds);
};

export const emitGroupMemberRemovedEvent = (
  group: GroupSocketPayload,
  memberIds?: string[]
): void => {
  if (!group) return;
  const payload: GroupSocketPayload = {
    ...group,
    eventType:
      group.eventType ?? GROUP_EVENT_TYPE_LOOKUP[GROUP_MEMBER_REMOVED_EVENT],
  };
  emitGroupActivityEvent(GROUP_MEMBER_REMOVED_EVENT, payload, memberIds);
};

const registerUserFactory =
  (socket: Socket) =>
  (payload: { userId?: string; id?: string } | string): void => {
    const userId =
      typeof payload === "string" ? payload : payload?.userId ?? payload?.id;
    const roomId = getUserRoomId(userId);
    if (!roomId || !userId) {
      return;
    }

    const data = (socket.data ?? {}) as SocketMeta;
    const previousUserId = data.userId;
    if (data.userRoomId && data.userRoomId !== roomId) {
      socket.leave(data.userRoomId);
    }
    if (previousUserId && previousUserId !== userId) {
      const previousState = getOrCreateUserState(previousUserId);
      previousState.sockets.delete(socket.id);
      if (previousState.sockets.size === 0) {
        markUserOffline(previousUserId);
      }
    }

    socket.join(roomId);
    socket.data.userRoomId = roomId;
    socket.data.userId = userId;

    const state = markUserOnline(userId);
    state.sockets.add(socket.id);

    sendPresenceSnapshot(socket);
    emitUnreadSummary(state, socket);

    console.log(`Socket ${socket.id} registered user ${userId}`);
  };

const handleDirectRoomJoin = (socket: Socket) => {
  return ({ userA, userB }: { userA?: string; userB?: string }) => {
    const roomId = getDirectRoomId(userA, userB);
    if (!roomId) {
      return;
    }

    socket.join(roomId);
    socket.data.activeDirectRoomId = roomId;

    const socketUserId = (socket.data as SocketMeta)?.userId;
    let resolvedUserId = socketUserId ?? userA ?? userB;
    let peerId: string | null = null;
    if (resolvedUserId && userA === resolvedUserId) {
      peerId = userB ?? null;
    } else if (resolvedUserId && userB === resolvedUserId) {
      peerId = userA ?? null;
    }

    if (resolvedUserId && peerId) {
      setActiveDirectPeer(resolvedUserId, peerId);
    }

    console.log(`Socket ${socket.id} joined direct room ${roomId}`);
  };
};

const handleDirectRoomLeave = (socket: Socket) => {
  return ({ userA, userB }: { userA?: string; userB?: string }) => {
    const roomId = getDirectRoomId(userA, userB);
    if (roomId) {
      socket.leave(roomId);
    }
    const socketUserId = (socket.data as SocketMeta)?.userId;
    if (socketUserId) {
      clearActiveDirectPeer(socketUserId);
    }
    socket.data.activeDirectRoomId = null;
  };
};

const handleGroupJoin = (socket: Socket) => {
  return (payload: string | { groupId?: string }) => {
    const groupId = typeof payload === "string" ? payload : payload?.groupId;
    if (!groupId) {
      return;
    }
    socket.join(groupId);
    console.log(`Socket ${socket.id} joined group ${groupId}`);
  };
};

const handleGroupLeave = (socket: Socket) => {
  return (payload: string | { groupId?: string }) => {
    const groupId = typeof payload === "string" ? payload : payload?.groupId;
    if (!groupId) {
      return;
    }
    socket.leave(groupId);
    const socketUserId = (socket.data as SocketMeta)?.userId;
    if (socketUserId) {
      const meta = socket.data as SocketMeta;
      if (meta.activeGroupRoomId === groupId) {
        clearActiveGroupRoom(socketUserId);
        meta.activeGroupRoomId = null;
      }
    }
    console.log(`Socket ${socket.id} left group ${groupId}`);
  };
};

const handleGroupFocus = (socket: Socket) => {
  return (payload: string | { groupId?: string; userId?: string }) => {
    const groupId = typeof payload === "string" ? payload : payload?.groupId;
    if (!groupId) {
      return;
    }
    const socketUserId =
      (typeof payload === "object" && payload?.userId) ||
      (socket.data as SocketMeta)?.userId;
    if (!socketUserId) {
      return;
    }
    setActiveGroupRoom(socketUserId, groupId);
    socket.data.activeGroupRoomId = groupId;
  };
};

const handleGroupBlur = (socket: Socket) => {
  return (payload: { userId?: string } = {}) => {
    const socketUserId = payload.userId ?? (socket.data as SocketMeta)?.userId;
    if (!socketUserId) {
      return;
    }
    clearActiveGroupRoom(socketUserId);
    socket.data.activeGroupRoomId = null;
  };
};

const handleGroupMessageSend =
  (socket: Socket) =>
  (payload: GroupMessagePayload & { memberIds?: string[] }) => {
    if (!payload) {
      return;
    }
    const { groupId, from, message, clientMessageId } = payload;
    if (!groupId || !from || !message) {
      return;
    }
    const memberIds = sanitizeMemberIds(
      Array.isArray(payload.memberIds) ? payload.memberIds : []
    );
    emitGroupMessageEvent(
      groupId,
      {
        groupId,
        from,
        message,
        clientMessageId,
        senderSocketId: socket.id,
      },
      memberIds
    );
  };

const emitDirectTypingUpdate = ({
  from,
  to,
  isTyping,
}: {
  from: string;
  to: string;
  isTyping: boolean;
}) => {
  const rooms = [getUserRoomId(to), getDirectRoomId(from, to)];
  const payload = {
    scope: "direct" as const,
    from,
    to,
    isTyping,
    timestamp: Date.now(),
    presenceStatus: resolvePresenceStatus(from),
  };
  emitToUserRooms(rooms, TYPING_EVENT, payload);
  emitToUserRooms(rooms, LEGACY_DIRECT_TYPING_EVENT, payload);
};

const emitGroupTypingUpdate = (
  socket: Socket,
  {
    from,
    groupId,
    isTyping,
  }: {
    from: string;
    groupId: string;
    isTyping: boolean;
  }
) => {
  const payload = {
    scope: "group" as const,
    from,
    groupId,
    isTyping,
    timestamp: Date.now(),
    presenceStatus: resolvePresenceStatus(from),
  };
  socket.to(groupId).emit(TYPING_EVENT, payload);
  socket.to(groupId).emit(LEGACY_GROUP_TYPING_EVENT, payload);
};

const handleDirectTyping = (socket: Socket) => {
  return (payload: { from?: string; to?: string; isTyping?: boolean }) => {
    const from = payload.from ?? (socket.data as SocketMeta)?.userId;
    const to = payload.to;
    if (!from || !to) {
      return;
    }
    emitDirectTypingUpdate({
      from,
      to,
      isTyping: Boolean(payload.isTyping),
    });
  };
};

const handleGroupTyping = (socket: Socket) => {
  return (payload: { from?: string; groupId?: string; isTyping?: boolean }) => {
    const groupId = payload.groupId;
    const from = payload.from ?? (socket.data as SocketMeta)?.userId;
    if (!groupId || !from || !ioInstance) {
      return;
    }
    emitGroupTypingUpdate(socket, {
      from,
      groupId,
      isTyping: Boolean(payload.isTyping),
    });
  };
};

const handleTypingEvent = (socket: Socket) => {
  return (
    payload: {
      scope?: "direct" | "group";
      from?: string;
      to?: string;
      groupId?: string;
      isTyping?: boolean;
    } = {}
  ) => {
    const scope = payload.scope ?? (payload.groupId ? "group" : "direct");
    if (scope === "group") {
      const from = payload.from ?? (socket.data as SocketMeta)?.userId;
      const groupId = payload.groupId;
      if (!groupId || !from) {
        return;
      }
      emitGroupTypingUpdate(socket, {
        from,
        groupId,
        isTyping: Boolean(payload.isTyping),
      });
      return;
    }
    const from = payload.from ?? (socket.data as SocketMeta)?.userId;
    const to = payload.to;
    if (!from || !to) {
      return;
    }
    emitDirectTypingUpdate({
      from,
      to,
      isTyping: Boolean(payload.isTyping),
    });
  };
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
    socket.on("join_direct_room", handleDirectRoomJoin(socket));
    socket.on("leave_direct_room", handleDirectRoomLeave(socket));

    GROUP_JOIN_EVENTS.forEach((event) =>
      socket.on(event, handleGroupJoin(socket))
    );
    GROUP_LEAVE_EVENTS.forEach((event) =>
      socket.on(event, handleGroupLeave(socket))
    );

    socket.on("focus_group_room", handleGroupFocus(socket));
    socket.on("blur_group_room", handleGroupBlur(socket));

    socket.on(TYPING_EVENT, handleTypingEvent(socket));
    socket.on(LEGACY_DIRECT_TYPING_EVENT, handleDirectTyping(socket));
    socket.on(LEGACY_GROUP_TYPING_EVENT, handleGroupTyping(socket));

    socket.on(
      "send_direct_message",
      ({ from, to, message, clientMessageId }: DirectMessagePayload) => {
        emitDirectMessageEvent({
          from,
          to,
          message,
          clientMessageId,
          senderSocketId: socket.id,
        });
      }
    );

    const groupMessageHandler = handleGroupMessageSend(socket);
    socket.on("send_group_message", groupMessageHandler);
    socket.on(GROUP_MESSAGE_EVENT, groupMessageHandler);

    registerEncryptedMessageHandlers(socket, ioInstance!);

    socket.on("disconnect", () => {
      const data = (socket.data ?? {}) as SocketMeta;
      if (data.userRoomId) {
        socket.leave(data.userRoomId);
      }
      if (data.userId) {
        const state = getOrCreateUserState(data.userId);
        state.sockets.delete(socket.id);
        if (state.sockets.size === 0) {
          markUserOffline(data.userId);
        }
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
