// The app lives outside the pnpm workspace (see pnpm-workspace.yaml), so the
// shared constants are compiled straight from packages/shared/src rather
// than installed as a dependency.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const sharedSrc = path.resolve(__dirname, "../../packages/shared/src");
const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), sharedSrc];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@digitel/shared": sharedSrc,
};

module.exports = config;
