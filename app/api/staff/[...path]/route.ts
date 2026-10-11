import { NextResponse } from "next/server";

const PRINT_SERVER =
  process.env.PRINT_SERVER_URL?.trim() ||
  `http://127.0.0.1:${process.env.PRINT_SERVER_PORT ?? "3847"}`;

/** Plain route names only (status, jobs/cancel, ...). Stops `..` from reaching other print-server routes. */
const SEGMENT = /^[A-Za-z0-9_-]+$/;

// The PIN header and the body are per request, so nothing here is cached.
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Passes a staff call to print-server as-is: the x-staff-pin header, the JSON
 * body, and the status and body on the way back. print-server does the PIN
 * check and the rate limit, so this proxy adds no auth of its own.
 */
async function forward(request: Request, ctx: Ctx, method: "GET" | "POST"): Promise<Response> {
  const { path } = await ctx.params;
  if (path.length === 0 || !path.every((seg) => SEGMENT.test(seg))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const headers: Record<string, string> = {};
  const pin = request.headers.get("x-staff-pin");
  if (pin !== null) headers["x-staff-pin"] = pin;

  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = await request.text();
  }

  try {
    const res = await fetch(`${PRINT_SERVER}/staff/${path.join("/")}`, {
      method,
      headers,
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[api/staff] print server unreachable:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Print server unavailable" }, { status: 503 });
  }
}

export function GET(request: Request, ctx: Ctx) {
  return forward(request, ctx, "GET");
}

export function POST(request: Request, ctx: Ctx) {
  return forward(request, ctx, "POST");
}
