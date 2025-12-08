"use client";

import { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";
import { encryptMessage, decryptMessage } from "../lib/crypto";

const SECRET_KEY =
  process.env.NEXT_PUBLIC_CHAT_SECRET ||
  "dev-secret-passphrase-change-me";

const Chat = () => {
  const [status, setStatus] = useState("disconnected");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => setStatus("connected");
    const handleDisconnect = () => setStatus("disconnected");
    const handleReceive = (payload = {}) => {
      if (!payload.cipherText) {
        return;
      }

      const plaintext = decryptMessage(payload.cipherText, SECRET_KEY);
      setMessages((prev) => [
        ...prev,
        {
          id: `${payload.senderId}-${payload.createdAt}`,
          senderId: payload.senderId,
          timestamp: new Date(payload.createdAt).toLocaleTimeString(),
          plaintext,
        },
      ]);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("receiveMessage", handleReceive);

    if (socket.disconnected) {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("receiveMessage", handleReceive);
      socket.disconnect();
    };
  }, []);

  const handleSend = (event) => {
    event.preventDefault();
    const trimmed = input.trim();

    if (!trimmed) {
      setInput("");
      return;
    }

    const socket = getSocket();
    if (socket.disconnected) {
      socket.connect();
    }

    const cipherText = encryptMessage(trimmed, SECRET_KEY);
    socket.emit("sendMessage", { cipherText });
    setInput("");
  };

  return (
    <div style={styles.wrapper}>
      <header style={styles.header}>
        <h2>End-to-End Encrypted Chat</h2>
        <span>
          Status:{" "}
          <strong style={{ color: status === "connected" ? "#22c55e" : "#ef4444" }}>
            {status}
          </strong>
        </span>
      </header>

      <section style={styles.messagesPane}>
        {messages.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No messages yet.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} style={styles.messageBubble}>
              <div style={styles.messageMeta}>
                <strong>{message.senderId}</strong>
                <span>{message.timestamp}</span>
              </div>
              <p>{message.plaintext}</p>
            </article>
          ))
        )}
      </section>

      <form style={styles.composer} onSubmit={handleSend}>
        <input
          style={styles.input}
          placeholder="Type an encrypted message..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button style={styles.button} type="submit" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

const styles = {
  wrapper: {
    maxWidth: 600,
    margin: "40px auto",
    padding: 24,
    borderRadius: 16,
    background: "#0f172a",
    color: "#e2e8f0",
    fontFamily: "system-ui, sans-serif",
    boxShadow: "0 20px 30px rgba(15, 23, 42, 0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  messagesPane: {
    minHeight: 260,
    maxHeight: 360,
    overflowY: "auto",
    borderRadius: 12,
    padding: 16,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "rgba(15,23,42,0.7)",
    marginBottom: 16,
  },
  messageBubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    background: "#1e1b4b",
  },
  messageMeta: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.8rem",
    color: "#c4b5fd",
    marginBottom: 6,
  },
  composer: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 999,
    padding: "12px 16px",
    border: "1px solid rgba(148,163,184,0.4)",
    background: "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
  },
  button: {
    borderRadius: 999,
    border: "none",
    padding: "0 24px",
    background: "#7c3aed",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
};

export default Chat;
