import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

export const connectMongoose = async (): Promise<typeof mongoose> => {
  if (isConnected) {
    return mongoose;
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("Missing MONGO_URI environment variable for Mongoose.");
  }

  const dbName = process.env.MONGO_DB_NAME;

  await mongoose.connect(uri, {
    dbName,
    autoIndex: true,
  });

  isConnected = true;
  return mongoose;
};

export default mongoose;
