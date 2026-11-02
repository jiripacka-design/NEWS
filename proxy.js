import {NextResponse} from 'next/server';

const PUBLIC = new Set(['/login', '/login.html', '/api/login', '/api/refresh', '/api/digest']);

async function verify(raw, secret) {
  const [e, s] = String(raw || '').split('.');
  if (!e || !s || Number(e) < Date.now() || !secret) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const x = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(e)))].map(b => b.toString(16).padStart(2, '0')).join('');
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
