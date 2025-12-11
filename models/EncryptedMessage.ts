import mongoose, { Document, Model } from "mongoose";

export interface EncryptedMessageAttributes {
  conversationId: string;
  from: string;
  to: string;
  ciphertext: string;
  iv: string;
  createdAt?: Date;
}

export type EncryptedMessageDocument = Document & EncryptedMessageAttributes;

const encryptedMessageSchema = new mongoose.Schema<EncryptedMessageDocument>(
  {
    conversationId: { type: String, required: true, index: true },
    from: { type: String, required: true, index: true },
    to: { type: String, required: true, index: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "encrypted_messages",
  }
);

export const EncryptedMessageModel: Model<EncryptedMessageDocument> =
  mongoose.models.EncryptedMessage ||
  mongoose.model<EncryptedMessageDocument>("EncryptedMessage", encryptedMessageSchema);

export default EncryptedMessageModel;
