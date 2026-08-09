import { NextResponse } from "next/server";
import { dataSourceStatus } from "../../../lib/data-source";

export async function GET() {
  return NextResponse.json({ ok: true, ...dataSourceStatus() }, { headers: { "Cache-Control": "no-store" } });
}
