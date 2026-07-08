import { readFileSync, writeFileSync } from "fs";

// Bumps manifest.json to the version in package.json and records the
// version -> minAppVersion mapping in versions.json. Run via `npm version`.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
	console.error("npm_package_version is not set — run this via `npm version`.");
	process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`Set version ${targetVersion} (minAppVersion ${minAppVersion}).`);
