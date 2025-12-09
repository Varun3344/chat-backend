import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { USERS } from "../data/dummyData";
import socket, { getSocket } from "../utils/socket";
import {
  sendDirectMessageApi,
  sendGroupMessageApi,
  fetchDirectMessagesApi,
  fetchGroupMessagesApi,
  createGroupApi,
  fetchUserGroupsApi,
} from "../utils/api";

const DIRECT_EVENTS = {
  JOIN: "join_direct_room",
  LEAVE: "leave_direct_room",
  SEND: "send_direct_message",
  RECEIVE: "receive_direct_message",
};

const GROUP_EVENTS = {
  JOIN: "join_group",
  LEAVE: "leave_group",
  SEND: "send_group_message",
  RECEIVE: "receive_group_message",
  CREATED: "group_created",
};

const everyone = USERS.map((user) => user.id);

const DEFAULT_GROUPS = [
  {
    id: "product-squad",
    name: "Product Squad",
    description: "Daily stand-up room for the product/engineering group.",
    members: ["ravi", "shwetha", "varun"],
  },
  {
    id: "gtm-task-force",
    name: "GTM Task Force",
    description: "Marketing, CS and Product triage.",
    members: ["ravi", "kumar"],
  },
  {
    id: "all-hands",
    name: "Company All Hands",
    description: "Everyone gets this broadcast – tie it to announcements.",
    members: everyone,
  },
];

const lookupName = (userId) =>
  USERS.find((user) => user.id === userId)?.name ?? userId ?? "Teammate";

