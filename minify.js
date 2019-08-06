const UglifyJS = require('uglify-js')
const fs = require('fs')

const green = '\x1b[32m%s\x1b[0m'
const yellow = '\x1b[33m%s\x1b[0m'
// const red = '\x1b[31m%s\x1b[0m'

const files = {
  default: {
    original: `${__dirname}/src/default.js`,
    minified: `${__dirname}/dist/default.js`,
    prepend: ['/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/script) */', ''],
    append: []
  },
  embed: {
    original: `${__dirname}/src/embed.js`,
    minified: `${__dirname}/dist/embed.js`,
    prepend: ['/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/embed-graph-on-your-site) */', ''],
    append: []
  },
  external: {
    original: `${__dirname}/src/external.js`,
    minified: `${__dirname}/dist/external.js`,
    prepend: ['/* Simple Analytics - Privacy friend analytics (docs.simpleanalytics.com/script) */', ''],
    append: []
  },
  iframe: {
    original: `${__dirname}/src/iframe.js`,
    minified: `${__dirname}/dist/iframe.html`,
    prepend: ['<!DOCTYPE html>', '<title>SA</title>', '<script>'],
    append: ['</script>']
  }
}

const options = {
  warnings: true,
  ie8: true,
  toplevel: true,
  mangle: { reserved: ['sa'] },
  nameCache: null
}

for (const file in files) {
  if (files.hasOwnProperty(file)) {
    const { original, minified, prepend, append } = files[file]
    const name = file.toUpperCase()

    const contents = fs.readFileSync(original, 'utf8')
    const { code, warnings } = UglifyJS.minify(contents, options)
    for (const warning of (warnings || [])) console.warn(yellow, `[MINIFY][${name}] ${warning}`)
    const nginxCode = code.replace('simpleanalytics.example.com', '<!--# echo var="http_host" default="" -->')
    const lines = [...prepend, nginxCode, ...append]
    fs.writeFileSync(minified, lines.join('\n'))
    const bytes = new TextEncoder('utf-8').encode(lines.join('\n')).length
    console.log(green, `[MINIFY][${name}] Minified ${original.split('/').pop()} into ${bytes} bytes`)
  }
}
