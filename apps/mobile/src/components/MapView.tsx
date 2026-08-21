import { theme } from '@/theme';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';
import { Text } from './ui/Text';

interface MarkerData {
  id: string;
  coordinate: [number, number];
  title?: string;
  color?: string;
  icon?: 'car' | 'moto' | 'camioneta' | 'person';
  avatarUrl?: string;
}

interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

interface MapViewProps {
  centerCoordinate: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  alternativeRouteLine?: Array<[number, number]>;
  heatmapPoints?: HeatmapPoint[];
  followUserLocation?: boolean;
  userLocation?: [number, number] | null;
  userIcon?: 'car' | 'moto' | 'camioneta' | 'person' | null;
  style?: ViewStyle;
  onError?: () => void;
  onMoveEnd?: (center: { lat: number; lng: number }) => void;
  recenterKey?: number;
  onFollowingChange?: (following: boolean) => void;
}

const DEFAULT_ZOOM = 15;

function generateMapHtml(colors: { turquoise: string; lightGray: string; amber: string }) {
  const r = Number.parseInt(colors.turquoise.slice(1, 3), 16);
  const g = Number.parseInt(colors.turquoise.slice(3, 5), 16);
  const b = Number.parseInt(colors.turquoise.slice(5, 7), 16);
  const turquoiseRgba = `rgba(${r}, ${g}, ${b}, 0.4)`;

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
  .marker-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 2px solid #FFFFFF;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }
  .pulsing-circle {
    width: 18px; height: 18px;
    background: ${turquoiseRgba};
    border: 2px solid ${colors.turquoise};
    border-radius: 50%;
    animation: pulse 2s infinite;
  }
  .marker-icon {
    width: 36px; height: 36px;
    background: white;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    cursor: pointer;
    overflow: hidden;
  }
  .marker-icon ion-icon {
    font-size: 24px;
    color: ${colors.turquoise};
  }
  .marker-avatar {
    width: 44px; height: 44px;
    background: white;
    border: 2px solid ${colors.turquoise};
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    overflow: hidden;
  }
  .marker-avatar img {
    width: 100%; height: 100%;
    object-fit: cover;
  }
  .user-marker {
    width: 44px; height: 44px;
    background: white;
    border: 3px solid ${colors.turquoise};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    overflow: hidden;
  }
  .user-marker ion-icon {
    font-size: 28px;
    color: ${colors.turquoise};
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

  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  var mapLoaded = false;
  var markers = [];
  var userMarker = null;
  var userIconType = null;
  var pendingRoute = null;
  var followRequested = false;
  var hasPerformedInitialCenter = false;

  var USER_ICONS = {
    car: 'car-outline',
    moto: 'bicycle-outline',
    camioneta: 'car-sport-outline',
    person: 'person-outline',
  };

  function setView(center, zoom) {
    map.jumpTo({ center: center, zoom: zoom });
  }

  function updateMarkers(newMarkers) {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    newMarkers.forEach(function (mk) {
      var el = document.createElement('div');
      if (mk.avatarUrl) {
        el.className = 'marker-avatar';
        el.innerHTML = '<img src="' + mk.avatarUrl + '" alt="" />';
      } else if (mk.icon) {
        var iconEmoji = USER_ICONS[mk.icon] || USER_ICONS['car'];
        el.className = 'marker-icon';
        el.innerHTML = '<ion-icon name="' + iconEmoji + '"></ion-icon>';
      } else {
        var color = mk.color || '${colors.turquoise}';
        el.className = 'marker-dot';
        el.style.background = color;
      }
      el.addEventListener('click', function () {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'markerClick',
          id: mk.id,
        }));
      });

      var marker = new maplibregl.Marker({ element: el })
        .setLngLat([mk.coordinate[0], mk.coordinate[1]]);

      if (mk.title) {
        marker.setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(mk.title));
      }

      marker.addTo(map);
      markers.push(marker);
    });
  }

  var ROUTE_SOURCE_ID = 'route-line';
  var ROUTE_LAYER_ID = 'route-line-layer';

  function applyRoute(coordinates) {
    var geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coordinates || [] },
    };

    var existing = map.getSource(ROUTE_SOURCE_ID);
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '${colors.turquoise}', 'line-width': 4, 'line-opacity': 0.9 },
      });
    }
  }

  function updateRoute(coordinates) {
    if (!coordinates || coordinates.length < 2) {
      if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
      if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
      return;
    }
    if (!mapLoaded) {
      pendingRoute = coordinates;
      return;
    }
    applyRoute(coordinates);
  }

  var ALT_ROUTE_SOURCE_ID = 'route-line-alt';
  var ALT_ROUTE_LAYER_ID = 'route-line-layer-alt';

  function applyAlternativeRoute(coordinates) {
    var geojson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coordinates || [] },
    };

    var existing = map.getSource(ALT_ROUTE_SOURCE_ID);
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(ALT_ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: ALT_ROUTE_LAYER_ID,
        type: 'line',
        source: ALT_ROUTE_SOURCE_ID,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '${colors.amber}', 'line-width': 3, 'line-opacity': 0.6, 'line-dasharray': [2, 2] },
      }, ROUTE_LAYER_ID);
    }
  }

  function clearAlternativeRoute() {
    if (map.getLayer(ALT_ROUTE_LAYER_ID)) map.removeLayer(ALT_ROUTE_LAYER_ID);
    if (map.getSource(ALT_ROUTE_SOURCE_ID)) map.removeSource(ALT_ROUTE_SOURCE_ID);
  }

  function updateUserLocation(lat, lng, iconType) {
    if (lat == null || lng == null) {
      if (userMarker) {
        userMarker.remove();
        userMarker = null;
      }
      return;
    }

    var icon = USER_ICONS[iconType] || USER_ICONS['car'];

    if (!userMarker || userIconType !== iconType) {
      if (userMarker) userMarker.remove();

      var el = document.createElement('div');
      el.className = 'user-marker';
      el.innerHTML = '<ion-icon name="' + icon + '"></ion-icon>';
      userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      userIconType = iconType;
    } else {
      userMarker.setLngLat([lng, lat]);
    }
  }

  function clearUserLocation() {
    if (userMarker) {
      userMarker.remove();
      userMarker = null;
    }
  }

  var HEATMAP_SOURCE_ID = 'heatmap-source';
  var HEATMAP_LAYER_ID = 'heatmap-layer';

  function updateHeatmap(points) {
    if (!points || points.length === 0) {
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
      return;
    }

    var geojson = {
      type: 'FeatureCollection',
      features: points.map(function (p) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: p.coordinate },
          properties: { weight: p.weight },
        };
      }),
    };

    var existing = map.getSource(HEATMAP_SOURCE_ID);
    if (existing) {
      existing.setData(geojson);
    } else {
      map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });
      map.addLayer({
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': 0.6,
          'heatmap-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 8,
            12, 15,
            15, 30,
            18, 60,
          ],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(33,102,172,0)',
            0.2,  'rgb(103,169,207)',
            0.4,  'rgb(209,229,240)',
            0.6,  'rgb(253,219,199)',
            0.8,  'rgb(239,138,98)',
            1.0,  'rgb(178,24,43)',
          ],
          'heatmap-opacity': 0.7,
        },
      });
    }
  }

  map.on('load', function () {
    mapLoaded = true;
    if (pendingRoute) {
      applyRoute(pendingRoute);
      pendingRoute = null;
    }
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  });

  map.on('moveend', function () {
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'moved',
      center: { lng: c.lng, lat: c.lat },
      zoom: map.getZoom(),
    }));
  });

  map.on('error', function (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
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
      case 'markers':
        updateMarkers(msg.markers || []);
        break;
      case 'route':
        updateRoute(msg.coordinates || []);
        break;
      case 'fitRoute':
        if (msg.coordinates && msg.coordinates.length >= 2) {
          var b = msg.coordinates.reduce(function (bb, c) { return bb.extend(c); },
            new maplibregl.LngLatBounds(msg.coordinates[0], msg.coordinates[0]));
          map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600 });
        }
        break;
      case 'followUser':
        followRequested = !!msg.enabled;
        if (followRequested) {
          hasPerformedInitialCenter = false;
        } else {
          clearUserLocation();
        }
        break;
      case 'userLocation':
        if (followRequested && msg.lat != null && msg.lng != null) {
          updateUserLocation(msg.lat, msg.lng, msg.icon || null);
          if (!hasPerformedInitialCenter) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'followCentered' }));
            setView([msg.lng, msg.lat], map.getZoom());
            hasPerformedInitialCenter = true;
          }
        } else if (!followRequested) {
          clearUserLocation();
        }
        break;
      case 'heatmap':
        updateHeatmap(msg.points || []);
        break;
      case 'alternativeRoute':
        if (msg.coordinates && msg.coordinates.length >= 2) {
          applyAlternativeRoute(msg.coordinates);
        } else {
          clearAlternativeRoute();
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
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'error',
      message: e.message || 'Unknown error',
    }));
  });