const formatTime = (value) => {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const createMessageFromPayload = (payload = {}, overrides = {}) => ({
  id:
    payload.id ??
    payload.messageId ??
    overrides.id ??
    `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
  from: payload.from ?? overrides.from ?? "system",
  to: payload.to ?? overrides.to ?? null,
  groupId: payload.groupId ?? overrides.groupId ?? null,
  message: payload.message ?? overrides.message ?? "",
  timestamp:
    payload.createdAt ??
    payload.timestamp ??
    overrides.timestamp ??
    new Date().toISOString(),
  optimistic: overrides.optimistic ?? false,
  failed: overrides.failed ?? false,
  errorMessage: overrides.errorMessage,
});

const createTempMessageId = () =>
  `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const mergeMessages = (history = [], incoming) => {
  if (!incoming) return history;

  if (!incoming.id) {
    return [...history, incoming];
  }

  const index = history.findIndex((message) => message.id === incoming.id);

  if (index === -1) {
    return [...history, incoming];
  }

  const next = [...history];
  next[index] = {
    ...next[index],
    ...incoming,
    optimistic: false,
    failed: false,
    errorMessage: undefined,
  };
  return next;
};

const replaceTempMessage = (history = [], tempId, payload) => {
  const normalized = createMessageFromPayload(payload, { optimistic: false });

  if (!tempId) {
    return mergeMessages(history, normalized);
  }

  const index = history.findIndex((message) => message.id === tempId);
  if (index === -1) {
    return mergeMessages(history, normalized);
  }

  const next = [...history];
  next[index] = normalized;
  return next;
};

const markMessageFailed = (history = [], tempId, errorMessage) => {
  if (!tempId) return history;
  const index = history.findIndex((message) => message.id === tempId);
  if (index === -1) return history;

  const next = [...history];
  next[index] = {
    ...next[index],
    optimistic: false,
    failed: true,
    errorMessage,
  };

  return next;
};

const normalizeHistoryFromApi = (records = []) =>
  records
    .slice()
    .reverse()
    .map((record) =>
      createMessageFromPayload(record, { optimistic: false, failed: false })
    );

const mergePendingWithFetched = (existing = [], fetched = []) => {
  if (!existing || existing.length === 0) {
    return fetched;
  }

  const pending = existing.filter(
    (message) => message.optimistic || message.failed
  );

  if (pending.length === 0) {
    return fetched;
  }

  return [...fetched, ...pending];
};

const normalizeGroupRecord = (record = {}) => ({
  id: record.id ?? record.groupId ?? record._id ?? record.name,
  name: record.name ?? record.groupName ?? "Untitled group",
  description: record.description ?? "Custom group",
  members: Array.isArray(record.members) ? record.members : [],
  createdBy: record.createdBy,
  createdAt: record.createdAt,
  optimistic: Boolean(record.optimistic),
});

const mergeServerGroupsWithOptimistic = (serverGroups = [], previous = []) => {
  if (!previous || previous.length === 0) {
    return serverGroups;
  }
  const optimisticGroups = previous.filter(
    (group) =>
      group?.optimistic &&
      !serverGroups.some((serverGroup) => serverGroup.id === group.id)
  );

  if (optimisticGroups.length === 0) {
    return serverGroups;
  }

  return [...serverGroups, ...optimisticGroups];
};

export default function ChatPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [activeRoster, setActiveRoster] = useState("direct");
  const [activeContactId, setActiveContactId] = useState(null);
  const [activeGroupId, setActiveGroupId] = useState(
    DEFAULT_GROUPS[0]?.id ?? null
  );
  const [directMessages, setDirectMessages] = useState({});
  const [groupMessages, setGroupMessages] = useState({});
  const [messageInput, setMessageInput] = useState("");
  const [connectionState, setConnectionState] = useState("connecting");
  const [isSocketReady, setIsSocketReady] = useState(false);
  const [customGroups, setCustomGroups] = useState([]);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState(null);
  const [customGroupsError, setCustomGroupsError] = useState(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);

  const socketRef = useRef(socket);

  useEffect(() => {
    if (!router.isReady) return;
    const queryValue = router.query.user;
    const fallbackUserId = USERS[0]?.id ?? null;
    const resolvedUser = Array.isArray(queryValue)
      ? queryValue[0]
      : queryValue || fallbackUserId;
    setCurrentUserId(resolvedUser);
  }, [router.isReady, router.query.user]);

  const currentUser = useMemo(
    () => USERS.find((user) => user.id === currentUserId) ?? null,
    [currentUserId]
  );

  const contacts = useMemo(
    () => USERS.filter((user) => user.id !== currentUserId),
    [currentUserId]
  );

  useEffect(() => {
    if (contacts.length === 0) {
      setActiveContactId(null);
      return;
    }
    setActiveContactId((previous) => {
      if (previous && contacts.some((contact) => contact.id === previous)) {
        return previous;
      }
      return contacts[0].id;
    });
  }, [contacts]);

  const upsertCustomGroup = useCallback((incoming) => {
    if (!incoming) return;
    setCustomGroups((prev) => {
      const normalizedId =
        incoming.id ?? incoming.groupId ?? incoming._id ?? incoming.name;
      if (!normalizedId) {
        return prev;
      }
      const nextGroup = {
        id: normalizedId,
        name: incoming.name ?? incoming.groupName ?? "Untitled group",
        description: incoming.description ?? "Custom group",
        members: Array.isArray(incoming.members) ? incoming.members : [],
        createdBy: incoming.createdBy,
        createdAt: incoming.createdAt,
        optimistic: Boolean(incoming.optimistic),
      };
      const index = prev.findIndex(
        (group) =>
          group.id === normalizedId ||
          group.groupId === normalizedId ||
          group.id === incoming.id ||
          group.id === incoming.groupId
      );
      if (index === -1) {
        return [...prev, nextGroup];
      }
      const updated = [...prev];
      updated[index] = { ...updated[index], ...nextGroup };
      return updated;
    });
  }, []);

  const removeCustomGroup = useCallback((groupId) => {
    if (!groupId) return;
    setCustomGroups((prev) =>
      prev.filter(
        (group) => group.id !== groupId && group.groupId !== groupId
      )
    );
  }, []);

  const silentGroupRefresh = useCallback(async () => {
    if (!currentUserId) {
      return;
    }
    try {
      const response = await fetchUserGroupsApi(currentUserId);
      const records = response?.groups ?? response?.data ?? [];
      const normalized = records.map(normalizeGroupRecord);
      setCustomGroups((prev) =>
        mergeServerGroupsWithOptimistic(normalized, prev)
      );
    } catch (error) {
      console.error("Silent group refresh failed:", error);
    }
  }, [currentUserId]);

  const groups = useMemo(() => {
    if (!currentUserId) return [];
    const defaultGroups = DEFAULT_GROUPS.filter(
      (group) =>
        !Array.isArray(group.members) ||
        group.members.length === 0 ||
        group.members.includes(currentUserId)
    );

    const dynamicGroups = customGroups
      .filter(
        (group) =>
          !Array.isArray(group.members) ||
          group.members.length === 0 ||
          group.members.includes(currentUserId)
      )
      .map((group) => ({
        ...group,
        id: group.id ?? group.groupId ?? group._id ?? group.name,
        name: group.name ?? group.groupName ?? "Untitled group",
        description: group.description ?? "Custom group",
      }));

    return [...defaultGroups, ...dynamicGroups];
  }, [currentUserId, customGroups]);

  useEffect(() => {
    if (groups.length === 0) {
      setActiveGroupId(null);
      return;
    }
    setActiveGroupId((previous) => {
      if (previous && groups.some((group) => group.id === previous)) {
        return previous;
      }
      return groups[0].id;
    });
  }, [groups]);

  useEffect(() => {
    if (activeRoster === "group" && groups.length === 0) {
      setActiveRoster("direct");
    } else if (activeRoster === "direct" && contacts.length === 0) {
      setActiveRoster(groups.length > 0 ? "group" : "direct");
    }
  }, [activeRoster, contacts.length, groups.length]);

  useEffect(() => {
    setSelectedMemberIds([]);
    setCreateGroupError(null);
    setNewGroupName("");
    setIsCreateGroupOpen(false);
    setIsMemberListOpen(false);
  }, [currentUserId]);

  useEffect(() => {
    setIsMemberListOpen(false);
  }, [activeRoster, activeGroupId]);

  useEffect(() => {
    if (!currentUserId) {
      setCustomGroups([]);
      return;
    }
    let ignore = false;
    const loadGroups = async () => {
      setIsLoadingGroups(true);
      setCustomGroupsError(null);
      try {
        const response = await fetchUserGroupsApi(currentUserId);
        const records = response?.groups ?? response?.data ?? [];
        if (!ignore) {
          const normalized = records.map(normalizeGroupRecord);
          setCustomGroups((prev) =>
            mergeServerGroupsWithOptimistic(normalized, prev)
          );
        }
      } catch (error) {
        if (!ignore) {
          setCustomGroupsError(error.message || "Unable to load groups");
        }
      } finally {
        if (!ignore) {
          setIsLoadingGroups(false);
        }
      }
    };
    loadGroups();
    return () => {
      ignore = true;
    };
  }, [currentUserId]);

  const handleToggleMemberSelection = (memberId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const handleCreateGroupSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    const trimmedName = newGroupName.trim();
    if (!trimmedName) {
      setCreateGroupError("Please provide a group name.");
      return;
    }

    const allMembers = Array.from(
      new Set([currentUserId, ...selectedMemberIds])
    );

    setIsCreatingGroup(true);
    setCreateGroupError(null);

    const tempId = `temp-group-${Date.now()}`;
    const optimisticGroup = {
      id: tempId,
      name: trimmedName,
      description: "Custom group",
      members: allMembers,
      createdBy: currentUserId,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };

    upsertCustomGroup(optimisticGroup);
    setActiveRoster("group");
    setActiveGroupId(tempId);

    try {
      const response = await createGroupApi({
        groupName: trimmedName,
        createdBy: currentUserId,
        members: allMembers,
      });

      const serverGroup = response?.group ?? {};
      const normalizedId =
        serverGroup?.id?.toString?.() ??
        serverGroup?.groupId?.toString?.() ??
        response?.groupId?.toString?.() ??
        response?.data?.groupId?.toString?.() ??
        response?.groupId ??
        response?.data?.groupId ??
        `group-${Date.now()}`;

      const normalizedGroup = {
        id: normalizedId,
        name: serverGroup?.name ?? trimmedName,
        description: serverGroup?.description ?? "Custom group",
        members: Array.isArray(serverGroup?.members)
          ? serverGroup.members
          : allMembers,
        createdBy: serverGroup?.createdBy ?? currentUserId,
        createdAt: serverGroup?.createdAt ?? new Date().toISOString(),
        optimistic: false,
      };

      removeCustomGroup(tempId);
      upsertCustomGroup(normalizedGroup);
      setActiveRoster("group");
      setActiveGroupId(normalizedGroup.id);
      setIsCreateGroupOpen(false);
      setNewGroupName("");
      setSelectedMemberIds([]);
      silentGroupRefresh();
    } catch (error) {
      removeCustomGroup(tempId);
      setCreateGroupError(error.message || "Unable to create group");
    } finally {
      setIsCreatingGroup(false);
    }
  };

  useEffect(() => {
    const instance = socketRef.current ?? getSocket();
    if (!instance) return;

    socketRef.current = instance;

    const handleConnect = () => setConnectionState("connected");
    const handleDisconnect = () => setConnectionState("disconnected");
    const handleConnectError = (error) => {
      console.error("Socket connect error:", error);
      setConnectionState("error");
    };

    instance.on("connect", handleConnect);
    instance.on("disconnect", handleDisconnect);
    instance.io?.on?.("error", handleConnectError);
    instance.on("connect_error", handleConnectError);

    if (!instance.connected) {
      instance.connect();
    } else {
      setConnectionState("connected");
    }

    setIsSocketReady(true);

    return () => {
      instance.off("connect", handleConnect);
      instance.off("disconnect", handleDisconnect);
      instance.off("connect_error", handleConnectError);
      instance.io?.off?.("error", handleConnectError);
    };
  }, []);

  useEffect(() => {
    if (!isSocketReady) return;
    const instance = socketRef.current;
    if (!instance) return;

    const handleDirectMessage = (payload) => {
      if (!payload) return;
      if (
        payload.from !== currentUserId &&
        payload.to !== currentUserId
      ) {
        return;
      }
      const selfSocketId = socketRef.current?.id;
      if (
        payload.senderSocketId &&
        payload.senderSocketId === selfSocketId &&
        payload.from === currentUserId
      ) {
        return;
      }
      const peerId =
        payload.from === currentUserId ? payload.to : payload.from;
      if (!peerId) return;
      const normalized = createMessageFromPayload(payload);
      setDirectMessages((prev) => ({
        ...prev,
        [peerId]: mergeMessages(prev[peerId] ?? [], normalized),
      }));
    };

    const handleGroupMessage = (payload) => {
      if (!payload?.groupId) return;
      const isMember = groups.some((group) => group.id === payload.groupId);
      if (!isMember) {
        return;
      }
      const selfSocketId = socketRef.current?.id;
      if (
        payload.senderSocketId &&
        payload.senderSocketId === selfSocketId &&
        payload.from === currentUserId
      ) {
        return;
      }
      const normalized = createMessageFromPayload(payload);
      setGroupMessages((prev) => ({
        ...prev,
        [payload.groupId]: mergeMessages(prev[payload.groupId] ?? [], normalized),
      }));
    };

    const handleGroupCreated = (payload) => {
      if (!payload) return;
      const members = Array.isArray(payload.members) ? payload.members : [];
      const isRelevant =
        members.includes(currentUserId) || payload.createdBy === currentUserId;
      if (!isRelevant) {
        return;
      }
      upsertCustomGroup(payload);
      const shouldRefresh =
        payload.eventType && payload.eventType !== "created"
          ? true
          : payload.createdBy !== currentUserId;
      if (shouldRefresh) {
        silentGroupRefresh();
      }
    };

    instance.on(DIRECT_EVENTS.RECEIVE, handleDirectMessage);
    instance.on(GROUP_EVENTS.RECEIVE, handleGroupMessage);
    instance.on(GROUP_EVENTS.CREATED, handleGroupCreated);

    return () => {
      instance.off(DIRECT_EVENTS.RECEIVE, handleDirectMessage);
      instance.off(GROUP_EVENTS.RECEIVE, handleGroupMessage);
      instance.off(GROUP_EVENTS.CREATED, handleGroupCreated);
    };
  }, [isSocketReady, currentUserId, groups, upsertCustomGroup, silentGroupRefresh]);

  useEffect(() => {
    if (!isSocketReady || !currentUserId || contacts.length === 0) return;
    const instance = socketRef.current;
    if (!instance) return;

    const payloads = contacts.map((contact) => ({
      userA: currentUserId,
      userB: contact.id,
    }));

    payloads.forEach((payload) => instance.emit(DIRECT_EVENTS.JOIN, payload));

    return () => {
      payloads.forEach((payload) => instance.emit(DIRECT_EVENTS.LEAVE, payload));
    };
  }, [contacts, currentUserId, isSocketReady]);

  useEffect(() => {
    if (!isSocketReady || !currentUserId || groups.length === 0) return;
    const instance = socketRef.current;
    if (!instance) return;

    const payloads = groups.map((group) => ({
      groupId: group.id,
      userId: currentUserId,
    }));

    payloads.forEach((payload) => instance.emit(GROUP_EVENTS.JOIN, payload));

    return () => {
      payloads.forEach((payload) => instance.emit(GROUP_EVENTS.LEAVE, payload));
    };
  }, [groups, currentUserId, isSocketReady]);

  useEffect(() => {
    if (!isSocketReady || !currentUserId) return;
    const instance = socketRef.current;
    if (!instance) return;

    const register = () => {
      instance.emit("register_user", { userId: currentUserId });
    };

    register();
    instance.on("connect", register);

    return () => {
      instance.off("connect", register);
    };
  }, [isSocketReady, currentUserId]);

  useEffect(() => {
    if (!currentUserId || !activeContactId) return;
    let ignore = false;

    const loadHistory = async () => {
      try {
        const response = await fetchDirectMessagesApi({
          userA: currentUserId,
          userB: activeContactId,
        });
        const rawMessages = Array.isArray(response?.data) ? response.data : [];
        const normalized = normalizeHistoryFromApi(rawMessages);

        if (!ignore) {
          setDirectMessages((prev) => ({
            ...prev,
            [activeContactId]: mergePendingWithFetched(
              prev[activeContactId],
              normalized
            ),
          }));
        }
      } catch (error) {
        console.error("Unable to load direct history:", error);
      }
    };

    loadHistory();

    return () => {
      ignore = true;
    };
  }, [currentUserId, activeContactId]);

  useEffect(() => {
    if (!currentUserId || !activeGroupId) return;
    let ignore = false;

    const loadGroupHistory = async () => {
      try {
        const response = await fetchGroupMessagesApi({
          groupId: activeGroupId,
        });
        const rawMessages = response?.messages || response?.data || [];
        const normalized = normalizeHistoryFromApi(rawMessages);

        if (!ignore) {
          setGroupMessages((prev) => ({
            ...prev,
            [activeGroupId]: mergePendingWithFetched(
              prev[activeGroupId],
              normalized
            ),
          }));
        }
      } catch (error) {
        console.error("Unable to load group history:", error);
      }
    };

    loadGroupHistory();

    return () => {
      ignore = true;
    };
  }, [currentUserId, activeGroupId]);

  const handleSendMessage = async (event) => {
    event.preventDefault();
    const trimmed = messageInput.trim();
    if (!trimmed || !currentUserId) {
      setMessageInput("");
      return;
    }

    const socketInstance = socketRef.current ?? getSocket();
    if (socketInstance && socketInstance.disconnected) {
      socketInstance.connect();
    }
    const socketIsConnected = Boolean(socketInstance && socketInstance.connected);

    if (activeRoster === "group" && activeGroupId) {
      const targetGroupId = activeGroupId;
      const payload = {
        groupId: targetGroupId,
        from: currentUserId,
        message: trimmed,
      };
      const tempId = createTempMessageId();
      setGroupMessages((prev) => ({
        ...prev,
        [targetGroupId]: mergeMessages(
          prev[targetGroupId] ?? [],
          createMessageFromPayload(payload, { id: tempId, optimistic: true })
        ),
      }));

      if (socketIsConnected) {
        socketInstance.emit(GROUP_EVENTS.SEND, payload);
      }

      try {
        const response = await sendGroupMessageApi({
          ...payload,
          suppressRealtime: socketIsConnected,
        });
        if (response?.data) {
          setGroupMessages((prev) => ({
            ...prev,
            [targetGroupId]: replaceTempMessage(
              prev[targetGroupId] ?? [],
              tempId,
              response.data
            ),
          }));
        }
      } catch (error) {
        setGroupMessages((prev) => ({
          ...prev,
          [targetGroupId]: markMessageFailed(
            prev[targetGroupId] ?? [],
            tempId,
            error.message || "Unable to send group message"
          ),
        }));
      }
    } else if (activeContactId) {
      const targetContactId = activeContactId;
      const payload = {
        from: currentUserId,
        to: targetContactId,
        message: trimmed,
      };
      const tempId = createTempMessageId();
      setDirectMessages((prev) => ({
        ...prev,
        [targetContactId]: mergeMessages(
          prev[targetContactId] ?? [],
          createMessageFromPayload(payload, { id: tempId, optimistic: true })
        ),
      }));

      if (socketIsConnected) {
        socketInstance.emit(DIRECT_EVENTS.SEND, payload);
      }

      try {
        const response = await sendDirectMessageApi({
          ...payload,
          suppressRealtime: socketIsConnected,
        });
        if (response?.data) {
          setDirectMessages((prev) => ({
            ...prev,
            [targetContactId]: replaceTempMessage(
              prev[targetContactId] ?? [],
              tempId,
              response.data
            ),
          }));
        }
      } catch (error) {
        setDirectMessages((prev) => ({
          ...prev,
          [targetContactId]: markMessageFailed(
            prev[targetContactId] ?? [],
            tempId,
            error.message || "Unable to send direct message"
          ),
        }));
      }
    }

    setMessageInput("");
  };

  const currentMessages =
    activeRoster === "group"
      ? groupMessages[activeGroupId] ?? []
      : directMessages[activeContactId] ?? [];

  const activeGroupData = useMemo(() => {
    if (activeRoster !== "group" || !activeGroupId) return null;
    return groups.find((group) => group.id === activeGroupId) ?? null;
  }, [activeRoster, activeGroupId, groups]);

  const roomLabel =
    activeRoster === "group"
      ? groups.find((group) => group.id === activeGroupId)?.name ?? "No group"
      : contacts.find((contact) => contact.id === activeContactId)?.name ??
        "No contact";

  const canSendToRoom =
    activeRoster === "group" ? Boolean(activeGroupId) : Boolean(activeContactId);

  if (!router.isReady || !currentUserId) {
    return (
      <div style={styles.blankState}>
        <p>Loading chat experience...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div style={styles.blankState}>
        <h2>Choose an account</h2>
        <p>
          Select a teammate on the home page so we know which user should join rooms.
        </p>
        <button style={styles.primaryButton} onClick={() => router.push("/")}>
          Go back
        </button>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <aside style={styles.sidebar}>
        <div style={styles.profileCard}>
          <div style={styles.avatar}>{currentUser.name[0]}</div>
          <div>
            <p style={styles.profileLabel}>Logged in as</p>
            <h3 style={styles.profileName}>{currentUser.name}</h3>
            <p style={styles.profileMeta}>{currentUser.role}</p>
            <span
              style={{
                ...styles.connectionBadge,
                background:
                  connectionState === "connected" ? "#22c55e" : "#f97316",
              }}
            >
              {connectionState}
            </span>
          </div>
        </div>

        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => setActiveRoster("direct")}
            style={{
              ...styles.tabButton,
              ...(activeRoster === "direct" ? styles.tabButtonActive : {}),
            }}
          >
            Direct
          </button>
          <button
            type="button"
            onClick={() => setActiveRoster("group")}
            style={{
              ...styles.tabButton,
              ...(activeRoster === "group" ? styles.tabButtonActive : {}),
            }}
          >
            Groups
          </button>
        </div>

        <div style={styles.listHeadingRow}>
          <span style={styles.listHeading}>
            {activeRoster === "group" ? "Group rooms" : "Direct chats"}
          </span>
          {activeRoster === "group" && (
            <button
              type="button"
              style={styles.createGroupButton}
              onClick={() => {
                setIsCreateGroupOpen((prev) => !prev);
                setCreateGroupError(null);
              }}
            >
              {isCreateGroupOpen ? "Close" : "Create group"}
            </button>
          )}
        </div>

        <div style={styles.roomList}>
          {activeRoster === "group"
            ? groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setActiveGroupId(group.id);
                    setActiveRoster("group");
                  }}
                  style={{
                    ...styles.roomButton,
                    ...(group.id === activeGroupId ? styles.roomButtonActive : {}),
                  }}
                >
                  <strong>{group.name}</strong>
                  <span style={styles.roomDescription}>{group.description}</span>
                  <span style={styles.roomMeta}>
                    {group.members.length} members
                  </span>
                  {group.createdBy && group.createdBy !== currentUserId && (
                    <span style={styles.groupCreatorNote}>
                      {lookupName(group.createdBy)} created this group and added you
                    </span>
                  )}
                </button>
              ))
            : contacts.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => {
                    setActiveRoster("direct");
                    setActiveContactId(contact.id);
                  }}
                  style={{
                    ...styles.roomButton,
                    ...(contact.id === activeContactId ? styles.roomButtonActive : {}),
                  }}
                >
                  <strong>{contact.name}</strong>
                  <span style={styles.roomDescription}>{contact.role}</span>
                </button>
              ))}

          {activeRoster === "group" && groups.length === 0 && (
            <p style={styles.helperText}>
              No groups available for this user. Add them to a group to start a room.
            </p>
          )}
          {activeRoster === "group" && customGroupsError && (
            <p style={styles.createGroupError}>{customGroupsError}</p>
          )}
          {activeRoster === "direct" && contacts.length === 0 && (
            <p style={styles.helperText}>
              No teammates to chat with. Add more contacts to see them here.
            </p>
          )}
          {activeRoster === "group" && isCreateGroupOpen && (
            <form style={styles.createGroupForm} onSubmit={handleCreateGroupSubmit}>
              <label style={styles.createGroupLabel}>
                Group name
                <input
                  style={styles.createGroupInput}
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="e.g. Product Beta Crew"
                />
              </label>
              <div style={styles.createGroupMembers}>
                <p style={styles.createGroupHint}>Select members</p>
                <div style={styles.createGroupMemberList}>
                  {USERS.filter((user) => user.id !== currentUserId).map((user) => (
                    <label key={user.id} style={styles.createGroupMemberItem}>
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(user.id)}
                        onChange={() => handleToggleMemberSelection(user.id)}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              {createGroupError && (
                <p style={styles.createGroupError}>{createGroupError}</p>
              )}
              <button
                type="submit"
                style={styles.createGroupSubmit}
                disabled={isCreatingGroup}
              >
                {isCreatingGroup ? "Creating..." : "Create group"}
              </button>
            </form>
          )}
        </div>
      </aside>

      <section style={styles.chatPane}>
        <header style={styles.chatHeader}>
          <div>
            <p style={styles.chatEyebrow}>Active room</p>
            <h2 style={styles.chatTitle}>{roomLabel}</h2>
            {activeRoster === "group" && activeGroupData?.createdBy && (
              <p style={styles.groupCreatedBy}>
                Created by {lookupName(activeGroupData.createdBy)}
              </p>
            )}
          </div>
          <button style={styles.secondaryButton} onClick={() => router.push("/")}>
            Switch user
          </button>
        </header>

        {activeRoster === "group" && activeGroupData && (
          <div style={styles.memberToggleRow}>
            <button
              type="button"
              style={styles.memberToggleButton}
              onClick={() => setIsMemberListOpen((prev) => !prev)}
            >
              {isMemberListOpen ? "Hide members" : "Show members"} (
              {activeGroupData.members?.length ?? 0})
            </button>
          </div>
        )}

        {activeRoster === "group" && isMemberListOpen && activeGroupData && (
          <div style={styles.memberListPanel}>
            {(activeGroupData.members ?? []).length === 0 ? (
              <p style={styles.helperText}>No members added yet.</p>
            ) : (
              (activeGroupData.members ?? []).map((memberId) => {
                const memberLabel = lookupName(memberId);
                return (
                  <div key={memberId} style={styles.memberListItem}>
                    <span style={styles.memberAvatar}>
                      {memberLabel?.charAt(0) ?? memberId?.charAt(0) ?? "?"}
                    </span>
                    <div>
                      <strong>{memberLabel}</strong>
                      {memberId === activeGroupData.createdBy && (
                        <span style={styles.memberTag}>Creator</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div style={styles.messagesPane}>
          {currentMessages.length === 0 ? (
            <div style={styles.blankMessages}>
              <p>No messages yet. Say hi to kick off this room.</p>
            </div>
          ) : (
            currentMessages.map((message) => {
              const isSelf = message.from === currentUserId;
              return (
                <div
                  key={message.id}
                  style={{
                    ...styles.messageBubble,
                    alignSelf: isSelf ? "flex-end" : "flex-start",
                    background: isSelf ? "#4c1d95" : "#1e1b4b",
                  }}
                >
                    <div style={styles.messageMeta}>
                      <strong>{lookupName(message.from)}</strong>
                      <span>{formatTime(message.timestamp)}</span>
                      {message.optimistic && !message.failed && <em> sending...</em>}
                      {message.failed && (
                        <em style={styles.messageError}>
                          {message.errorMessage ? `failed: ${message.errorMessage}` : "failed"}
                        </em>
                      )}
                    </div>
                  <p style={styles.messageBody}>{message.message}</p>
                </div>
              );
            })
          )}
        </div>

        <form style={styles.composer} onSubmit={handleSendMessage}>
          <textarea
            style={styles.textarea}
            placeholder={
              activeRoster === "group"
                ? "Message this group..."
                : "Message this teammate..."
            }
            value={messageInput}
            onChange={(event) => setMessageInput(event.target.value)}
            rows={2}
          />
          <button
            type="submit"
            style={{
              ...styles.primaryButton,
              opacity: messageInput.trim() && canSendToRoom ? 1 : 0.6,
            }}
            disabled={!messageInput.trim() || !canSendToRoom}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    background: "#0f172a",
    color: "#e2e8f0",
  },
  sidebar: {
    width: 320,
    borderRight: "1px solid rgba(148,163,184,0.2)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  profileCard: {
    display: "flex",
    gap: 16,
    padding: 16,
    borderRadius: 16,
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(148,163,184,0.3)",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#7c3aed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "1.3rem",
  },
  profileLabel: {
    fontSize: "0.8rem",
    margin: 0,
    color: "#94a3b8",
  },
  profileName: {
    margin: "2px 0",
    fontSize: "1.15rem",
  },
  profileMeta: {
    margin: 0,
    color: "#a5b4fc",
    fontSize: "0.9rem",
  },
  connectionBadge: {
    display: "inline-flex",
    marginTop: 8,
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tabBar: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  tabButton: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.4)",
    padding: "6px 0",
    background: "transparent",
    color: "#e2e8f0",
    cursor: "pointer",
    fontWeight: 600,
  },
  tabButtonActive: {
    borderColor: "#7c3aed",
    background: "rgba(124,58,237,0.15)",
  },
  listHeading: {
    fontSize: "0.9rem",
    color: "#a5b4fc",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  listHeadingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  createGroupButton: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.5)",
    background: "transparent",
    color: "#e2e8f0",
    padding: "4px 12px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  roomList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    overflowY: "auto",
  },
  roomButton: {
    borderRadius: 14,
    padding: 12,
    border: "1px solid rgba(148,163,184,0.4)",
    background: "transparent",
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
  },
  roomButtonActive: {
    borderColor: "#c4b5fd",
    background: "rgba(79,70,229,0.2)",
  },
  roomDescription: {
    fontSize: "0.85rem",
    color: "#94a3b8",
  },
  roomMeta: {
    fontSize: "0.75rem",
    color: "#a5b4fc",
  },
  groupCreatorNote: {
    fontSize: "0.75rem",
    color: "#fbbf24",
  },
  helperText: {
    marginTop: 16,
    fontSize: "0.9rem",
    color: "#94a3b8",
  },
  createGroupForm: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "rgba(15,23,42,0.5)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  createGroupLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: "0.85rem",
    color: "#e2e8f0",
  },
  createGroupInput: {
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.4)",
    padding: "8px 10px",
    background: "rgba(15,23,42,0.7)",
    color: "#f8fafc",
  },
  createGroupMembers: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  createGroupHint: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  createGroupMemberList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 160,
    overflowY: "auto",
  },
  createGroupMemberItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "0.85rem",
  },
  createGroupError: {
    margin: 0,
    color: "#f87171",
    fontSize: "0.85rem",
  },
  createGroupSubmit: {
    borderRadius: 999,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    padding: "10px 20px",
    cursor: "pointer",
    fontWeight: 600,
  },
  chatPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 24,
    gap: 16,
  },
  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chatEyebrow: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  chatTitle: {
    margin: "4px 0 0",
  },
  groupCreatedBy: {
    margin: "4px 0 0",
    fontSize: "0.85rem",
    color: "#a5b4fc",
  },
  memberToggleRow: {
    marginTop: -12,
    marginBottom: 8,
  },
  memberToggleButton: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.5)",
    background: "transparent",
    color: "#e2e8f0",
    padding: "4px 16px",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  memberListPanel: {
    borderRadius: 14,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "rgba(15,23,42,0.5)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  memberListItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#1e1b4b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
  },
  memberTag: {
    marginLeft: 8,
    fontSize: "0.75rem",
    color: "#fbbf24",
  },
  messagesPane: {
    flex: 1,
    borderRadius: 18,
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(148,163,184,0.2)",
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
  },
  blankMessages: {
    margin: "auto",
    color: "#94a3b8",
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: "70%",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#f8fafc",
  },
  messageMeta: {
    fontSize: "0.8rem",
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  messageError: {
    color: "#f87171",
    fontStyle: "italic",
  },
  messageBody: {
    margin: 0,
    lineHeight: 1.4,
  },
  composer: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    borderRadius: 16,
    border: "1px solid rgba(148,163,184,0.4)",
    padding: 14,
    background: "rgba(15,23,42,0.6)",
    color: "#f8fafc",
    resize: "none",
  },
  primaryButton: {
    borderRadius: 999,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    padding: "12px 24px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.5)",
    background: "transparent",
    color: "#e2e8f0",
    padding: "8px 18px",
    cursor: "pointer",
  },
  blankState: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    textAlign: "center",
    background: "#0f172a",
    color: "#e2e8f0",
  },
};
