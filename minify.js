const Handlebars = require("handlebars");
const UglifyJS = require("uglify-js");
const fs = require("fs");
const esprima = require("esprima");
const path = require("path");

const GREEN = "\x1b[32m%s\x1b[0m";
const YELLOW = "\x1b[33m%s\x1b[0m";
const RED = "\x1b[31m%s\x1b[0m";

const VERSION = 7;

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
  sri: true,
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
  scriptName: "script",
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
      scriptName: "cdn_hello",
      sri: false,
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
      scriptName: `cdn_latest_${VERSION}`,
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
      version: 2,
      scriptName: "cloudflare_2",
      sri: false,
      baseUrl: "{{cloudFlareCustomDomain}}",
      overwriteOptions: {
        saGlobal: "INSTALL_OPTIONS.sa_global",
        mode: "INSTALL_OPTIONS.hash_mode ? 'hash' : null",
        collectDnt: "INSTALL_OPTIONS.collect_dnt",
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
      scriptName: `custom_app_${VERSION}`,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/e.js`,
    variables: {
      ...DEFAULTS,
      sri: false,
      version: VERSION,
      scriptName: `custom_events_${VERSION}`,
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
      scriptName: `custom_latest_${VERSION}`,
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
      scriptName: `custom_proxy_${VERSION}`,
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
      scriptName: `cdn_light_${VERSION}`,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/light.js`,
    variables: {
      ...LIGHT,
      version: VERSION,
      scriptName: `custom_light_${VERSION}`,
      baseUrl: "{{nginxHost}}",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/embed.js`,
    output: `embed.js`,
    variables: {
      minify: true,
      version: 1,
      sri: false,
      script: "embed.js",
      url: "docs.simpleanalytics.com/embed-graph-on-your-site",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/auto-events.js`,
    output: `auto-events.js`,
    variables: {
      minify: true,
      version: 1,
      sri: false,
      script: "auto-events.js",
      url: "docs.simpleanalytics.com/automated-events",
    },
  },
];

for (const file of files) {
  const { variables, input, output } = file;
  const name = output.toUpperCase();
  const versionFile = `${__dirname}/dist/v${variables.version}/${output}`;
  const cdnVersionFile = versionFile.replace(
    /latest\.js/i,
    `v${variables.version}.js`
  );
  const latestFile = `${__dirname}/dist/latest/${output}`;

  const contents = fs
    .readFileSync(input, "utf8")
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

  const prepend = `/* Simple Analytics - Privacy friendly analytics (docs.simpleanalytics.com/script; ${date}; ${hash}${
    variables.sri ? `; SRI-version` : ""
  }${variables.version ? `; v${variables.version}` : ""}) */\n`;

  const originalFileName = finalFileName.replace(".js", ".source.js");
  const {
    code: codeTemplate,
    map,
    warnings,
  } = variables.minify
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

  if (variables.version && variables.sri) {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
  }

  fs.mkdirSync(path.dirname(latestFile), { recursive: true });

  const compiledMap = map ? fillTemplate(map, variables) : null;

  if (variables.version && variables.sri) {
    const cdnFileName = cdnVersionFile.split("/").pop();
    fs.writeFileSync(
      cdnVersionFile,
      code.replace(
        /sourceMappingURL=latest\.js\.map/gi,
        `sourceMappingURL=${cdnFileName}.map`
      )
    );
    if (compiledMap)
      fs.writeFileSync(
        `${cdnVersionFile}.map`,
        compiledMap.replace(/latest\.source\.js/gi, cdnFileName)
      );
  }

  fs.writeFileSync(latestFile, code.replace(/; SRI-version/i, ""));
  if (compiledMap) fs.writeFileSync(`${latestFile}.map`, compiledMap);

  const bytes = new TextEncoder("utf-8").encode(code).length;

  console.log(
    `[MINIFY][${name}] Minified ${input.split("/").pop()} into ${bytes} bytes`
  );
}

console.log(GREEN, `[MINIFY] Done minifying all files`);
