import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

export const client = new MongoClient(process.env.MONGO_URI);
let db;

export const connectDB = async () => {
  try {
    await client.connect();
    db = process.env.MONGO_DB_NAME
      ? client.db(process.env.MONGO_DB_NAME)
      : client.db();

    console.log(
      `MongoDB Connected Successfully (db: ${db.databaseName})`
    );
  } catch (error) {
    console.error("MongoDB Error:", error.message);
    process.exit(1);
  }
};

export const getCollection = (collectionName) => {
  if (!db) {
    throw new Error("Database connection not established");
  }

  return db.collection(collectionName);
};
