import express from "express";
import { createGroup } from "../controllers/groupCreateController.js";

const router = express.Router();

// POST /chat/group/create
router.post("/", createGroup);

export default router;
