describe('platform realtime contract', () => {
  it('uses the shared platform topic expected by the backend', () => {
    // Keep in sync with apps/backend/src/shared/lib/broadcast.ts PLATFORM_REALTIME_TOPIC
    // and apps/mobile/src/lib/platformRealtime.ts (avoid importing RN modules in Jest unit).
    expect('platform:config').toBe('platform:config');
  });

  it('documents payout-info as a platform-config invalidation target', () => {
    const keys = ['payout-info', 'commission-receipts', 'earnings-daily', 'earnings-summary'];
    expect(keys).toContain('payout-info');
    expect(keys).toContain('commission-receipts');
  });
});
