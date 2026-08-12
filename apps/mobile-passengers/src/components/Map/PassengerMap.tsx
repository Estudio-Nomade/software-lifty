import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { theme } from '../../theme';

interface PassengerMapProps {
  centerCoordinate: [number, number];
  zoom?: number;
  userLocation?: [number, number] | null;
  followUserLocation?: boolean;
  recenterKey?: number;
  style?: ViewStyle;
  onError?: () => void;
}

const DEFAULT_ZOOM = 15;

function generateMapHtml(colors: { primary: string; lightGray: string }) {
  const r = Number.parseInt(colors.primary.slice(1, 3), 16);
  const g = Number.parseInt(colors.primary.slice(3, 5), 16);
  const b = Number.parseInt(colors.primary.slice(5, 7), 16);
  const primaryRgba = `rgba(${r}, ${g}, ${b}, 0.4)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/ionicons@7.4.0/dist/ionicons/ionicons.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; overflow: hidden; }
  body { background: ${colors.lightGray}; }
  .user-marker {
    width: 44px; height: 44px;
    background: white;
    border: 3px solid ${colors.primary};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    overflow: hidden;
  }
  .user-marker ion-icon {
    font-size: 28px;
    color: ${colors.primary};
  }
  .pulsing-circle {
    width: 18px; height: 18px;
    background: ${primaryRgba};
    border: 2px solid ${colors.primary};
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0% { transform: scale(0.5); opacity: 0.8; }
    100% { transform: scale(2.5); opacity: 0; }
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var DEFAULT_CENTER = [0, 0];
  var DEFAULT_ZOOM = 15;

  function postToHost(msg) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    }
  }

  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  var userMarker = null;
  var followRequested = false;
  var hasPerformedInitialCenter = false;

  function setView(center, zoom) {
    map.jumpTo({ center: center, zoom: zoom });
  }

  function updateUserLocation(lat, lng) {
    if (lat == null || lng == null) {
      if (userMarker) {
        userMarker.remove();
        userMarker = null;
      }
      return;
    }

    if (!userMarker) {
      var el = document.createElement('div');
      el.className = 'user-marker';
      el.innerHTML = '<ion-icon name="person-outline"></ion-icon>';
      userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      userMarker.setLngLat([lng, lat]);
    }
  }

  map.on('load', function () {
    postToHost(JSON.stringify({ type: 'ready' }));
  });

  map.on('error', function (e) {
    postToHost(JSON.stringify({
      type: 'error',
      message: (e && e.error && e.error.message) || 'Map error',
    }));
  });

  window.addEventListener('message', function (event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'init':
        setView(msg.center, msg.zoom || DEFAULT_ZOOM);
        break;
      case 'followUser':
        followRequested = !!msg.enabled;
        if (followRequested) {
          hasPerformedInitialCenter = false;
        }
        break;
      case 'userLocation':
        if (followRequested && msg.lat != null && msg.lng != null) {
          updateUserLocation(msg.lat, msg.lng);
          if (!hasPerformedInitialCenter) {
            setView([msg.lng, msg.lat], map.getZoom());
            hasPerformedInitialCenter = true;
          }
        }
        break;
      case 'recenter':
        if (msg.lat != null && msg.lng != null) {
          map.flyTo({ center: [msg.lng, msg.lat], zoom: 15, duration: 600 });
        }
        break;
    }
  });

  window.addEventListener('error', function (e) {
    postToHost(JSON.stringify({
      type: 'error',
      message: e.message || 'Unknown error',
    }));
  });
</script>
</body>
</html>`;
}

export const PassengerMap: React.FC<PassengerMapProps> = ({
  centerCoordinate,
  zoom = DEFAULT_ZOOM,
  userLocation,
  followUserLocation = true,
  recenterKey,
  style,
  onError,
}) => {
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        primary: theme.colors.primary,
        lightGray: theme.colors.lightGray,
      }),
    [],
  );

  const source = useMemo(() => ({ html: mapHtml }), [mapHtml]);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const webViewRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryKey = useRef(0);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
    retryKey.current += 1;
  }, []);

  const handleWebViewError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;
    webViewRef.current.postMessage(
      JSON.stringify({ type: 'init', center: centerCoordinate, zoom }),
    );
  }, [isLoaded, centerCoordinate, zoom]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;
    webViewRef.current.postMessage(
      JSON.stringify({ type: 'followUser', enabled: followUserLocation }),
    );
  }, [followUserLocation, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'userLocation',
        lat: userLocation?.[1] ?? null,
        lng: userLocation?.[0] ?? null,
      }),
    );
  }, [userLocation, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current || recenterKey == null) return;
    const loc = userLocationRef.current;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'recenter',
        lat: loc?.[1] ?? null,
        lng: loc?.[0] ?? null,
      }),
    );
  }, [recenterKey, isLoaded]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'error') {
          setHasError(true);
          onError?.();
        }
      } catch {}
    },
    [onError],
  );

  if (hasError) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorText}>No se pudo cargar el mapa</Text>
        <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        key={retryKey.current}
        ref={webViewRef}
        source={source}
        style={styles.webview}
        onLoadEnd={() => setIsLoaded(true)}
        onError={handleWebViewError}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        geolocationEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
  loadingOverlay: {
    ...(StyleSheet.absoluteFillObject as object),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    gap: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
  },
  retryButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
});
