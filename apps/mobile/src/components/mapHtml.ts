export interface MarkerData {
  id: string;
  coordinate: [number, number];
  title?: string;
  color?: string;
}

export interface HeatmapPoint {
  coordinate: [number, number];
  weight: number;
}

export interface MapViewProps {
  centerCoordinate?: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  alternativeRouteLine?: Array<[number, number]>;
  heatmapPoints?: HeatmapPoint[];
  followUserLocation?: boolean;
  userLocation?: [number, number] | null;
  userIcon?: 'car' | 'moto' | 'camioneta' | 'person' | null;
  style?: import('react-native').ViewStyle;
  onError?: () => void;
}

export const DEFAULT_CENTER: [number, number] = [-65.1833, -31.9333];
export const DEFAULT_ZOOM = 15;

export function generateMapHtml(colors: { turquoise: string; lightGray: string; amber: string }) {
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
  .user-marker {
    width: 44px; height: 44px;
    background: white;
    border: 3px solid ${colors.turquoise};
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    line-height: 1;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
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

  function postToHost(msg) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
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

  var mapLoaded = false;
  var markers = [];
  var userMarker = null;
  var userIconType = null;
  var pendingRoute = null;
  var followRequested = false;
  var hasPerformedInitialCenter = false;

  var USER_ICONS = {
    car: '\uD83D\uDE97',
    moto: '\uD83C\uDFCD\uFE0F',
    camioneta: '\uD83D\uDE99',
    person: '\uD83E\uDDCD',
  };

  function setView(center, zoom) {
    map.jumpTo({ center: center, zoom: zoom });
  }

  function updateMarkers(newMarkers) {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    newMarkers.forEach(function (mk) {
      var color = mk.color || '${colors.turquoise}';
      var el = document.createElement('div');
      el.className = 'marker-dot';
      el.style.background = color;
      el.addEventListener('click', function () {
        postToHost(JSON.stringify({
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
      el.textContent = icon;
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
    postToHost(JSON.stringify({ type: 'ready' }));
  });

  map.on('moveend', function () {
    var c = map.getCenter();
    postToHost(JSON.stringify({
      type: 'moved',
      center: { lng: c.lng, lat: c.lat },
      zoom: map.getZoom(),
    }));
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
