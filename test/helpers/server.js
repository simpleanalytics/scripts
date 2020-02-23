const url = require("url");
const http = require("http");
const { readFileSync } = require("fs");
const { SERVER_PORT, DEBUG } = require("../constants");
const { getPost, getJSONBody } = require("./request");

const log = (...messages) =>
  DEBUG && console.log("    => Node server:", ...messages);

const error = (...messages) =>
  console.error("    => Node server (error):", ...messages);

const bool = input => {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") return input === "true";
  return false;
};

const route = async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const { script, redirect = true, beacon, push } = query;

  // log(`${req.method} request to ${pathname} ${JSON.stringify(query)}`);

  if (pathname === "/favicon.ico") {
    res.writeHead(404);
    return res.end();
  }

  // Block HEAD requests
  if (req.method === "HEAD") {
    res.writeHead(200);
    return res.end();
  }

  let json;
  try {
    json = req.method === "POST" ? await getJSONBody(req) : null;
  } catch (message) {
    error(message);
    const body = await getPost(req);
    error("pathname", pathname);
    error("body", body);
  }

  if (!json && pathname.endsWith(".gif")) json = query;

  global.REQUESTS.push({
    method: req.method,
    pathname,
    body: json
  });

  if (pathname === "/empty") {
    res.writeHead(200);
    res.write(
      `<!DOCTYPE html><html><head><title>Simple Analytics Test</title><body><h1>${pathname}`
    );
    return res.end();
  }

  if (pathname.endsWith(".gif")) {
    res.writeHead(200);
    return res.end();
  }

  let body = "";
  if (pathname === "/script.js" && script) {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    body = readFileSync(`./dist${script}`, "utf8");
    body = body.replace(/"https:/gi, `"http:`);
    res.write(body);
    return res.end();
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  body = `<!DOCTYPE html>
    <html>
      <head>
        <title>Simple Analytics Test</title>
      </head>
    <body style="height: 300vh;"><h1>${pathname}`;

  // As this code will run in older browsers, don't try to be smart with ES6
  let onload = "";
  if (bool(push)) {
    onload = `window.history.pushState({ "page_id": 2 }, "Push State", "/pushstate");`;
  } else if (bool(redirect)) {
    const params = new URLSearchParams({
      redirect: false,
      script: script || "",
      beacon: beacon || "",
      push: push || ""
    }).toString();
    onload = `window.location.href = "/href?${params}"`;
  }

  if (onload) {
    body += `<script>window.onload = function() {${onload}};</script>`;
  }

  if (script) {
    const params = script ? new URLSearchParams({ script }).toString() : "";
    body += `<script defer async src="/script.js?${params}"></script>`;
  }

  body += `</body></html>`;

  res.write(body);
  res.end();
};

module.exports = () =>
  new Promise(resolve => {
    const server = http.createServer(route).listen(SERVER_PORT, () => {
      log(`Started on port ${SERVER_PORT}`);
      resolve({
        done: () =>
          new Promise(resolve => {
            log("Closing...");
            server.close(resolve);
          })
      });
    });
  });