</script>
</body>
</html>`;
}

export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  alternativeRouteLine,
  heatmapPoints,
  followUserLocation = false,
  userLocation,
  userIcon,
  style,
  onError,
  onMoveEnd,
  recenterKey,
  onFollowingChange,
}) => {
  const mapHtml = useMemo(
    () =>
      generateMapHtml({
        turquoise: theme.colors.turquoise,
        lightGray: theme.colors.lightGray,
        amber: theme.colors.amber,
      }),
    [],
  );

  const source = useMemo(() => ({ html: mapHtml }), [mapHtml]);

  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  const initCenterRef = useRef(centerCoordinate);
  initCenterRef.current = centerCoordinate;

  const webViewRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const retryKey = useRef(0);
  const [userManuallyMoved, setUserManuallyMoved] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(followUserLocation);
  const programmaticMoveRef = useRef(false);
  const userManuallyMovedRef = useRef(false);
  userManuallyMovedRef.current = userManuallyMoved;
  const onFollowingChangeRef = useRef(onFollowingChange);
  onFollowingChangeRef.current = onFollowingChange;

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

    programmaticMoveRef.current = true;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'init',
        center: initCenterRef.current,
        zoom: zoom,
      }),
    );
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'markers',
        markers: markers,
      }),
    );
  }, [markers, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'route',
        coordinates: routeLine || [],
      }),
    );
  }, [routeLine, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'alternativeRoute',
        coordinates: alternativeRouteLine || [],
      }),
    );
  }, [alternativeRouteLine, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current || !routeLine || routeLine.length < 2) return;
    if (userManuallyMovedRef.current) return;

    setIsFollowingUser(false);
    programmaticMoveRef.current = true;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'fitRoute',
        coordinates: routeLine,
      }),
    );
  }, [isLoaded, routeLine]);

  useEffect(() => {
    setIsFollowingUser(followUserLocation);
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'followUser',
        enabled: followUserLocation,
      }),
    );
  }, [followUserLocation, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'userLocation',
        lat: userLocation?.[1] ?? null,
        lng: userLocation?.[0] ?? null,
        icon: userIcon || null,
      }),
    );
  }, [userLocation, userIcon, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'heatmap',
        points: heatmapPoints || [],
      }),
    );
  }, [heatmapPoints, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !webViewRef.current || recenterKey == null) return;
    const loc = userLocationRef.current;
    setIsFollowingUser(true);
    setUserManuallyMoved(false);
    programmaticMoveRef.current = true;
    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'recenter',
        lat: loc?.[1] ?? null,
        lng: loc?.[0] ?? null,
      }),
    );
  }, [recenterKey, isLoaded]);

  useEffect(() => {
    onFollowingChangeRef.current?.(isFollowingUser);
  }, [isFollowingUser]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'moved') {
          console.warn('[MapView] moved received', {
            center: data.center,
            hasOnMoveEnd: !!onMoveEnd,
          });
        }
        switch (data.type) {
          case 'moved':
            if (programmaticMoveRef.current) {
              programmaticMoveRef.current = false;
              setUserManuallyMoved(false);
            } else {
              setUserManuallyMoved(true);
              setIsFollowingUser(false);
            }
            if (data.center && onMoveEnd) {
              onMoveEnd(data.center);
            }
            break;
          case 'followCentered':
            setIsFollowingUser(true);
            setUserManuallyMoved(false);
            programmaticMoveRef.current = true;
            break;
          case 'markerClick':
            break;
          case 'ready':
            break;
          case 'error':
            setHasError(true);
            onError?.();
            break;
        }
      } catch {}
    },
    [onError, onMoveEnd],
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
            <ActivityIndicator size="large" color={theme.colors.turquoise} />
          </View>
        )}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
      />
      {!isLoaded && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.turquoise} />
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
    ...(StyleSheet.absoluteFill as object),
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
    borderRadius: theme.radius.buttonRadius,
    backgroundColor: theme.colors.turquoise,
  },
  retryText: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.white,
  },
});
