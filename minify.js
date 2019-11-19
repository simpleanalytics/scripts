const UglifyJS = require("uglify-js");
const fs = require("fs");
const esprima = require("esprima");

const green = "\x1b[32m%s\x1b[0m";
const yellow = "\x1b[33m%s\x1b[0m";
const red = "\x1b[31m%s\x1b[0m";

const files = {
  default: {
    type: "js",
    original: `${__dirname}/src/default.js`,
    minified: `${__dirname}/dist/default.js`,
    prepend: [
      "/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/script) */",
      ""
    ],
    append: []
  },
  embed: {
    type: "js",
    original: `${__dirname}/src/embed.js`,
    minified: `${__dirname}/dist/embed.js`,
    prepend: [
      "/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/embed-graph-on-your-site) */",
      ""
    ],
    append: []
  },
  external: {
    type: "js",
    original: `${__dirname}/src/external.js`,
    minified: `${__dirname}/dist/external.js`,
    prepend: [
      "/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/script) */",
      ""
    ],
    append: []
  },
  iframe: {
    type: "html",
    original: `${__dirname}/src/iframe.js`,
    minified: `${__dirname}/dist/iframe.html`,
    prepend: ["<!DOCTYPE html>", "<title>SA</title>", "<script>"],
    append: ["</script>"]
  }
};

const options = {
  warnings: true,
  ie8: true,
  toplevel: true,
  mangle: { reserved: ["sa"] },
  nameCache: null
};

for (const file in files) {
  if (files.hasOwnProperty(file)) {
    const { type, original, minified, prepend, append } = files[file];
    const name = file.toUpperCase();

    const contents = fs.readFileSync(original, "utf8");
    const { code, warnings } = UglifyJS.minify(contents, options);
    for (const warning of warnings || [])
      console.warn(yellow, `[MINIFY][${name}] ${warning}`);
    const nginxCode = code.replace(
      "simpleanalytics.example.com",
      '<!--# echo var="http_host" default="" -->'
    );
    const lines = [...prepend, nginxCode, ...append].join("\n");

    const validate =
      type === "js"
        ? lines.replace('<!--# echo var="http_host" default="" -->', "")
        : code;

    try {
      esprima.parseScript(validate);
    } catch (error) {
      const { index, lineNumber, description } = error;
      console.log(
        red,
        `[MINIFY][${name}][ERROR] ${original
          .split("/")
          .pop()} ${description} at line ${lineNumber} position ${index}`
      );
      continue;
    }

    fs.writeFileSync(minified, lines);
    const bytes = new TextEncoder("utf-8").encode(lines).length;

    console.log(
      green,
      `[MINIFY][${name}] Minified ${original
        .split("/")
        .pop()} into ${bytes} bytes`
    );
  }
}
