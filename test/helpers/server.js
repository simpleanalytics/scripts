const url = require("url");
const http = require("http");
const { readFileSync } = require("fs");
const { SERVER_PORT, DEBUG, CI } = require("../constants");
const { getJSONBody } = require("./request");

const log = (...messages) =>
  DEBUG && console.log("    => Node server:", ...messages);

const error = (...messages) =>
  console.error("    => Node server (error):", ...messages);

const bool = (input) => {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") return input === "true";
  return false;
};

const route = async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const {
    os,
    browser,
    script,
    redirect = true,
    beacon,
    push,
    event,
    allowparams,
  } = query;

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
  }

  if (!json && pathname.endsWith(".gif")) json = query;

  // log(
  //   `${req.method} request to ${pathname} ${json ? JSON.stringify(json) : ""}`
  // );

  global.REQUESTS.push({
    method: req.method,
    pathname,
    body: json,
  });

  if (pathname === "/empty") {
    res.writeHead(200);
    res.write(
      `<!DOCTYPE html>
      <html>
        <head><title>Simple Analytics Test</title></head>
        <body><h1>Path: ${pathname}</h1></body>
      <html>`
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

    const localhost =
      os === "ios" || browser === "safari"
        ? `bs-local.com:${SERVER_PORT}`
        : `localhost:${SERVER_PORT}`;

    body = body.replace(/"https:\/\/queue\."/g, '"http://"');
    body = body.replace(/"simpleanalyticscdn\.com"/g, `"${localhost}"`);

    res.write(body);
    return res.end();
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  body = `<!DOCTYPE html>
    <html>
      <head>
        <title>Simple Analytics Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="height: 300vh;">
        <h1>Path: ${pathname}</h1>`;

  // As this code will run in older browsers, don't try to be smart with ES6
  let onload = "";
  if (event === "function") {
    onload = `sa_event(function() { return "function" + "output"; });`;
  } else if (event === "metadata") {
    onload = `sa_event("${event}", { date: new Date(), bool: false, int: 20301, string: "hi'/301%20uas@#*0" });`;
  } else if (event) {
    onload = `sa_event("${event}");`;
  } else if (bool(push)) {
    onload = `window.history.pushState({ "page_id": 2 }, "Push State", "/pushstate?project=project_x");`;
  } else if (bool(redirect)) {
    const params = new URLSearchParams({
      redirect: false,
      script: script || "",
      beacon: beacon || "",
      push: push || "",
      os: os || "",
      browser: browser || "",
    }).toString();
    onload = `window.location.href = "/href?${params}"`;
  }

  if (onload) {
    body += `<script>window.onload = function() {${onload}};</script>`;
  }

  if (script) {
    const params = new URLSearchParams({ script, browser, os }).toString();
    const attributes = ["defer", "async"];
    if (allowparams) attributes.push(`data-allow-params="${allowparams}"`);
    const attr = attributes.join(" ");
    const host =
      os === "ios" || browser === "safari"
        ? `http://bs-local.com:${SERVER_PORT}`
        : `http://localhost:${SERVER_PORT}`;
    const scriptHTML = `<script ${attr} src="${host}/script.js?${params}"></script>`;
    body += scriptHTML;
    body += `<p><code>&lt;script ${attr} src="${host}/script.js?${params}"&gt;&lt;/script&gt;</code></p>`;
  }

  body += `<p>OS: ${os}</p>`;
  body += `<p>Browser: ${browser}</p>`;

  body += `</body></html>`;

  res.write(body);
  res.end();
};

module.exports = () =>
  new Promise((resolve) => {
    const server = http.createServer(route).listen(SERVER_PORT, () => {
      log(`Started on port ${SERVER_PORT}`);
      resolve({
        done: () =>
          new Promise((resolve) => {
            log("Closing...");
            server.close(resolve);
          }),
      });
    });
  });
