const { expect } = require("chai");
const { getRequests } = require("./helpers");

module.exports = async ({ browser, supportsSendBeacon }) => {
  expect(
    global.REQUESTS,
    "There should be requests recorded"
  ).to.have.lengthOf.at.least(3);

  const postRequests = getRequests(global.REQUESTS, {
    pathname: "/v2/post"
  });

  // console.log(JSON.stringify(global.REQUESTS, null, 2));

  const pageViewsInOneRequest = supportsSendBeacon ? 2 : 1;

  expect(
    postRequests,
    "There are no /v2/post requests found"
  ).to.have.lengthOf.at.least(supportsSendBeacon ? 1 : 2);

  postRequests.map((postRequest, index) => {
    expect(
      postRequest,
      "There is no /v2/post request with body found"
    ).to.have.property("body");

    expect(
      postRequest.body,
      "All required keys should be present"
    ).to.include.all.keys([
      "version",
      "hostname",
      "https",
      "width",
      "pageviews",
      "time"
    ]);

    expect(
      postRequest.body.pageviews,
      `There should be ${pageViewsInOneRequest} page views`
    ).to.have.lengthOf(pageViewsInOneRequest);

    expect(postRequest.body.version, "Version should be a number").to.be.a(
      "number"
    );

    expect(postRequest.body.https, "HTTPS should be a boolean").to.be.a(
      "boolean"
    );

    expect(postRequest.body.time, "Time should be a number").to.be.a("number");

    if (supportsSendBeacon) {
      expect(
        postRequest.body.pageviews[0],
        "The first visit should be unique"
      ).to.have.property("unique", true);

      expect(
        postRequest.body.pageviews[1],
        "The second visit should not be unique"
      ).to.have.property("unique", false);

      expect(
        postRequest.body.pageviews[1].duration,
        "Duration should be 2 seconds"
      ).to.be.within(
        postRequest.body.pageviews[1].duration - 1,
        postRequest.body.pageviews[1].duration + 1
      );

      expect(
        postRequest.body.time - postRequest.body.pageviews[1].added,
        "Time between page view and request should be ~2 seconds"
      ).to.be.within(
        postRequest.body.pageviews[1].duration - 1,
        postRequest.body.pageviews[1].duration + 1
      );
    } else {
      expect(
        postRequest.body.pageviews[0],
        index === 0
          ? "The first visit should be unique"
          : "The second visit should not be unique"
      ).to.have.property("unique", index === 0 ? true : false);
    }
  });
};
