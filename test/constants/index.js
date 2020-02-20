module.exports.SERVER_PORT = 3000;
module.exports.DEBUG = process.env.DEBUG === "true";
module.exports.CI = process.env.CI === "true";
module.exports.LOCATION = process.env.LOCATION || "unkown location";
