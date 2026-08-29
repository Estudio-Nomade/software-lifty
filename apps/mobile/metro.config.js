const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server.unstable_serverRoot = __dirname;

// Prefer CJS entry of packages that ship ESM with `import.meta` (e.g. zustand).
// Web serves a classic script; without this, runtime throws SyntaxError.
config.resolver.unstable_conditionNames = ['react-native'];

const originalRewriteRequestUrl = config.server.rewriteRequestUrl;
config.server.rewriteRequestUrl = (url) => {
  const rewritten = originalRewriteRequestUrl(url);
  return rewritten.replace(/node_modules\/\.bun\/[^/]+\/node_modules\//g, 'node_modules/');
};

module.exports = config;
