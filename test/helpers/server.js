const url = require("url");
const http = require("http");
const { readFileSync } = require("fs");
const { SERVER_PORT } = require("../constants");
const { getJSONBody } = require("./request");

const log = (...messages) => console.log("    => Node server:", ...messages);
const requests = [];

const route = async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const { push, script } = query;

  if (pathname === "/favicon.ico") {
    res.writeHead(404);
    return res.end();
  }

  if (pathname === "/empty") {
    res.writeHead(200);
    return res.end();
  }

  log(
    `${req.method} request to ${pathname} with query ${JSON.stringify(query)}`
  );

  const json = req.method === "POST" ? await getJSONBody(req) : null;

  requests.push({
    method: req.method,
    pathname,
    body: json
  });

  let body = "";
  if (pathname === "/script.js" && script) {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    body = readFileSync(`./dist${script}`, "utf8");
    body = body
      .replace(/"https:"/gi, `"http:"`)
      .replace(/simpleanalyticscdn\.com/gi, `localhost:${SERVER_PORT}`)
      .replace(/"(queue|online)\."/gi, `""`);
    res.write(body);
    return res.end();
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  body = "<!DOCTYPE html><html><body>";

  if (push === "true") {
    body += `<script>
    window.onload = function() {
      const state = { "page_id": 2 };
      const title = "Page 2";
      const url = "/page/2";
      if (window.history && window.history.pushState) window.history.pushState(state, title, url);
      else window.location.href = url;
    };
    </script>`;
  }

  if (script)
    body += `<script async defer src="/script.js?script=${script}"></script>`;

  body += `</body></html>`;

  res.write(body);
  res.end();
};

module.exports = () =>
  new Promise(resolve => {
    const server = http.createServer(route).listen(SERVER_PORT, () => {
      log(`Started on port ${SERVER_PORT}`);
      resolve({
        requests,
        done: () =>
          new Promise(resolve => {
            log("Closing...");
            server.close(resolve);
          })
      });
    });
  });
