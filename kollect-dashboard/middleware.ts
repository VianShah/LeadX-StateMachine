import { NextResponse, type NextRequest } from "next/server";

// Cheap presence check; real verification happens in layouts and API routes.
export function middleware(req: NextRequest) {
  const has = req.cookies.has("kollect_session");
  const { pathname } = req.nextUrl;
  if (!has && !pathname.startsWith("/login")) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
