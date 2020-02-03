const url = require("url");
const http = require("http");
const { PROXY_PORT } = require("../constants");

const LOG_PREFIX = "=> Proxy:";

const route = (req, res) => {
  const { pathname } = url.parse(req.url);
  res.writeHead(200, { "Content-Type": "text/html" });

  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.write("<!DOCTYPE html><html><body><h1>Hi test</h1></body></html>");
    return res.end();
  }
  if (pathname === "/favicon.ico") {
    res.writeHead(404);
    return res.end();
  }

  console.log(LOG_PREFIX, `${req.method} request to ${pathname}`);

  res.write("Hi");
  res.end();
};

module.exports = () =>
  new Promise(resolve => {
    const server = http.createServer(route).listen(PROXY_PORT, () => {
      console.log(LOG_PREFIX, `Started on port ${PROXY_PORT}`);
      resolve({
        done: () =>
          new Promise(resolve => {
            console.log(LOG_PREFIX, "Closing...");
            server.close(resolve);
          })
      });
    });
  });
