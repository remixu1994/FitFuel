import { NextResponse } from "next/server";
import { revokeMobileSession } from "@/server/auth";
import { jsonError } from "@/server/http";

export async function POST() {
  try { await revokeMobileSession(); return NextResponse.json({ok: true}); }
  catch (error) { return jsonError(error); }
}
