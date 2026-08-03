// The read-only monitor.
//
// THE ONE PROPERTY THIS FILE EXISTS TO GUARANTEE: it cannot change your project.
// Not "does not by default" — cannot. There is no write path in the routing
// table, no request body is ever read, and any method other than GET or HEAD is
// refused before the URL is even looked at. That refusal is tested, because a
// safety property nobody checks is a comment.
//
// Everything else follows from that. No conflict resolution, no version checks,
// no editing protocol, no question about whose write wins when the agent and the
// page touch the same file — the page has no writes, so the question dissolves.
//
// Security posture. The server binds loopback and has no authentication: on a
// single-user machine the OS permissions are the boundary. Two things still get
// checked, because "loopback only" is easier to claim than to keep:
//
//   - the bind address is never taken from user input, only from config;
//   - the Host header must itself be loopback, which is what stops a DNS
//     rebinding attack from letting a web page in your browser read this API.
//
// Zero dependencies, so this is node:http and nothing else.

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildState, fingerprint } from './state.js';

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui');

/** Methods that cannot change anything. Nothing else is routed at all. */
const READ_METHODS = new Set(['GET', 'HEAD']);

/**
 * Assemble the page into one self-contained document.
 *
 * Inlined at request time rather than at build time: the source stays three
 * readable files, and what ships is one document with no second request, no
 * bundler and no cache to invalidate. RFC D-005 wanted self-contained delivery;
 * it never wanted a single unreadable source file.
 */
export function renderPage() {
  const html = readFileSync(path.join(UI_DIR, 'index.html'), 'utf8');
  const css = readFileSync(path.join(UI_DIR, 'app.css'), 'utf8');
  const js = readFileSync(path.join(UI_DIR, 'app.js'), 'utf8');
  return html
    .replace('/* {{CSS}} */', () => css)
    .replace('/* {{JS}} */', () => js);
}

function isLoopbackHost(hostHeader) {
  if (!hostHeader) return false;
  // Strip the port; handle bracketed IPv6.
  const host = hostHeader.startsWith('[')
    ? hostHeader.slice(1, hostHeader.indexOf(']'))
    : hostHeader.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0:0:0:0:0:0:0:1';
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'content-type': type,
    // Nothing here should ever be cached, embedded, or reached from a page.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(body);
}

export function createMonitor(config, { onError } = {}) {
  return createServer((req, res) => {
    // 1. Refuse anything that is not a read, before anything else happens.
    //    This is the read-only guarantee, and it is deliberately the first
    //    branch in the function rather than a check inside each handler.
    if (!READ_METHODS.has(req.method)) {
      return send(
        res,
        405,
        JSON.stringify({
          error: 'the monitor is read-only',
          detail:
            'This server has no write endpoints. Edit the documents in your editor or through your AI agent; the page reflects them.',
        }),
        'application/json; charset=utf-8',
        { allow: 'GET, HEAD' }
      );
    }

    // 2. Refuse a non-loopback Host header. Without this, a page on the open
    //    internet can point a hostname at 127.0.0.1 and read this API through
    //    the visitor's browser — the bind address alone does not stop that.
    if (!isLoopbackHost(req.headers.host)) {
      return send(res, 403, JSON.stringify({ error: 'loopback access only' }));
    }

    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, JSON.stringify({ error: 'bad request' }));
    }

    try {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return send(res, 200, renderPage(), 'text/html; charset=utf-8', {
          // The page is self-contained; nothing external may be loaded, and
          // nothing may be sent anywhere. Belt and braces on top of the CSP-free
          // fact that the document has no external references to begin with.
          'content-security-policy':
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
        });
      }

      if (url.pathname === '/api/state') {
        // The client sends the fingerprint it already has. If nothing the state
        // depends on has been touched, say so without reparsing a line.
        const since = url.searchParams.get('since');
        if (since) {
          const now = fingerprint(config, config.featuresDir);
          if (now === since) {
            return send(res, 200, JSON.stringify({ unchanged: true, fingerprint: now }));
          }
        }
        return send(res, 200, JSON.stringify(buildState(config)));
      }

      return send(res, 404, JSON.stringify({ error: 'not found' }));
    } catch (err) {
      // A parse error in the user's documents must not take the server down;
      // the page shows the error, which is itself useful information.
      if (onError) onError(err);
      return send(res, 500, JSON.stringify({ error: err.message }));
    }
  });
}

/**
 * Start the monitor, failing loudly on a port that is already taken.
 *
 * Never picks a different port. A tool that silently moves is a tool you have to
 * go looking for, and on a machine where the developer's own app owns 5173 and
 * 8000, quietly taking "some free port" is exactly how you end up unable to say
 * which process is serving what.
 */
export function startMonitor(config, { port, host } = {}) {
  const boundPort = port ?? config.port ?? 7788;
  const boundHost = host ?? config.host ?? '127.0.0.1';

  return new Promise((resolve, reject) => {
    const server = createMonitor(config);
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `port ${boundPort} is already in use.\n` +
              `  Something else is listening there — your app's dev server, most likely.\n` +
              `  Choose another: adp monitor --port <n>, or set "port" in your config.\n` +
              `  Nothing was started.`
          )
        );
      } else if (err.code === 'EACCES') {
        reject(new Error(`not allowed to bind port ${boundPort} (ports below 1024 need privileges)`));
      } else {
        reject(err);
      }
    });
    server.listen(boundPort, boundHost, () => {
      resolve({ server, port: server.address().port, host: boundHost });
    });
  });
}

export function uiExists() {
  return existsSync(path.join(UI_DIR, 'index.html'));
}
