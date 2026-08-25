import { createYoga, createSchema } from "graphql-yoga";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolvers } from "./graphql/resolvers/index.js";

const typeDefs = readFileSync(
  new URL("./graphql/schema/schema.graphql", import.meta.url),
  "utf-8"
);

const schema = createSchema({
  typeDefs,
  resolvers,
});

const yoga = createYoga({
  schema,
});

const server = createServer(yoga);

server.listen(4000, () => {
  console.log("GraphQL server running at http://localhost:4000/graphql");
});