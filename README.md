<a href="https://simpleanalytics.com/?ref=github.com/simpleanalytics/scripts">
  <img src="https://assets.simpleanalytics.com/images/logos/logo-github-readme.png" alt="Simple Analytics logo" align="right" height="62" />
</a>

# Scripts

<p><a href="https://github.com/simpleanalytics/scripts/actions">
  <img src="https://github.com/simpleanalytics/scripts/workflows/Browserstack/badge.svg">
</a></p>

Simple Analytics is a privacy-first analytics tool with a strong mission: never invade the privacy of your visitors. We just show you the essentials: page views, referrers, top pages, and devices. We don't use cookies. We don't collect any personal data. So no cookie banners or GDPR to worry about. When a service is free you are the product. We won't ever sell your data. As a result, we require a subscription.

## Open Source

As our public scripts are very important in our mission to privacy we decided to make the source code available. We use the MIT license which is short and to the point. It lets you do almost anything you want with this project, like making and distributing closed-source versions. See [LICENSE](LICENSE) for more info.

## Contribute

If you want to contribute, you probabaly want to contribute to our [`/src/default.js`](src/default.js) or [`/src/auto-events.js`](src/auto-events.js) files. These files compile into a few versions of our script by [`compile.js`](compile.js). They end up on [our CDN](https://scripts.simpleanalyticscdn.com/latest.js), custom domains, and [the Cloudflare app](https://www.cloudflare.com/apps/simpleanalytics).

In `default.js` you see some weird syntax in the comments. For example, `/** if ignorepages **/` _\[some code\]_ `/** endif **/`. These comments are converted to handlebars like this: `{{#if ignorepages }}` _\[some code\]_ `{{/if}}`. In this case, [`ignorepages` is a variable](https://github.com/simpleanalytics/scripts/blob/3874b44ce5f1b0b8a7d50fb512fdcf5285a0138f/minify.js#L66) used in `minify.js` that takes care of what functionality to show in what script. Our main script is the `latest.js` script which includes all features. We also have a `light.js` script that obviously doesn't.

If you contribute, make sure to use `npm run build`, copy the script to a website, and check if it works correctly.

## Run this locally

Just run `npm run watch` and every file will be validated and compiled on save. We minify our scripts with [UglifyJS](http://lisperator.net/uglifyjs/), a well-known JavaScript minifier.

The most important file of the repository is [`/src/default.js`](src/default.js)

## Unit tests

Run `npm run test:unit` to execute a small set of tests without BrowserStack.

## Device testing is sponsored by BrowserStack

We run our public script with more than [50 browsers on many different (real) devices](https://github.com/simpleanalytics/scripts/blob/main/test/helpers/get-browsers.js). We support Internet Explorer 9 (not sure who is still using that) and up. Including many mobile browsers and less common devices. We get amazing sponsorship from [BrowserStack](https://www.browserstack.com/). Thanks, BrowserStack!

<img src="https://mijnimpact-adriaan-io.s3.amazonaws.com/1581763646555-browserstack-logo.png" width="300px" alt="BrowserStack Logo" />

## Contact

Feel free to drop any issues you have with our open-source scripts. If you want to contact us you can also use our contact form or email listed here: [simpleanalytics.com/contact](https://simpleanalytics.com/contact).
