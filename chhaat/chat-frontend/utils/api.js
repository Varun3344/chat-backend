const RAW_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5001";

const API_BASE_URL = RAW_API_BASE_URL.endsWith("/")
  ? RAW_API_BASE_URL.slice(0, -1)
  : RAW_API_BASE_URL;

const jsonRequest = async (path, { apiKey, method = "GET", body } = {}) => {
  const url = `${API_BASE_URL}${path}`;
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.message || `Request to ${path} failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

const toQueryString = (params = {}) => {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );

  if (entries.length === 0) {
    return "";
  }

  const query = new URLSearchParams();
  entries.forEach(([key, value]) => query.append(key, value));

  return `?${query.toString()}`;
};

export const sendDirectMessageApi = ({
  from,
  to,
  message,
  suppressRealtime = false,
}) => {
  if (!from || !to || !message) {
    return Promise.reject(
      new Error("from, to and message must be provided for direct messages")
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_DIRECT;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_DIRECT environment variable")
    );
  }

  return jsonRequest("/chat/direct/send", {
    method: "POST",
    apiKey,
    body: JSON.stringify({ from, to, message, suppressRealtime }),
  });
};

export const fetchDirectMessagesApi = ({
  userA,
  userB,
  page = 1,
  limit = 50,
}) => {
  if (!userA || !userB) {
    return Promise.reject(
      new Error("userA and userB must be provided to fetch direct history")
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_DIRECT_FETCH;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_DIRECT_FETCH environment variable")
    );
  }

  const query = toQueryString({ page, limit });
  return jsonRequest(`/chat/direct/messages/${userA}/${userB}${query}`, {
    apiKey,
  });
};

export const sendGroupMessageApi = ({
  groupId,
  from,
  message,
  suppressRealtime = false,
}) => {
  if (!groupId || !from || !message) {
    return Promise.reject(
      new Error("groupId, from and message must be provided for group messages")
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_GROUP;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_GROUP environment variable")
    );
  }

  return jsonRequest("/chat/group/send", {
    method: "POST",
    apiKey,
    body: JSON.stringify({ groupId, from, message, suppressRealtime }),
  });
};

export const fetchGroupMessagesApi = ({ groupId, page = 1, limit = 50 }) => {
  if (!groupId) {
    return Promise.reject(new Error("groupId is required to fetch group history"));
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_GROUP;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_GROUP environment variable")
    );
  }

  const query = toQueryString({ page, limit });
  return jsonRequest(`/chat/group/messages/${groupId}${query}`, {
    apiKey,
  });
};

export const createGroupApi = ({ groupName, createdBy, members = [] }) => {
  if (!groupName || !createdBy) {
    return Promise.reject(
      new Error("groupName and createdBy are required to create a group")
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_GROUP_CREATE;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_GROUP_CREATE environment variable")
    );
  }

  return jsonRequest("/chat/group/create", {
    method: "POST",
    apiKey,
    body: JSON.stringify({ groupName, createdBy, members }),
  });
};

export const fetchUserGroupsApi = (userId) => {
  if (!userId) {
    return Promise.reject(new Error("userId is required to fetch groups"));
  }

  const apiKey = process.env.NEXT_PUBLIC_API_KEY_GROUP_MEMBER;
  if (!apiKey) {
    return Promise.reject(
      new Error("Missing NEXT_PUBLIC_API_KEY_GROUP_MEMBER environment variable")
    );
  }

  return jsonRequest(`/chat/group/member/${userId}`, {
    apiKey,
  });
};
