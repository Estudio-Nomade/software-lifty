const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Prefer CJS entry of packages that ship ESM with `import.meta` (e.g. zustand).
// Web serves a classic script; without this, runtime throws SyntaxError.
config.resolver.unstable_conditionNames = ['react-native'];

// Bun monorepo: keep workspace root as Metro server root (Expo default) so
// virtual entry rewrites to apps/mobile/... But ensure node_modules resolution
// finds packages under apps/mobile first (Bun nests them under node_modules/.bun).
config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot, projectRoot]),
);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

const originalRewriteRequestUrl = config.server.rewriteRequestUrl;
config.server.rewriteRequestUrl = (url) => {
  const rewritten = originalRewriteRequestUrl ? originalRewriteRequestUrl(url) : url;
  // Bun stores real packages under node_modules/.bun/... — strip that segment so
  // Metro can resolve the same path Expo Go / the virtual entry request.
  return rewritten.replace(/node_modules\/\.bun\/[^/]+\/node_modules\//g, 'node_modules/');
};

module.exports = config;
