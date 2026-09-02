/**
 * Pure gate rules (mirrors usePayoutMethodGate needsPayoutMethod).
 * Hook itself needs QueryClient; keep unit surface here.
 */
function needsPayoutMethod(args: {
  isApproved: boolean;
  isLoading: boolean;
  isError: boolean;
  methodsLength: number;
}): boolean {
  if (!args.isApproved) return false;
  if (args.isLoading || args.isError) return false;
  return args.methodsLength === 0;
}

describe('payout method gate rules', () => {
  it('does not gate non-approved drivers', () => {
    expect(
      needsPayoutMethod({
        isApproved: false,
        isLoading: false,
        isError: false,
        methodsLength: 0,
      }),
    ).toBe(false);
  });

  it('gates approved drivers with zero methods', () => {
    expect(
      needsPayoutMethod({
        isApproved: true,
        isLoading: false,
        isError: false,
        methodsLength: 0,
      }),
    ).toBe(true);
  });

  it('does not gate when at least one method exists', () => {
    expect(
      needsPayoutMethod({
        isApproved: true,
        isLoading: false,
        isError: false,
        methodsLength: 1,
      }),
    ).toBe(false);
  });

  it('does not flash gate while loading or on error', () => {
    expect(
      needsPayoutMethod({
        isApproved: true,
        isLoading: true,
        isError: false,
        methodsLength: 0,
      }),
    ).toBe(false);
    expect(
      needsPayoutMethod({
        isApproved: true,
        isLoading: false,
        isError: true,
        methodsLength: 0,
      }),
    ).toBe(false);
  });
});
