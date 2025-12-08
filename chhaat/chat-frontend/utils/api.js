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

export const sendDirectMessageApi = ({ from, to, message }) => {
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
    body: JSON.stringify({ from, to, message }),
  });
};

export const sendGroupMessageApi = ({ groupId, from, message }) => {
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
    body: JSON.stringify({ groupId, from, message }),
  });
};
