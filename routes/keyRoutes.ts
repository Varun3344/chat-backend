import { Router } from "express";
import UserKeyModel from "../models/UserKey.js";

const router = Router();

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const record = await UserKeyModel.findOne({ userId }).lean();
    if (!record) {
      return res.status(404).json({ message: "Public key not found" });
    }

    return res.json({ publicKey: record.publicKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch key";
    return res.status(500).json({ message });
  }
});

router.put("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { publicKey } = req.body as { publicKey?: string };

    if (!userId || !publicKey) {
      return res.status(400).json({ message: "userId and publicKey are required" });
    }

    const updated = await UserKeyModel.findOneAndUpdate(
      { userId },
      { publicKey },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ publicKey: updated?.publicKey ?? publicKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to store key";
    return res.status(500).json({ message });
  }
});

export default router;
