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
  isAbortError: (err: unknown, signal?: AbortSignal) => {
    if (signal?.aborted) return true;
    if (err == null || typeof err !== 'object') return false;
    const e = err as { name?: string; code?: string | number; message?: string; __CANCEL__?: boolean };
    if (e.__CANCEL__ === true) return true;
    if (e.name === 'CanceledError' || e.name === 'AbortError') return true;
    if (e.code === 'ERR_CANCELED' || e.code === 'ABORT_ERR') return true;
    const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
    return msg.includes('aborted') || msg === 'canceled' || msg === 'cancelled';
  },
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

  it('does not surface AbortError / CanceledError as «No pudimos buscar»', async () => {
    mockSearch.mockImplementation((_q, _lat, _lng, signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        const fail = () => {
          const err = Object.assign(new Error('canceled'), {
            name: 'CanceledError',
            code: 'ERR_CANCELED',
          });
          reject(err);
        };
        if (signal?.aborted) {
          fail();
          return;
        }
        signal?.addEventListener('abort', fail, { once: true });
      });
    });

    const { getByTestId, rerender } = await render(
      <HookProbe query="Be" onResult={() => undefined} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      rerender(<HookProbe query="Bel" onResult={() => undefined} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      rerender(<HookProbe query="Belgr" onResult={() => undefined} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    await waitFor(() => {
      const label = String(getByTestId('probe').props.children);
      expect(label).not.toMatch(/No pudimos buscar/);
    });
  });

  it('ignores stale reject after a newer query already started', async () => {
    let rejectFirst: (e: unknown) => void = () => undefined;
    mockSearch.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    mockSearch.mockResolvedValueOnce([
      { description: 'Belgrano 10', place_id: '1', lat: -31.9, lng: -65.1 },
    ]);

    const { getByTestId, rerender } = await render(
      <HookProbe query="Be" onResult={() => undefined} />,
    );

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await act(async () => {
      rerender(<HookProbe query="Belgrano" onResult={() => undefined} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(getByTestId('probe').props.children).toBe('idle:1:');
    });

    await act(async () => {
      rejectFirst(new Error('stale network fail'));
    });

    expect(getByTestId('probe').props.children).toBe('idle:1:');
    expect(String(getByTestId('probe').props.children)).not.toMatch(/No pudimos buscar/);
  });
});
