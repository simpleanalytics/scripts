const url = require("url");
const http = require("http");
const { readFileSync } = require("fs");
const { SERVER_PORT, DEBUG } = require("../constants");
const { getIPv4 } = require("./");
const { getJSONBody } = require("./request");

const log = (...messages) =>
  DEBUG && console.log("    => Node server:", ...messages);

const route = async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const { script } = query;

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

  global.REQUESTS.push({
    method: req.method,
    pathname,
    body: json
  });

  let body = "";
  if (pathname === "/script.js" && script) {
    const localhost = await getIPv4();
    res.writeHead(200, { "Content-Type": "text/javascript" });
    body = readFileSync(`./dist${script}`, "utf8");
    body = body
      .replace(/"https:"/gi, `"http:"`)
      .replace(/simpleanalyticscdn\.com/gi, `${localhost}:${SERVER_PORT}`)
      .replace(/"(queue|online)\."/gi, `""`);
    res.write(body);
    return res.end();
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  body = `<!DOCTYPE html>
    <html>
      <head>
        <title>Simple Analytics Test</title>
      </head>
    <body>`;

  // As this code will run in older browsers, don't try to be smart with ES6
  body += `<script>
    window.onload = function() {
      var state = { "page_id": 2 };
      var title = "Page 2";
      var url = "/page/2";
      if (window.history && window.history.pushState) {
        window.history.pushState(state, title, url);
      }
      else {
        window.location.href = url;
      }
    };
    </script>`;

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
        done: () =>
          new Promise(resolve => {
            log("Closing...");
            server.close(resolve);
          })
      });
    });
  });
