const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.server.unstable_serverRoot = __dirname;

// Resolve the CJS build of packages that ship an ESM build using `import.meta`
// (e.g. zustand). The web bundle is served as a classic (non-module) script, so
// `import.meta` throws a SyntaxError at runtime. Preferring the `react-native`
// condition makes Metro pick the CJS entry, which has no `import.meta`.
config.resolver.unstable_conditionNames = ['react-native'];

const originalRewriteRequestUrl = config.server.rewriteRequestUrl;
config.server.rewriteRequestUrl = (url) => {
  const rewritten = originalRewriteRequestUrl(url);
  return rewritten.replace(/node_modules\/\.bun\/[^/]+\/node_modules\//g, 'node_modules/');
};

module.exports = config;
