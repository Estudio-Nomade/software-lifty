import { renderHook, waitFor } from '@testing-library/react-native';
import { useMapController } from '../../components/Map/useMapController';

const BA: [number, number] = [-58.3816, -34.6037];

type ControllerProps = {
  centerCoordinate: [number, number];
  zoom: number;
  markers: [];
  routeLine?: Array<[number, number]>;
  userLocation: [number, number] | null;
  followUserLocation: boolean;
  isLoaded: boolean;
  postMessage: jest.Mock;
};

function baseProps(
  postMessage: jest.Mock,
  overrides: Partial<ControllerProps> = {},
): ControllerProps {
  return {
    centerCoordinate: BA,
    zoom: 15,
    markers: [],
    userLocation: BA,
    followUserLocation: true,
    isLoaded: true,
    postMessage,
    ...overrides,
  };
}

describe('useMapController — user pin bridge', () => {
  it('posts userLocation when map is loaded with real coords', async () => {
    const postMessage = jest.fn();
    renderHook(() => useMapController(baseProps(postMessage)));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'userLocation',
        lat: BA[1],
        lng: BA[0],
      });
    });
  });

  it('does not post userLocation while map is not loaded', async () => {
    const postMessage = jest.fn();
    renderHook(() => useMapController(baseProps(postMessage, { isLoaded: false })));

    // Effects that depend on isLoaded should no-op; followUser also gated.
    await new Promise((r) => setTimeout(r, 50));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts followUser enabled when map is loaded and follow is on', async () => {
    const postMessage = jest.fn();
    renderHook(() => useMapController(baseProps(postMessage, { followUserLocation: true })));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'followUser',
        enabled: true,
      });
    });
  });

  it('posts followUser disabled when followUserLocation is false', async () => {
    const postMessage = jest.fn();
    renderHook(() => useMapController(baseProps(postMessage, { followUserLocation: false })));

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'followUser',
        enabled: false,
      });
    });
  });

  it('does not post userLocation for null-island [0,0]', async () => {
    const postMessage = jest.fn();
    renderHook(() =>
      useMapController(
        baseProps(postMessage, {
          centerCoordinate: [0, 0],
          userLocation: [0, 0],
        }),
      ),
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({
        type: 'followUser',
        enabled: true,
      });
    });

    const userPosts = postMessage.mock.calls.filter(
      (c) => c[0] && (c[0] as { type?: string }).type === 'userLocation',
    );
    expect(userPosts).toHaveLength(0);
  });
});
