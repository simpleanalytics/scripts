const Handlebars = require("handlebars");
const UglifyJS = require("uglify-js");
const fs = require("fs");
const esprima = require("esprima");
const path = require("path");

const GREEN = "\x1b[32m%s\x1b[0m";
const YELLOW = "\x1b[33m%s\x1b[0m";
const RED = "\x1b[31m%s\x1b[0m";

const VERSION = 12;

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
  if (!template)
    throw new Error("Parsing of the JavaScript failed, please use ES5 only.");
  return template
    .replace(
      /\{\{\s?nginxHost\s?\}\}/gi,
      '<!--# echo var="http_host" default="" -->',
    )
    .replace(
      /\{\{\s?nginxProxyHost\s?\}\}/gi,
      '<!--# echo var="proxy_hostname" default="" --><!--# echo var="proxy_path" default="/simple" -->',
    )
    .replace(
      /\\?"\{\{\s?overwriteOptions\s?\}\}\\?"/gi,
      overwriteOptions
        ? JSON.stringify(overwriteOptions).replace(/:"([^"]+)"/gi, ":$1")
        : "{}",
    )
    .replace(
      /"\{\{\s?cloudFlareCustomDomain\s?\}\}"/gi,
      'INSTALL_OPTIONS.custom_domain || "queue.simpleanalyticscdn.com"',
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
  namespace: "sa",
  url: "docs.simpleanalytics.com/script",
  scriptName: "script",
  allowparams: true,
  pathoverwriter: true,
  metadata: true,
  nonuniquehostnames: true,
  ignoremetrics: true,
  dev: false,
  skipnonwindow: false,
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
  allowparams: false,
  pathoverwriter: false,
  metadata: false,
  nonuniquehostnames: false,
  ignoremetrics: false,
};

const templates = [
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `hello.js`,
    variables: {
      ...DEFAULTS,
      scriptName: `cdn_hello_${VERSION}`,
      sri: false,
      baseUrl: "simpleanalyticscdn.com",
      apiUrlPrefix: "queue.",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `latest.dev.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      minify: false,
      sri: false,
      dev: true,
      scriptName: `cdn_latest_dev_${VERSION}`,
      baseUrl: "simpleanalyticscdn.com",
      apiUrlPrefix: "queue.",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/default.js`,
    output: `custom/latest.dev.js`,
    variables: {
      ...DEFAULTS,
      version: VERSION,
      minify: false,
      sri: false,
      dev: true,
      scriptName: `custom_latest_dev_${VERSION}`,
      baseUrl: "{{nginxHost}}",
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
      skipnonwindow: true,
      minify: false,
      version: VERSION,
      scriptName: `cloudflare_${VERSION}`,
      sri: false,
      baseUrl: "{{cloudFlareCustomDomain}}",
      overwriteOptions: {
        hostname: "INSTALL_OPTIONS.hostname",
        collectDnt:
          "typeof INSTALL_OPTIONS.collect_dnt === 'boolean' ? INSTALL_OPTIONS.collect_dnt : null",
        mode: "INSTALL_OPTIONS.hash_mode ? 'hash' : 'normal'",
        strictUtm:
          "INSTALL_OPTIONS.advanced_settings_toggle && INSTALL_OPTIONS.strict_utm",
        allowParams:
          "INSTALL_OPTIONS.advanced_settings_toggle && INSTALL_OPTIONS.allow_url_parameters",
        nonUniqueHostnames:
          "INSTALL_OPTIONS.advanced_settings_toggle && INSTALL_OPTIONS.non_unique_hostnames",
        ignorePages:
          "INSTALL_OPTIONS.advanced_settings_toggle && INSTALL_OPTIONS.ignore_pages",
        namespace:
          "INSTALL_OPTIONS.overwrite_namespace && INSTALL_OPTIONS.namespace",
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
      baseUrl: "simpleanalyticscdn.com",
      apiUrlPrefix: "queue.",
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
    input: `${__dirname}/src/auto-events.js`,
    output: "custom/auto-events.js",
    variables: {
      version: VERSION,
      sri: true,
      minify: true,
      url: "docs.simpleanalytics.com/automated-events",
    },
  },
  {
    type: "js",
    input: `${__dirname}/src/auto-events.js`,
    output: `auto-events.js`,
    variables: {
      version: VERSION,
      sri: true,
      minify: true,
      url: "docs.simpleanalytics.com/automated-events",
    },
  },
];

// Add both SRI files and non SRI files if variables.sri = true
const files = templates.reduce((list, template) => {
  if (template.variables.sri) {
    list.push(
      { ...template, variables: { ...template.variables, sri: true } },
      { ...template, variables: { ...template.variables, sri: false } },
    );
  } else {
    list.push(template);
  }
  return list;
}, []);

for (const file of files) {
  const { variables, input, output } = file;
  const name = output.toUpperCase();
  let versionFile = `${__dirname}/dist/v${variables.version}/${output}`;
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
        },
      )
    : {
        code: prepend + rawCode,
      };

  if (!codeTemplate) console.warn(RED, `[${name}] codeTemplate is undefined`);
  if (!template) console.warn(RED, `[${name}] template is undefined`);

  for (const warning of warnings || [])
    console.warn(YELLOW, `[${name}] ${warning}`);

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
      `[${name}][ERROR] ${input
        .split("/")
        .pop()} ${description} at line ${lineNumber} position ${index}`,
    );
    continue;
  }

  if (variables.version && variables.sri) {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(latestFile), { recursive: true });
  }

  const compiledMap = map ? fillTemplate(map, variables) : null;
  const isCustom = /^custom\//.test(output);

  if (variables.version && variables.sri) {
    let cdnFileName = versionFile.split("/").pop();

    // Skip custom vX.js SRI file, we use app.js for that.
    if (cdnFileName === "latest.js" && isCustom) continue;

    // Rewrite latest.js to app.js in vX folder
    if (cdnFileName === "latest.js" && !isCustom) {
      cdnFileName = "app.js";
      versionFile = versionFile.replace("latest.js", "app.js");
    }

    let write = code.replace(
      /sourceMappingURL=latest\.js\.map/gi,
      `sourceMappingURL=${cdnFileName}.map`,
    );

    fs.writeFileSync(versionFile, write);

    if (compiledMap) {
      let writeCompiled = compiledMap.replace(
        /latest\.source\.js/gi,
        cdnFileName,
      );

      fs.writeFileSync(`${versionFile}.map`, writeCompiled);
    }
  } else {
    let write = code.replace(/; SRI-version/i, "");

    fs.writeFileSync(latestFile, write);

    if (compiledMap) {
      let writeCompiled = compiledMap;

      fs.writeFileSync(`${latestFile}.map`, writeCompiled);
    }
  }

  const bytes = new TextEncoder("utf-8").encode(code).length;
  const bytesZeroFilled = (bytes + "").padStart(5, " ");

  // Add white space in console
  const sourceName = input.split("/").pop();
  const fill1 = " ".repeat(Math.max(0, 16 - name.length));
  const fill2 = " ".repeat(Math.max(0, 14 - sourceName.length));

  console.log(
    ` ${name.toLowerCase()} ${fill1}Compiled ${sourceName} ${fill2} ${bytesZeroFilled} bytes ${
      variables.sri ? " (SRI)" : ""
    }`,
  );
}

console.log(GREEN, ` Done compiling all files`);
