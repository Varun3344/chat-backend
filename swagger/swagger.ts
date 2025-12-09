import swaggerUi, { JsonObject } from "swagger-ui-express";
import yaml from "yamljs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Load YAML straight from the project root so compiled builds (dist) still find the files.
const swaggerRoutesDir = path.resolve(process.cwd(), "swagger", "routessw");
const loadYaml = (fileName: string): JsonObject =>
  yaml.load(path.join(swaggerRoutesDir, fileName));

const pathSpecs: JsonObject[] = [
  loadYaml("direct.yaml"),
  loadYaml("directAttachment.yaml"),
  loadYaml("group.yaml"),
  loadYaml("groupAttachment.yaml"),
  loadYaml("groupCreate.yaml"),
  loadYaml("groupMember.yaml"),
  loadYaml("delete.yaml"),
];

const apiKeyTable: Array<{ label: string; value?: string }> = [
  { label: "Direct chat send", value: process.env.API_KEY_DIRECT },
  { label: "Direct chat fetch", value: process.env.API_KEY_DIRECT_FETCH },
  { label: "Direct attachment", value: process.env.API_KEY_DIRECT_ATTACHMENT },
  { label: "Direct delete", value: process.env.API_KEY_DIRECT_DELETE },
  { label: "Group chat send/fetch", value: process.env.API_KEY_GROUP },
  { label: "Group create", value: process.env.API_KEY_GROUP_CREATE },
  { label: "Group member mgmt", value: process.env.API_KEY_GROUP_MEMBER },
  { label: "Group attachment", value: process.env.API_KEY_DIRECT_ATTACHMENT },
  { label: "Group delete", value: process.env.API_KEY_GROUP_DELETE },
  { label: "Admin (all)", value: process.env.API_KEY_ADMIN },
];

const markdownKeyTable = [
  "| Purpose | API Key |",
  "| --- | --- |",
  ...apiKeyTable.map(
    ({ label, value }) => `| ${label} | \`${value || "set in .env"}\` |`
  ),
].join("\n");

export const swaggerSpec: JsonObject = {
  openapi: "3.0.0",
  info: {
    title: "LawWorld Chat API",
    version: "1.0.0",
    description: [
      "API documentation for direct chat, group chat, attachments, membership and moderation flows.",
      "",
      "Use the **Authorize** button in the Swagger UI to inject your `x-api-key`, or copy keys from the table below (kept in sync with your `.env`).",
      "",
      markdownKeyTable,
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:5001" },
    { url: "https://your-domain.com" },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Copy a key from the table in the description above or use the Authorize button.",
      },
    },
  },
  security: [
    {
      ApiKeyAuth: [],
    },
  ],
  paths: pathSpecs.reduce(
    (acc, spec) => ({
      ...acc,
      ...spec.paths,
    }),
    {}
  ),
};

export const swaggerUiMiddleware = swaggerUi;
