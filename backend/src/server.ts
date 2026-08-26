import dotenv from "dotenv";
dotenv.config();

import { createServer } from "node:http";
import { createYoga, createSchema } from "graphql-yoga";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvers } from "./graphql/resolvers/index.js";
import type { GraphQLContext } from "./graphql/context.js";
import { verifyToken } from "./utils/jwt.js";
import express from "express";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all .graphql schema files
const schemaDir = path.join(__dirname, "graphql", "schema");
const schemaFiles = fs.readdirSync(schemaDir).filter((f) => f.endsWith(".graphql"));

// We need a base Query and Mutation type, then extensions
const baseTypeDefs = `
type Query {
  _empty: String
}
type Mutation {
  _empty: String
}
`;

const schemaParts = schemaFiles.map((file) =>
  fs.readFileSync(path.join(schemaDir, file), "utf-8")
);

const typeDefs = [baseTypeDefs, ...schemaParts].join("\n");

// Create GraphQL Yoga schema
const schema = createSchema<GraphQLContext>({
  typeDefs,
  resolvers,
});

// Create Yoga instance with context extraction
const yoga = createYoga({
  schema,
  context: ({ request }) => {
    const authHeader = request.headers.get("authorization");
    let user: GraphQLContext["user"] = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        user = verifyToken(token);
      } catch {
        // Invalid token — user stays null, resolvers will reject if auth required
      }
    }

    return { user };
  },
  graphqlEndpoint: "/graphql",
  landingPage: true,
});

// Express app for serving GraphQL + health check
const app = express();
app.use(cors());

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount GraphQL Yoga as Express middleware
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.use("/graphql", yoga as unknown as express.Handler);

const PORT = process.env.PORT ?? 5000;

const server = createServer(app);
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
});