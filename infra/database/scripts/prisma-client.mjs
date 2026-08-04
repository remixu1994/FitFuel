import { PrismaClient } from "@prisma/client";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const required = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing database settings: ${missing.join(", ")}`);

  const user = encodeURIComponent(process.env.PGUSER);
  const password = encodeURIComponent(process.env.PGPASSWORD);
  const sslMode = process.env.PGSSL === "true" ? "require" : "disable";
  return `postgresql://${user}:${password}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${sslMode}`;
}

export const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl() } }
});
