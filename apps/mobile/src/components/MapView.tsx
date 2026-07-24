import { theme } from '@/theme';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import WebView from 'react-native-webview/lib/WebView';
import type { WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

const WebViewComponent = WebView as any;

interface MarkerData {
  id: string;
  coordinate: [number, number];
  title?: string;
  color?: string;
}

interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

interface MapViewProps {
  centerCoordinate?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  heatmapPoints?: HeatmapPoint[];
  followUserLocation?: boolean;
  style?: ViewStyle;
  onError?: () => void;
}

const DEFAULT_CENTER: [number, number] = [-65.1833, -31.9333];
const DEFAULT_ZOOM = 15;

const MAP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; overflow: hidden; }
  body { background: #F1F4F6; }
  .marker-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 2px solid #FFFFFF;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
    cursor: pointer;
  }
  .pulsing-circle {
    width: 18px; height: 18px;
    background: rgba(0, 194, 179, 0.4);
    border: 2px solid #00C2B3;
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
  var DEFAULT_CENTER = [-65.1833, -31.9333];
  var DEFAULT_ZOOM = 15;

  var map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  var mapLoaded = false;
  var markers = [];
  var userMarker = null;
  var watchId = null;
  var pendingRoute = null;
  var followRequested = false;

  function setView(center, zoom) {
    map.jumpTo({ center: center, zoom: zoom });
  }

  function updateMarkers(newMarkers) {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    newMarkers.forEach(function (mk) {
      var color = mk.color || '#00C2B3';
      var el = document.createElement('div');
      el.className = 'marker-dot';
      el.style.background = color;
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
        paint: { 'line-color': '#00C2B3', 'line-width': 4, 'line-opacity': 0.9 },
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

  function startFollowUser() {
    if (!navigator.geolocation) return;
    if (watchId) return;

    watchId = navigator.geolocation.watchPosition(
      function (pos) {
        var lng = pos.coords.longitude;
        var lat = pos.coords.latitude;

        if (!userMarker) {
          var el = document.createElement('div');
          el.className = 'pulsing-circle';
          userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
        } else {
          userMarker.setLngLat([lng, lat]);
        }
      },
      function () {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  function stopFollowUser() {
    if (watchId) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
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
    if (followRequested) startFollowUser();
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
        setView(msg.center || DEFAULT_CENTER, msg.zoom || DEFAULT_ZOOM);
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
        if (msg.enabled) startFollowUser();
        else stopFollowUser();
        break;
      case 'heatmap':
        updateHeatmap(msg.points || []);
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

export const MapView: React.FC<MapViewProps> = ({
  centerCoordinate = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  markers = [],
  routeLine,
  heatmapPoints,
  followUserLocation = false,
  style,
  onError,
}) => {
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
      JSON.stringify({
        type: 'init',
        center: centerCoordinate,
        zoom: zoom,
      }),
    );
  }, [centerCoordinate, zoom, isLoaded]);

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
    if (!isLoaded || !webViewRef.current || !routeLine || routeLine.length < 2) return;

    webViewRef.current.postMessage(
      JSON.stringify({
        type: 'fitRoute',
        coordinates: routeLine,
      }),
    );
  }, [isLoaded]);

  useEffect(() => {
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
        type: 'heatmap',
        points: heatmapPoints || [],
      }),
    );
  }, [heatmapPoints, isLoaded]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        switch (data.type) {
          case 'moved':
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
      <WebViewComponent
        key={retryKey.current}
        ref={webViewRef}
        source={{ html: MAP_HTML }}
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
