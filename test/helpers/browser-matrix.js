const GRACE_YEARS = 2;
const USAGE_THRESHOLD = 0.1;
const MINIMUM_SESSIONS = 10;

const DESKTOP_BROWSERS = ["chrome", "edge", "firefox", "safari", "opera", "ie"];
const REQUIRED_BROWSERS = ["chrome", "edge", "firefox", "safari"];
const REQUIRED_OSES = ["Windows", "OS X", "android", "ios"];
const MOBILE_BROWSERS = ["android", "iphone", "ipad"];
const UNSTABLE = /beta|preview|nightly|planned|future/i;

const parseVersion = (value) => {
  const match = `${value || ""}`.match(/\d+(?:\.\d+)*/);
  return match ? match[0].split(".").map(Number) : [];
};

const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index++) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }

  return 0;
};

const majorVersion = (value) => parseVersion(value)[0];

const normalizeName = (value) =>
  `${value || ""}`
    .toLowerCase()
    .replace(/\b(apple|google|samsung|iphone)\b/g, "")
    .replace(/\b5g\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

const asDate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addYears = (date, years) => {
  const result = new Date(date.getTime());
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
};

const isLifecycleEligible = (
  lifecycle,
  { now = new Date(), usage = 0 } = {}
) => {
  if (!lifecycle) return false;
  if (lifecycle.status && !["current", "retired"].includes(lifecycle.status))
    return false;

  const releaseDate = asDate(lifecycle.releaseDate);
  if (releaseDate && releaseDate > now) return false;

  const eolDate = asDate(lifecycle.eolFrom);
  if (lifecycle.isMaintained === true || (eolDate && eolDate >= now))
    return true;
  if (eolDate && addYears(eolDate, GRACE_YEARS) >= now) return true;

  return usage > USAGE_THRESHOLD;
};

const usageVersionMatches = (usageVersion, browserVersion) => {
  const target = parseFloat(parseVersion(browserVersion).slice(0, 2).join("."));
  if (!Number.isFinite(target)) return false;

  const [startRaw, endRaw] = `${usageVersion}`.split("-");
  const start = parseFloat(startRaw);
  const end = parseFloat(endRaw || startRaw);
  return Number.isFinite(start) && target >= start && target <= end;
};

const getUsage = (agents, browser, browserVersion) => {
  const agent = agents?.[browser];
  if (!agent?.usage_global) return 0;

  return Object.entries(agent.usage_global).reduce(
    (total, [usageVersion, usage]) =>
      usageVersionMatches(usageVersion, browserVersion)
        ? total + Number(usage || 0)
        : total,
    0
  );
};

const findReleaseByMajor = (releases, value) => {
  const major = majorVersion(value);
  return releases.find(({ name }) => majorVersion(name) === major);
};

const findMdnLifecycle = (releases, browserVersion) => {
  const entries = Object.entries(releases || {}).map(([name, release]) => ({
    name,
    ...release,
  }));
  const exact = `${browserVersion}`.replace(/\.0$/, "");
  const matching =
    entries.find(({ name }) => name === exact) ||
    entries.find(({ name }) => majorVersion(name) === majorVersion(exact));

  if (!matching) return null;
  if (!["current", "retired"].includes(matching.status)) return matching;

  const nextStable = entries
    .filter(
      (release) =>
        ["current", "retired"].includes(release.status) &&
        asDate(release.release_date) > asDate(matching.release_date)
    )
    .sort((left, right) => compareVersions(left.name, right.name))[0];

  return {
    name: matching.name,
    releaseDate: matching.release_date,
    eolFrom:
      matching.status === "retired"
        ? nextStable?.release_date || matching.release_date
        : null,
    isMaintained: matching.status === "current",
    status: matching.status,
  };
};

const findBrowserLifecycle = (sources, browser, browserVersion) => {
  if (sources.eol[browser])
    return findReleaseByMajor(sources.eol[browser], browserVersion);
  if (sources.mdn[browser])
    return findMdnLifecycle(sources.mdn[browser], browserVersion);
  return null;
};

const aggregateReleases = (releases) => {
  if (!releases.length) return null;

  const dates = releases.map(({ eolFrom }) => asDate(eolFrom)).filter(Boolean);
  const releaseDates = releases
    .map(({ releaseDate }) => asDate(releaseDate))
    .filter(Boolean);

  return {
    name: releases[0].name,
    releaseDate: releaseDates.length
      ? new Date(Math.min(...releaseDates)).toISOString().slice(0, 10)
      : null,
    eolFrom: dates.length
      ? new Date(Math.max(...dates)).toISOString().slice(0, 10)
      : null,
    isMaintained: releases.some(({ isMaintained }) => isMaintained === true),
  };
};

const findWindowsLifecycle = (releases, osVersion) => {
  const normalized = `${osVersion}`.toLowerCase();

  if (["10", "11"].includes(normalized)) {
    const mainstream = releases.filter(({ name }) => {
      return (
        name.startsWith(`${normalized}-`) &&
        !/-e(?:-|$)|-iot(?:-|$)|-lts(?:-|$)/.test(name)
      );
    });
    return aggregateReleases(mainstream);
  }

  if (normalized === "xp")
    return releases.find(({ label }) => /^xp\b/i.test(label));
  if (normalized === "7")
    return releases.find(({ label }) => /^7\b/i.test(label));
  return releases.find(({ name }) => name === normalized);
};

const findOsLifecycle = (sources, { os, os_version: osVersion }) => {
  if (os === "Windows")
    return findWindowsLifecycle(sources.eol.windows, osVersion);
  if (os === "OS X") {
    const normalized = normalizeName(osVersion);
    return sources.eol.macos.find(
      ({ name, codename }) =>
        normalizeName(name) === normalized ||
        normalizeName(codename) === normalized
    );
  }
  if (os === "android")
    return findReleaseByMajor(sources.eol.android, osVersion);
  if (os === "ios") return findReleaseByMajor(sources.eol.ios, osVersion);
  return null;
};

const findIpadRelease = (releases, device) => {
  const normalized = `${device}`.toLowerCase();
  const family = normalized.includes("pro")
    ? "pro"
    : normalized.includes("mini")
      ? "mini"
      : normalized.includes("air")
        ? "air"
        : "ipad";
  const matchesFamily = ({ label }) => {
    const value = label.toLowerCase();
    if (family === "ipad")
      return value.startsWith("ipad (") && !/pro|mini|air/.test(value);
    return value.includes(`ipad ${family}`);
  };

  const ordinal = normalized.match(/(\d+)(?:st|nd|rd|th)/)?.[1];
  if (ordinal) {
    const ordinalMatch = releases.find(
      (release) =>
        matchesFamily(release) &&
        release.label.toLowerCase().includes(`(${ordinal}`)
    );
    if (ordinalMatch) return ordinalMatch;
  }

  const year = normalized.match(/\b(20\d{2})\b/)?.[1];
  if (!year) return null;

  const yearMatches = releases.filter(
    (release) =>
      matchesFamily(release) && `${release.releaseDate}`.startsWith(year)
  );
  const size = normalized.match(/\b(12\.9|13|11)\b/)?.[1];
  const sizeMatch = yearMatches.find(({ label }) =>
    size ? label.includes(`${size}-inch`) : false
  );
  return sizeMatch || yearMatches[0] || null;
};

const findDeviceLifecycle = (sources, { browser, device }) => {
  if (!device) return null;

  if (browser === "iphone") {
    const normalized = normalizeName(device);
    return sources.eol.iphone.find(
      ({ label }) => normalizeName(label) === normalized
    );
  }

  if (browser === "ipad") return findIpadRelease(sources.eol.ipad, device);

  if (browser === "android" && /^google pixel/i.test(device)) {
    const normalized = normalizeName(device);
    return sources.eol.pixel.find(
      ({ label }) => normalizeName(label) === normalized
    );
  }

  if (browser === "android" && /^samsung/i.test(device)) {
    const normalized = normalizeName(device);
    return sources.eol["samsung-mobile"].find(
      ({ label }) => normalizeName(label) === normalized
    );
  }

  return null;
};

const isStableCapability = (capability) =>
  ![capability.browser_version, capability.os_version, capability.device].some(
    (value) => UNSTABLE.test(`${value || ""}`)
  );

const capabilityKey = ({ browser, browser_version, os, os_version, device }) =>
  [browser, browser_version, os, os_version, device || ""].join("|");

const makeUnique = (capabilities) => {
  const seen = new Set();
  return capabilities.filter((capability) => {
    const key = capabilityKey(capability);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const lifecycleOrder = (lifecycle, fallback) =>
  parseFloat(lifecycle?.name) ||
  parseFloat(parseVersion(fallback).join(".")) ||
  0;

const enrichDesktop = (all, sources, now) =>
  all
    .filter(
      (capability) =>
        DESKTOP_BROWSERS.includes(capability.browser) &&
        isStableCapability(capability)
    )
    .map((capability) => {
      const browserLifecycle = findBrowserLifecycle(
        sources,
        capability.browser,
        capability.browser_version
      );
      const osLifecycle = findOsLifecycle(sources, capability);
      const usage = getUsage(
        sources.usage,
        capability.browser,
        capability.browser_version
      );
      return {
        capability,
        browserLifecycle,
        osLifecycle,
        usage,
        browserOrder: majorVersion(capability.browser_version),
        osOrder: lifecycleOrder(osLifecycle, capability.os_version),
        eligible:
          isLifecycleEligible(browserLifecycle, { now, usage }) &&
          isLifecycleEligible(osLifecycle, { now }),
      };
    })
    .filter(({ eligible }) => eligible);

const enrichMobile = (all, sources, now) =>
  all
    .filter(
      (capability) =>
        MOBILE_BROWSERS.includes(capability.browser) &&
        isStableCapability(capability)
    )
    .map((capability) => {
      const osLifecycle = findOsLifecycle(sources, capability);
      const deviceLifecycle = findDeviceLifecycle(sources, capability);
      return {
        capability,
        osLifecycle,
        deviceLifecycle,
        osOrder: lifecycleOrder(osLifecycle, capability.os_version),
        deviceOrder: asDate(deviceLifecycle?.releaseDate)?.getTime() || 0,
        eligible:
          isLifecycleEligible(osLifecycle, { now }) &&
          isLifecycleEligible(deviceLifecycle, { now }),
      };
    })
    .filter(({ eligible }) => eligible);

const boundaries = (items, getValue) => {
  const sorted = [...items].sort(
    (left, right) => getValue(left) - getValue(right)
  );
  if (!sorted.length) return [];
  return sorted[0] === sorted[sorted.length - 1]
    ? [sorted[0]]
    : [sorted[0], sorted[sorted.length - 1]];
};

const selectDesktopBoundaries = (eligible) => {
  const selected = [];
  const eligibleFamilies = [];

  for (const browser of DESKTOP_BROWSERS) {
    const family = eligible.filter(
      ({ capability }) => capability.browser === browser
    );
    if (!family.length) continue;
    eligibleFamilies.push(browser);

    const versions = new Map();
    for (const candidate of family) {
      const existing = versions.get(candidate.browserOrder);
      if (!existing || candidate.osOrder > existing.osOrder)
        versions.set(candidate.browserOrder, candidate);
    }

    selected.push(
      ...boundaries([...versions.values()], ({ browserOrder }) => browserOrder)
    );
  }

  return { selected, eligibleFamilies };
};

const addDesktopOsBoundaries = (selected, eligible) => {
  const result = [...selected];

  for (const os of ["Windows", "OS X"]) {
    const byVersion = new Map();
    for (const candidate of eligible.filter(
      ({ capability }) => capability.os === os
    )) {
      const key = candidate.capability.os_version;
      const existing = byVersion.get(key);
      if (!existing || candidate.browserOrder > existing.browserOrder)
        byVersion.set(key, candidate);
    }

    for (const boundary of boundaries(
      [...byVersion.values()],
      ({ osOrder }) => osOrder
    )) {
      const alreadyCovered = result.some(
        ({ capability }) =>
          capability.os === os &&
          capability.os_version === boundary.capability.os_version
      );
      if (!alreadyCovered) result.push(boundary);
    }
  }

  return result;
};

const selectMobileBoundaries = (eligible) => {
  const selected = [];

  for (const browser of MOBILE_BROWSERS) {
    const byOsVersion = new Map();
    for (const candidate of eligible.filter(
      ({ capability }) => capability.browser === browser
    )) {
      const key = majorVersion(candidate.capability.os_version);
      const existing = byOsVersion.get(key);
      if (!existing || candidate.deviceOrder > existing.deviceOrder)
        byOsVersion.set(key, candidate);
    }
    selected.push(
      ...boundaries([...byOsVersion.values()], ({ osOrder }) => osOrder)
    );
  }

  return selected;
};

const validateMatrix = (
  matrix,
  { eligibleFamilies = [], minimum = MINIMUM_SESSIONS } = {}
) => {
  if (matrix.length < minimum)
    throw new Error(
      `BrowserStack matrix has ${matrix.length} sessions; expected at least ${minimum}`
    );

  for (const browser of REQUIRED_BROWSERS) {
    if (!matrix.some((capability) => capability.browser === browser))
      throw new Error(
        `BrowserStack matrix is missing required browser: ${browser}`
      );
  }

  for (const os of REQUIRED_OSES) {
    if (!matrix.some((capability) => capability.os === os))
      throw new Error(`BrowserStack matrix is missing required OS: ${os}`);
  }

  for (const browser of eligibleFamilies) {
    if (!matrix.some((capability) => capability.browser === browser))
      throw new Error(
        `BrowserStack matrix dropped eligible browser: ${browser}`
      );
  }

  return matrix;
};

const selectBrowsers = (all, sources, { now = new Date(), minimum } = {}) => {
  const desktop = enrichDesktop(all, sources, now);
  const mobile = enrichMobile(all, sources, now);
  const { selected, eligibleFamilies } = selectDesktopBoundaries(desktop);
  const withOsBoundaries = addDesktopOsBoundaries(selected, desktop);
  const mobileBoundaries = selectMobileBoundaries(mobile);
  const matrix = makeUnique(
    [...withOsBoundaries, ...mobileBoundaries].map(
      ({ capability }) => capability
    )
  );

  return validateMatrix(matrix, { eligibleFamilies, minimum });
};

module.exports = {
  GRACE_YEARS,
  MINIMUM_SESSIONS,
  REQUIRED_BROWSERS,
  REQUIRED_OSES,
  USAGE_THRESHOLD,
  compareVersions,
  findDeviceLifecycle,
  findMdnLifecycle,
  findOsLifecycle,
  getUsage,
  isLifecycleEligible,
  selectBrowsers,
  validateMatrix,
};
