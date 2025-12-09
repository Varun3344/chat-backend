import { Request, Response, NextFunction } from "express";

export const verifyApiKey = (allowedKeys: string[]) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const apiKeyHeader = req.headers["x-api-key"];
    const apiKey =
      typeof apiKeyHeader === "string" ? apiKeyHeader : apiKeyHeader?.[0];

    if (!apiKey) {
      return res.status(401).json({
        status: "error",
        message: "API Key missing",
      });
    }

    if (!allowedKeys.includes(apiKey)) {
      return res.status(403).json({
        status: "error",
        message: "Invalid API Key",
      });
    }

    next();
  };
};
