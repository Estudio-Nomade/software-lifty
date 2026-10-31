import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { apiClient } from '../../api/client';
import {
  normalizeAutocompletePayload,
  usePlaceAutocomplete,
  type PlaceAutocompleteResult,
} from '../../hooks/usePlaceAutocomplete';

jest.mock('../../api/client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;

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

describe('normalizeAutocompletePayload', () => {
  it('accepts bare array from BE', () => {
    const list = normalizeAutocompletePayload([
      { description: 'Belgrano 10', place_id: '1', lat: -31.9, lng: -65.1 },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].description).toBe('Belgrano 10');
  });

  it('unwraps nested data / suggestions', () => {
    expect(
      normalizeAutocompletePayload({
        data: [{ description: 'A', place_id: 'a', lat: 1, lng: 2 }],
      }),
    ).toHaveLength(1);
    expect(
      normalizeAutocompletePayload({
        suggestions: [{ description: 'B', place_id: 'b', lat: 3, lng: 4 }],
      }),
    ).toHaveLength(1);
  });

  it('drops rows without lat/lng', () => {
    expect(
      normalizeAutocompletePayload([{ description: 'no coords', place_id: 'x' }]),
    ).toHaveLength(0);
  });
});

describe('usePlaceAutocomplete', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGet.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks loading true as soon as query is ≥2 chars', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { getByTestId } = await render(<HookProbe query="Di" onResult={() => undefined} />);
    expect(getByTestId('probe').props.children).toMatch(/^loading:/);
  });

  it('loads suggestions after debounce', async () => {
    mockGet.mockResolvedValue({
      data: [{ description: 'Dique La Viña', place_id: '1', lat: -31.87, lng: -65.03 }],
    });
    const { getByTestId } = await render(
      <HookProbe query="Dique" onResult={() => undefined} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('probe').props.children).toBe('idle:1:');
    });
    expect(mockGet).toHaveBeenCalledWith(
      '/maps/places/autocomplete',
      expect.objectContaining({
        params: expect.objectContaining({
          input: 'Dique',
          lat: expect.any(Number),
          lng: expect.any(Number),
        }),
      }),
    );
  });

  it('surfaces network failures as error, not silent empty suggestions', async () => {
    mockGet.mockRejectedValue(new Error('network down'));
    const { getByTestId } = await render(
      <HookProbe query="Dique" onResult={() => undefined} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('probe').props.children).toMatch(/^idle:0:No pudimos buscar/);
    });
  });

  it('unwraps nested { data: [...] } response bodies', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [{ description: 'Nested', place_id: 'n', lat: -31.94, lng: -65.19 }],
      },
    });
    const { getByTestId } = await render(
      <HookProbe query="Nest" onResult={() => undefined} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('probe').props.children).toBe('idle:1:');
    });
  });
});
