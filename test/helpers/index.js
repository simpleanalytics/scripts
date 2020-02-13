const crypto = require("crypto");
const { networkInterfaces: getNetworkInterfaces } = require("os");

const { SERVER_PORT } = require("../constants");

module.exports.getIPv4 = () =>
  new Promise((resolve, reject) => {
    const networkInterfaces = getNetworkInterfaces();
    const publicIPv4s = Object.keys(networkInterfaces)
      .reduce((interfaces, name) => {
        interfaces.push(...networkInterfaces[name]);
        return interfaces;
      }, [])
      .filter(({ family, internal }) => {
        return family === "IPv4" && !internal;
      });
    if (publicIPv4s.length) return resolve(publicIPv4s[0].address);
    return reject(Error("No local IPv4 address found"));
  });

module.exports.getLocalhost = async ({ localhost = true } = {}) =>
  `${localhost ? "localhost" : await this.getIPv4()}:${SERVER_PORT}`;

module.exports.generateRandomString = (length = 30) =>
  crypto.randomBytes(Math.ceil(length / 2)).toString("hex");
