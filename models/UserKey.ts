import mongoose, { Document, Model } from "mongoose";

export interface UserKeyAttributes {
  userId: string;
  publicKey: string;
  updatedAt?: Date;
}

export type UserKeyDocument = Document & UserKeyAttributes;

const userKeySchema = new mongoose.Schema<UserKeyDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    publicKey: { type: String, required: true },
  },
  {
    collection: "user_keys",
    timestamps: true,
  }
);

export const UserKeyModel: Model<UserKeyDocument> =
  mongoose.models.UserKey ||
  mongoose.model<UserKeyDocument>("UserKey", userKeySchema);

export default UserKeyModel;
