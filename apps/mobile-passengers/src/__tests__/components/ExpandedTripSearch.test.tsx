import { render } from '@testing-library/react-native';
import React from 'react';
import { ExpandedTripSearch } from '../../components/home/ExpandedTripSearch';

jest.mock('../../components/QuickChips', () => ({
  QuickChips: () => null,
}));

const noop = () => {};

function baseProps(
  overrides: Partial<React.ComponentProps<typeof ExpandedTripSearch>> = {},
): React.ComponentProps<typeof ExpandedTripSearch> {
  return {
    pickupAddress: 'Mi ubicación actual',
    destAddress: '',
    focusedField: 'dest',
    pickupLoading: false,
    suggestions: [],
    placesLoading: false,
    placesError: null,
    searchError: null,
    showUseMyLocation: true,
    gpsSubtitle: null,
    onBack: noop,
    onPickupChange: noop,
    onDestChange: noop,
    onPickupFocus: noop,
    onDestFocus: noop,
    onClearPickup: noop,
    onClearDest: noop,
    onSelectSuggestion: noop,
    onUseMyLocation: noop,
    onChipSelect: noop,
    onConfirm: noop,
    ...overrides,
  };
}

describe('ExpandedTripSearch GPS row', () => {
  it('shows resolved street under "Usar mi ubicación actual" when gpsSubtitle is set', async () => {
    const { getByText, getByLabelText } = await render(
      <ExpandedTripSearch
        {...baseProps({
          pickupAddress: 'San Martín 100, Villa Dolores, Córdoba',
          gpsSubtitle: 'San Martín 100, Villa Dolores, Córdoba',
        })}
      />,
    );

    expect(getByLabelText('Usar mi ubicación actual')).toBeTruthy();
    expect(getByText('San Martín 100, Villa Dolores, Córdoba')).toBeTruthy();
  });

  it('does not show empty-places copy when dest is empty', async () => {
    const { queryByText } = await render(
      <ExpandedTripSearch
        {...baseProps({
          pickupAddress: 'Mi ubicación actual',
          destAddress: '',
          focusedField: 'dest',
          suggestions: [],
        })}
      />,
    );

    expect(queryByText(/No encontramos lugares/i)).toBeNull();
  });
});
