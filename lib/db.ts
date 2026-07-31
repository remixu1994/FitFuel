import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var fitfuelPrisma: PrismaClient | undefined;
}

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const required = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"] as const;
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error(`缺少数据库配置：${missing.join(", ")}`);

  const user = encodeURIComponent(process.env.PGUSER!);
  const password = encodeURIComponent(process.env.PGPASSWORD!);
  const sslMode = process.env.PGSSL === "true" ? "require" : "disable";
  return `postgresql://${user}:${password}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}?sslmode=${sslMode}`;
}

// ---- Lazy initialization ----
// Prisma client and env validation are deferred until first runtime access,
// so importing this module during `next build` does NOT require DB credentials.

let _prisma: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (_prisma) return _prisma;
  _prisma = global.fitfuelPrisma ?? new PrismaClient({
    datasources: { db: { url: databaseUrl() } }
  });
  if (process.env.NODE_ENV !== "production") global.fitfuelPrisma = _prisma;
  return _prisma;
}

/**
 * Lazy proxy — delegates to the real PrismaClient on first property access.
 * No DB connection or env-var validation happens at import time.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  }
});

// ---- Raw SQL helpers (unchanged logic) ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryResultRow = Record<string, any>;
export type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  rowCount: number;
};

type PrismaRawClient = Pick<
  PrismaClient,
  "$queryRawUnsafe" | "$executeRawUnsafe"
> | Prisma.TransactionClient;

function rawParameter(value: unknown) {
  if (
    value !== null
    && typeof value === "object"
    && !(value instanceof Date)
    && !(value instanceof Uint8Array)
    && !Array.isArray(value)
    && !Prisma.Decimal.isDecimal(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}

function pgCompatibleRow<T extends QueryResultRow>(row: T): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === "bigint" || Prisma.Decimal.isDecimal(value)) {
      return [key, value.toString()];
    }
    return [key, value];
  })) as T;
}

export class PrismaQueryClient {
  constructor(private readonly client: PrismaRawClient) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    const statement = sql.trim();
    const returnsRows = /^(select|with|show|explain)\b/i.test(statement)
      || /\breturning\b/i.test(statement);
    const values = params.map(rawParameter);

    if (returnsRows) {
      const rows = await this.client.$queryRawUnsafe<T[]>(sql, ...values);
      return { rows: rows.map(pgCompatibleRow), rowCount: rows.length };
    }

    const rowCount = await this.client.$executeRawUnsafe(sql, ...values);
    return { rows: [], rowCount };
  }
}

// ---- Lazy db proxy ----

let _db: PrismaQueryClient | undefined;

function getDb(): PrismaQueryClient {
  if (!_db) _db = new PrismaQueryClient(getPrisma());
  return _db;
}

/**
 * Lazy proxy — delegates to the real PrismaQueryClient on first access.
 */
export const db = new Proxy({} as PrismaQueryClient, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance, prop);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
  }
});

export async function transaction<T>(work: (client: PrismaQueryClient) => Promise<T>) {
  return getPrisma().$transaction(
    client => work(new PrismaQueryClient(client)),
    { timeout: 15_000 }
  );
}

export function numbers<T extends QueryResultRow>(row: T) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
  ])) as T;
}
