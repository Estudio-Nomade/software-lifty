// eslint-disable-next-line @typescript-eslint/no-require-imports
const createConfig = require('../../../app.config.js') as (ctx: {
  config: { plugins: unknown[] };
}) => { plugins: unknown[] };

const base = {
  plugins: ['expo-font', ['expo-notifications', { mode: 'development' }], 'expo-router'],
};

function notificationsMode(profile: string | undefined): unknown {
  const prev = process.env.EAS_BUILD_PROFILE;
  if (profile === undefined) delete process.env.EAS_BUILD_PROFILE;
  else process.env.EAS_BUILD_PROFILE = profile;
  try {
    const out = createConfig({ config: base });
    const entry = out.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications') as [
      string,
      { mode: string },
    ];
    return entry[1].mode;
  } finally {
    if (prev === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = prev;
  }
}

describe('app.config expo-notifications mode', () => {
  it('uses production APNs for production and preview EAS builds', () => {
    expect(notificationsMode('production')).toBe('production');
    expect(notificationsMode('preview')).toBe('production');
  });

  it('keeps development for dev-client builds and local Metro', () => {
    expect(notificationsMode('development')).toBe('development');
    expect(notificationsMode(undefined)).toBe('development');
  });

  it('does not touch other plugins', () => {
    const out = createConfig({ config: base });
    expect(out.plugins[0]).toBe('expo-font');
    expect(out.plugins[2]).toBe('expo-router');
  });
});
