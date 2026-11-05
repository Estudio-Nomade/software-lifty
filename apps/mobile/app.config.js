/**
 * Dynamic Expo config layered on top of app.json.
 *
 * expo-notifications `mode` sets the iOS APNs entitlement (aps-environment). Store /
 * ad-hoc builds (EAS profiles `production` and `preview`) must use production APNs;
 * dev-client builds and local Metro keep `development`. Android is unaffected.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const mode = profile === 'production' || profile === 'preview' ? 'production' : 'development';

  return {
    ...config,
    plugins: (config.plugins ?? []).map((plugin) =>
      Array.isArray(plugin) && plugin[0] === 'expo-notifications'
        ? [plugin[0], { ...plugin[1], mode }]
        : plugin,
    ),
  };
};
