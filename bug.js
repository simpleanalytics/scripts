const browserstack = require("browserstack-local");
const url = require("url");
const http = require("http");
const PORT = 8080;

(async () => {
  http
    .createServer(req => {
      const { pathname } = url.parse(req.url);
      console.log("Request:", pathname);
    })
    .listen(PORT, () => {
      console.log("Started node server");
    });

  const bs_local = new browserstack.Local();

  const bs_local_args = {
    key: "vFDQyDm2qBysbybu6xkn",
    localIdentifier: "testing",
    forceLocal: "true",

    // Never proceeds with the following settings:
    forceProxy: "true",
    proxyHost: "localhost",
    proxyPort: PORT,

    // If I omit the folder with the proxy settings it returns "LocalError: No output received"
    f: "/Users/adriaan/Developer/simpleanalytics/scripts"
  };

  bs_local.start(bs_local_args, function(error) {
    if (error) return console.error("Error:", error);
    console.log("Running BrowserStackLocal", bs_local.isRunning());
    bs_local.stop(function() {
      console.log("Stopped BrowserStackLocal");
    });
  });
})();
