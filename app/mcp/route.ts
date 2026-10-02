import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowMethods = "GET, POST, DELETE";

export const GET = () =>
  NextResponse.json(
    { error: "Use POST for MCP streamable HTTP or WebMCP in the browser." },
    {
      headers: { Allow: allowMethods },
      status: 405,
    }
  );

export const POST = () =>
  NextResponse.json(
    {
      error:
        "Listwell MCP over HTTP is not enabled yet. Use WebMCP tools on listwell.dev or the public HTTP API catalog.",
    },
    { status: 501 }
  );

export const DELETE = () =>
  NextResponse.json({ error: "No MCP session." }, { status: 404 });
