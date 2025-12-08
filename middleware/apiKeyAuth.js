export const verifyApiKey = (allowedKeys) => {
  return (req, res, next) => {
    const apiKey = req.headers["x-api-key"];

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
