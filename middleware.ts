import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

const publicPaths = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = publicPaths.includes(pathname);

  if (pathname === "/register") return NextResponse.redirect(new URL("/login", request.url));
  if (!hasSession && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  if (hasSession && isPublic) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/register", "/change-password", "/admin/:path*", "/activity/:path*", "/records/:path*", "/stats/:path*", "/settings/:path*", "/sync/:path*"]
};
