// Ephesus House chore board, served to anyone with the link.
//
// No account, no sign-in: that is why verify_jwt is off. It serves only the
// static files of a public repository and reads nothing from the caller, so
// there is no privileged action to protect. The board's data sits behind
// row-level security on the REST API, exactly as it does for any other visitor.
//
// Files come from GitHub raw rather than being baked in, so a push updates the
// board without redeploying. REFS are tried in order: the live branch first,
// then a known-good commit if that form ever stops resolving.

const OWNER = "claudekovalenko";
const REPO = "ephesus-house-oc";
const SLUG = "board";
const REFS = [
  "refs/heads/claude/chores-chart-rotation-app-p2hthb",
  "8d5c1dfe80ab5ed6159a28b0e8c53ffbdb1fcd33",
];

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
};

const ALLOWED = new Set([
  "index.html", "404.html", "check.html",
  "app.js", "rotation.js", "config.js", "styles.css", "seed.json",
  "whiteboard.jpg",
]);

async function fromGithub(path: string): Promise<Response | null> {
  for (const ref of REFS) {
    const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${ref}/app/${path}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "ephesus-board" } });
      if (res.ok) return res;
    } catch (_) {
      // fall through to the next ref
    }
  }
  return null;
}

/**
 * Work out which file is being asked for. The host may present the path as
 * "/board/app.js" or "/functions/v1/board/app.js" depending on how the request
 * arrived, so strip whichever prefix is actually there rather than assuming.
 */
function resolve(pathname: string): { file: string; redirect: boolean } {
  let p = pathname.replace(/^\/+/, "").replace(/^functions\/v1\//, "");

  // Bare mount point: relative asset paths in the HTML only resolve correctly
  // under a trailing slash.
  if (p === SLUG) return { file: "index.html", redirect: true };

  if (p === SLUG + "/") p = "";
  else if (p.startsWith(SLUG + "/")) p = p.slice(SLUG.length + 1);

  return { file: p === "" ? "index.html" : p, redirect: false };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const { file, redirect } = resolve(url.pathname);

  if (redirect) {
    return Response.redirect(url.origin + url.pathname + "/" + url.search, 302);
  }

  const notFound = !ALLOWED.has(file);
  const upstream = await fromGithub(notFound ? "404.html" : file);

  if (!upstream) {
    return new Response(
      "The board could not be loaded right now. Try again in a minute.",
      { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const ext = (notFound ? "html" : file.split(".").pop() || "html").toLowerCase();
  return new Response(upstream.body, {
    status: notFound ? 404 : 200,
    headers: {
      "Content-Type": TYPES[ext] || "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
