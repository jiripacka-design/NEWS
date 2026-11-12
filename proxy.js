import {NextResponse} from 'next/server';

// Cron routes (/api/refresh, /api/digest, /api/recheck) check the cron bearer token themselves, and refuse anyone else without a session.
const PUBLIC = new Set(['/login', '/login.html', '/api/login', '/api/refresh', '/api/digest', '/api/recheck']);

async function verify(raw, secret) {
  // "<expiry>.<name>.<sig>" (v3.13, signed over "<expiry>.<name>") or the older "<expiry>.<sig>".
  const parts = String(raw || '').split('.'), e = parts[0], s = parts[parts.length - 1], signed = parts.length === 3 ? parts[0] + '.' + parts[1] : e;
  if (parts.length < 2 || parts.length > 3 || !e || !s || Number(e) < Date.now() || !secret) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const x = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(signed)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return x === s;
}

export async function proxy(req) {
  const p = req.nextUrl.pathname;
  // /login AND /login.html are both public: vercel.json cleanUrls rewrites one to the other,
  // so allowing only one caused a redirect loop. /api/refresh and /api/digest are called by Vercel Cron with a
  // bearer token (no cookie) and authenticate themselves in the route.
  if (PUBLIC.has(p)) return NextResponse.next();
  if (await verify(req.cookies.get('ci_session')?.value, process.env.SESSION_SECRET)) return NextResponse.next();
  if (p.startsWith('/api/')) return Response.json({error: 'Unauthorized'}, {status: 401});
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']};
