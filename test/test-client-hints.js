const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async (browser) => {
  const pageViewRequests = getRequests(global.REQUESTS, {
    method: "GET",
    pathname: "/simple.gif",
    body: { type: "pageview" },
  });

  const request = pageViewRequests.pop();

  expect(
    request,
    "There are not enough page views requests found"
  ).to.have.property("body");

  expect(
    request.body,
    "All required keys should be present"
  ).to.include.all.keys(["brands", "mobile", "os_name", "os_version"]);

  expect(
    request.body.browser,
    "Client hints browser should be same browser"
  ).to.equal(browser.browser);
};
