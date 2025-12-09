import { MongoClient, Db, Collection, Document } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  throw new Error("Missing MONGO_URI environment variable");
}

export const client = new MongoClient(mongoUri);
let db: Db | null = null;

export const connectDB = async (): Promise<void> => {
  try {
    await client.connect();
    db = process.env.MONGO_DB_NAME
      ? client.db(process.env.MONGO_DB_NAME)
      : client.db();

    console.log(`MongoDB Connected Successfully (db: ${db.databaseName})`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MongoDB error";
    console.error("MongoDB Error:", message);
    process.exit(1);
  }
};

export const getCollection = <TSchema extends Document = Document>(
  collectionName: string
): Collection<TSchema> => {
  if (!db) {
    throw new Error("Database connection not established");
  }

  return db.collection<TSchema>(collectionName);
};
