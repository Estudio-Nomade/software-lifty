jest.mock('../../hooks/usePlaceAutocomplete', () => ({
  usePlaceAutocomplete: () => ({ suggestions: [], loading: false, error: null }),
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: (props: { name?: string; accessibilityLabel?: string }) =>
      React.createElement(Text, {
        accessibilityLabel: props.accessibilityLabel ?? props.name ?? 'icon',
      }),
  };
});

import { render } from '@testing-library/react-native';
import React from 'react';
import { ExpandedTripSearch } from '../../components/home/ExpandedTripSearch';

const baseProps = {
  pickupAddress: '',
  destAddress: '',
  focusedField: 'dest' as const,
  pickupLoading: false,
  suggestions: [] as { description: string; place_id: string; lat: number; lng: number }[],
  placesLoading: false,
  placesError: null as string | null,
  searchError: null as string | null,
  showUseMyLocation: false,
  onBack: jest.fn(),
  onPickupChange: jest.fn(),
  onDestChange: jest.fn(),
  onPickupFocus: jest.fn(),
  onDestFocus: jest.fn(),
  onClearPickup: jest.fn(),
  onClearDest: jest.fn(),
  onSelectSuggestion: jest.fn(),
  onUseMyLocation: jest.fn(),
  onChipSelect: jest.fn(),
  onConfirm: jest.fn(),
};

describe('ExpandedTripSearch empty gate + address inputs', () => {
  it('does not show false empty while places are loading', async () => {
    const { queryByText } = await render(
      <ExpandedTripSearch {...baseProps} destAddress="Dique" placesLoading />,
    );
    expect(queryByText(/No encontramos calles ni lugares/i)).toBeNull();
  });

  it('shows empty only after a finished search with no hits', async () => {
    const { getByText } = await render(
      <ExpandedTripSearch {...baseProps} destAddress="Dique" placesLoading={false} />,
    );
    expect(getByText(/No encontramos calles ni lugares/i)).toBeTruthy();
  });

  it('origen and destino pin selection to start for long programmatic labels', async () => {
    const long =
      'San Martín 1234, Villa Dolores, Córdoba, Argentina, etiqueta muy larga para scrollear';
    const { getByLabelText } = await render(
      <ExpandedTripSearch
        {...baseProps}
        pickupAddress={long}
        destAddress={long}
        focusedField="pickup"
      />,
    );

    const origen = getByLabelText('Origen');
    const destino = getByLabelText('Destino');
    expect(origen.props.scrollEnabled).toBe(true);
    expect(destino.props.scrollEnabled).toBe(true);
    expect(origen.props.selection).toEqual({ start: 0, end: 0 });
    expect(destino.props.selection).toEqual({ start: 0, end: 0 });
    expect(origen.props.textAlign).toBe('left');
    expect(destino.props.textAlign).toBe('left');
  });
});
