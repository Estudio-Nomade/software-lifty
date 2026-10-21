import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { searchPlaces } from '../../api/passenger';
import {
  usePlaceAutocomplete,
  type PlaceAutocompleteResult,
} from '../../hooks/usePlaceAutocomplete';
import { useLocationStore } from '../../store/locationStore';

jest.mock('../../api/passenger', () => ({
  searchPlaces: jest.fn(),
}));

const mockSearch = searchPlaces as jest.Mock;

function HookProbe({
  query,
  onResult,
}: {
  query: string;
  onResult: (r: PlaceAutocompleteResult) => void;
}) {
  const r = usePlaceAutocomplete(query);
  React.useEffect(() => {
    onResult(r);
  }, [r, onResult]);
  const label = `${r.loading ? 'loading' : 'idle'}:${r.suggestions.length}:${r.error ?? ''}`;
  return <Text testID="probe">{label}</Text>;
}

describe('usePlaceAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSearch.mockReset();
    useLocationStore.setState({ current: null, permissionGranted: false, locationError: null });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks loading true as soon as query is ≥2 chars (no empty flash during debounce)', async () => {
    mockSearch.mockResolvedValue([]);
    const { getByTestId } = await render(<HookProbe query="Di" onResult={() => undefined} />);

    expect(getByTestId('probe').props.children).toMatch(/^loading:/);
  });

  it('keeps loading through debounce until searchPlaces resolves', async () => {
    let resolveFn: (v: unknown) => void = () => undefined;
    mockSearch.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );

    const { getByTestId } = await render(
      <HookProbe query="Dique" onResult={() => undefined} />,
    );
    expect(getByTestId('probe').props.children).toMatch(/^loading:/);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(getByTestId('probe').props.children).toMatch(/^loading:/);

    await act(async () => {
      resolveFn([{ description: 'Dique La Viña', place_id: '1', lat: -31.87, lng: -65.03 }]);
    });
    await waitFor(() => {
      expect(getByTestId('probe').props.children).toBe('idle:1:');
    });
  });

  it('surfaces network failures as error, not silent empty suggestions', async () => {
    mockSearch.mockRejectedValue(new Error('network down'));
    const { getByTestId } = await render(
      <HookProbe query="Dique" onResult={() => undefined} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await waitFor(() => {
      expect(getByTestId('probe').props.children).toMatch(/^idle:0:No pudimos buscar/);
    });
  });
});
