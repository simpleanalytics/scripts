const Handlebars = require("handlebars");
const UglifyJS = require("uglify-js");
const fs = require("fs");
const esprima = require("esprima");
const path = require("path");

const GREEN = "\x1b[32m%s\x1b[0m";
const YELLOW = "\x1b[33m%s\x1b[0m";
const RED = "\x1b[31m%s\x1b[0m";

const VERSION = 4;

Handlebars.registerHelper("or", function (param1, param2) {
  return param1 || param2;
});

const MINIFY_OPTIONS = {
  warnings: false,
  ie8: true,
  toplevel: true,
  mangle: {
    reserved: ["sa"],
  },
  nameCache: null,
};

const fillTemplate = (template, { overwriteOptions = null } = {}) => {
  return template
    .replace(
      /\{\{\s?nginxHost\s?\}\}/gi,
      '<!--# echo var="http_host" default="" -->'
    )
    .replace(
      /\{\{\s?nginxProxyHost\s?\}\}/gi,
      '<!--# echo var="proxy_hostname" default="" --><!--# echo var="proxy_path" default="/simple" -->'
    )
    .replace(
      /\\?"\{\{\s?overwriteOptions\s?\}\}\\?"/gi,
      overwriteOptions
        ? JSON.stringify(overwriteOptions).replace(/:"([^"]+)"/gi, ":$1")
        : "{}"
    )
    .replace(
      /"\{\{\s?cloudFlareCustomDomain\s?\}\}"/gi,
      'INSTALL_OPTIONS.custom_domain || "queue.simpleanalyticscdn.com"'
    );
};

const IS_TESTING = process.argv[2] === "testing";
if (IS_TESTING) console.log(YELLOW, "Running the scripts as testing");

const DEFAULTS = {
  testing: IS_TESTING,
  minify: true,
  duration: true,
  events: true,
  hash: true,
  scroll: true,
  spa: true,
  uniques: true,
  online: false,
  screen: true,
  ignorepages: true,
  botdetection: true,
  errorhandling: true,
  warnings: true,
  ignorednt: true,
  saGlobal: "sa_event",
  url: "docs.simpleanalytics.com/script",
};

const LIGHT = {
  ...DEFAULTS,
  spa: false,
  hash: false,
  duration: false,
  events: false,
  scroll: false,
  uniques: false,
  online: false,
  screen: false,
  ignorepages: false,
  botdetection: false,
  errorhandling: false,
  warnings: false,
  ignorednt: false,
};

const files = [
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `hello.js`,
    variables: {
      ...DEFAULTS,
      baseUrl: "simpleanalyticscdn.com",
      apiUrlPrefix: "queue.",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `latest.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      baseUrl: "simpleanalyticscdn.com",
      apiUrlPrefix: "queue.",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `cloudflare.js`,
    variables: {
      ...DEFAULTS,
      minify: false,
      version: 1,
      baseUrl: "{{cloudFlareCustomDomain}}",
      overwriteOptions: {
        saGlobal: "INSTALL_OPTIONS.saGlobal",
        mode: "INSTALL_OPTIONS.mode",
        skipDnt: "INSTALL_OPTIONS.recordDnt",
      },
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/app.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/e.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      saGlobal: "sa",
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/latest.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/proxy.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      baseUrl: "{{nginxProxyHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `light.js`,
    variables: {
      ...LIGHT,
      version: VERSION,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/light.js`,
    variables: {
      ...LIGHT,
      baseUrl: "{{nginxHost}}",
      version: VERSION,
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/embed.js`,
    output: `embed.js`,
    variables: {
      minify: true,
      version: 1,
      script: "embed.js",
      url: "docs.simpleanalytics.com/embed-graph-on-your-site",
    },
  },
];

for (const file of files) {
  const { variables, input, output } = file;
  const name = output.toUpperCase();
  const versionFile = `${__dirname}/dist/v${variables.version}/${output}`;
  const latestFile = `${__dirname}/dist/latest/${output}`;

  const contents = fs
    .readFileSync(input, "utf8")
    .replace(/\"\{\{\s?version\s?\}\}"/g, variables.version || 0)
    .replace(/\/\*\*\s?/g, "{{")
    .replace(/\s?\*\*\//g, "}}")
    .replace(/{{end(if|unless)/g, "{{/$1")
    .replace(/{{(if|unless)/g, "{{#$1");

  const finalFileName = output.split("/").pop();

  const template = Handlebars.compile(contents);
  const rawCode = template({
    ...variables,
    overwriteOptions: "{{overwriteOptions}}",
  });

  const date = new Date().toISOString().slice(0, 10);
  const hash = require("crypto")
    .createHash("sha256")
    .update(rawCode)
    .digest("hex")
    .slice(0, 4);

  const prepend = `/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; ${date}; ${hash}) */\n`;

  const originalFileName = finalFileName.replace(".js", ".source.js");
  const { code: codeTemplate, map, warnings } = variables.minify
    ? UglifyJS.minify(
        {
          [originalFileName]: rawCode,
        },
        {
          ...MINIFY_OPTIONS,
          output: {
            ...MINIFY_OPTIONS.output,
            preamble: prepend,
          },
          sourceMap: {
            includeSources: true,
            filename: originalFileName,
            url: `${finalFileName}.map`,
          },
        }
      )
    : {
        code: prepend + rawCode,
      };

  if (!codeTemplate)
    console.warn(RED, `[MINIFY][${name}] codeTemplate is undefined`);
  if (!template) console.warn(RED, `[MINIFY][${name}] template is undefined`);

  for (const warning of warnings || [])
    console.warn(YELLOW, `[MINIFY][${name}] ${warning}`);

  const code = fillTemplate(codeTemplate, variables);

  const validate = template({
    ...variables,
    hostname: "sa.example.com",
    script: "sa.example.com/app.js",
  });

  try {
    esprima.parseScript(validate);
  } catch (error) {
    const { index, lineNumber, description } = error;
    console.log(
      RED,
      `[MINIFY][${name}][ERROR] ${input
        .split("/")
        .pop()} ${description} at line ${lineNumber} position ${index}`
    );
    continue;
  }

  if (variables.version) {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
  }

  fs.mkdirSync(path.dirname(latestFile), { recursive: true });

  const compiledMap = map ? fillTemplate(map, variables) : null;

  if (variables.version) {
    fs.writeFileSync(versionFile, code);
    if (compiledMap) fs.writeFileSync(`${versionFile}.map`, compiledMap);
  }

  fs.writeFileSync(latestFile, code);
  if (compiledMap) fs.writeFileSync(`${latestFile}.map`, compiledMap);

  const bytes = new TextEncoder("utf-8").encode(code).length;

  console.log(
    `[MINIFY][${name}] Minified ${input.split("/").pop()} into ${bytes} bytes`
  );
}

console.log(GREEN, `[MINIFY] Done minifying all files`);
