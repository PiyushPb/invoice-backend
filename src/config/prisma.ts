import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./env.js";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("[PostgreSQL Pool Error]:", err);
});

const adapter = new PrismaPg(pool);

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  var __pool: pg.Pool | undefined;
}

export const prisma = global.__prisma ?? new PrismaClient({ adapter });
export const dbPool = global.__pool ?? pool;

if (config.nodeEnv !== "production") {
  global.__prisma = prisma;
  global.__pool = dbPool;
}

