const url = require("url");
const http = require("http");
const { readFileSync } = require("fs");
const { SERVER_PORT } = require("../constants");

const LOG_PREFIX = "=> Node server:";

const route = (req, res) => {
  const { pathname } = url.parse(req.url);

  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write("<!DOCTYPE html><html><body><h1>Hi test</h1></body></html>");
    return res.end();
  }
  if (pathname === "/favicon.ico") {
    res.writeHead(404);
    return res.end();
  }

  let body = "";
  if (pathname.endsWith(".js")) {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    body = readFileSync(`./dist${pathname}`, "utf8");
  } else {
    res.writeHead(200, { "Content-Type": "text/html" });
    body = "<!DOCTYPE html><html><body>";
    body += `<h1>Page <code>${pathname}</code></h1>`;
    body += `<p>Embedded with <code>${pathname}.js</code> script</p>`;
    body += `<script async defer src="${pathname}.js"></script>`;
    body += `</body></html>`;
  }

  console.log(
    LOG_PREFIX,
    `${req.method} request to ${pathname} with length of ${body.length}`
  );

  res.write(body);
  res.end();
};

module.exports = () =>
  new Promise(resolve => {
    const server = http.createServer(route).listen(SERVER_PORT, () => {
      console.log(LOG_PREFIX, `Started on port ${SERVER_PORT}`);
      resolve({
        done: () =>
          new Promise(resolve => {
            console.log(LOG_PREFIX, "Closing...");
            server.close(resolve);
          })
      });
    });
  });
