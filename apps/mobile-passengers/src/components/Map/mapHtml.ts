import type { ViewStyle } from 'react-native';

export interface MarkerData {
  id: string;
  coordinate: [number, number];
  title?: string;
  color?: string;
  icon?: 'car' | 'moto' | 'camioneta' | 'person' | 'destination';
  avatarUrl?: string;
}

export interface PassengerMapProps {
  /** [lng, lat] */
  centerCoordinate: [number, number];
  zoom?: number;
  markers?: MarkerData[];
  routeLine?: Array<[number, number]>;
  /** [lng, lat] or null */
  userLocation?: [number, number] | null;
  followUserLocation?: boolean;
  recenterKey?: number;
  style?: ViewStyle;
  onError?: () => void;
}

export const DEFAULT_ZOOM = 15;

export function generateMapHtml(colors: { primary: string; lightGray: string }) {
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
  .marker-dot {
    width: 16px; height: 16px;
    border-radius: 50%;
    border: 2px solid #FFFFFF;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
    cursor: pointer;
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
    color: ${colors.primary};
  }
  .marker-avatar {
    width: 44px; height: 44px;
    background: white;
    border: 2px solid ${colors.primary};
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
  .destination-pin {
    position: relative;
    width: 32px; height: 32px;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    background: #FFFFFF center / cover no-repeat;
    box-shadow: 0 2px 6px rgba(13, 43, 69, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .destination-pin::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top: 10px solid ${colors.primary};
    border-bottom: 0;
  }
  .destination-pin ion-icon {
    font-size: 18px;
    color: ${colors.primary};
  }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var DEFAULT_ZOOM = 15;
  // World overview until a real GPS fix arrives — never a city hardcode.
  var WAITING_CENTER = [0, 0];
  var WAITING_ZOOM = 2;

  function postToHost(msg) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  if (typeof maplibregl === 'undefined') {
    postToHost(JSON.stringify({ type: 'error', message: 'MapLibre GL failed to load from CDN' }));
    throw new Error('MapLibre GL is not available');
  }

  var map;
  try {
    map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: WAITING_CENTER,
      zoom: WAITING_ZOOM,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  } catch (e) {
    postToHost(JSON.stringify({ type: 'error', message: (e && e.message) || 'Failed to initialize the map' }));
    throw e;
  }

  var mapLoaded = false;
  var markers = [];
  var userMarker = null;
  var pendingRoute = null;
  var lastUserLat = null;
  var lastUserLng = null;
  var hasCenteredOnUser = false;
  var isNativeWebView = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);
  var geoWatchId = null;

  var USER_ICONS = {
    car: 'car-outline',
    moto: 'bicycle-outline',
    camioneta: 'car-sport-outline',
    person: 'person-outline',
  };

  function isValidLatLng(lat, lng) {
    return (
      typeof lat === 'number' && typeof lng === 'number' &&
      isFinite(lat) && isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    );
  }

  /** Pin + optional camera. MapLibre wants setLngLat([lng, lat]). */
  function setUserFix(lat, lng, opts) {
    if (!isValidLatLng(lat, lng)) return;
    lastUserLat = lat;
    lastUserLng = lng;

    if (!userMarker) {
      var el = document.createElement('div');
      el.className = 'user-marker';
      el.innerHTML = '<ion-icon name="person-outline"></ion-icon>';
      userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      userMarker.setLngLat([lng, lat]);
    }

    var force = opts && opts.force;
    var fly = opts && opts.fly;
    if (force || !hasCenteredOnUser) {
      if (fly) {
        map.flyTo({ center: [lng, lat], zoom: DEFAULT_ZOOM, duration: 600 });
      } else {
        map.jumpTo({ center: [lng, lat], zoom: DEFAULT_ZOOM });
      }
      hasCenteredOnUser = true;
    }
  }

  function updateMarkers(newMarkers) {
    markers.forEach(function (m) { m.remove(); });
    markers = [];
    newMarkers.forEach(function (mk) {
      var el = document.createElement('div');
      if (mk.icon === 'destination') {
        el.className = 'destination-pin';
        if (mk.avatarUrl) {
          el.style.backgroundImage = "url('" + mk.avatarUrl + "')";
        } else {
          el.innerHTML = '<ion-icon name="person"></ion-icon>';
        }
      } else if (mk.avatarUrl) {
        el.className = 'marker-avatar';
        el.innerHTML = '<img src="' + mk.avatarUrl + '" alt="" />';
      } else if (mk.icon) {
        var iconEmoji = USER_ICONS[mk.icon] || USER_ICONS['car'];
        el.className = 'marker-icon';
        el.innerHTML = '<ion-icon name="' + iconEmoji + '"></ion-icon>';
      } else {
        var color = mk.color || '${colors.primary}';
        el.className = 'marker-dot';
        el.style.background = color;
      }

      var marker = new maplibregl.Marker({
        element: el,
        anchor: mk.icon === 'destination' ? 'bottom' : 'center',
        offset: mk.icon === 'destination' ? [0, -10] : [0, 0],
      }).setLngLat([mk.coordinate[0], mk.coordinate[1]]);

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
        paint: { 'line-color': '${colors.primary}', 'line-width': 4, 'line-opacity': 0.9 },
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

  /**
   * Web (browser iframe): own navigator.geolocation — pin/center do not depend on postMessage.
   * Native WebView: host drives location via postMessage (expo-location).
   */
  function startWebGeolocation() {
    if (isNativeWebView) return;
    if (!navigator.geolocation) return;

    var opts = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };

    function onPos(pos) {
      if (!pos || !pos.coords) return;
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      setUserFix(lat, lng, null);
      postToHost(JSON.stringify({ type: 'browserLocation', lat: lat, lng: lng }));
    }

    try {
      navigator.geolocation.getCurrentPosition(onPos, function () {}, opts);
      geoWatchId = navigator.geolocation.watchPosition(onPos, function () {}, opts);
    } catch (e) {}
  }

  startWebGeolocation();

  map.on('load', function () {
    mapLoaded = true;
    if (pendingRoute) {
      applyRoute(pendingRoute);
      pendingRoute = null;
    }
    if (lastUserLat != null && lastUserLng != null) {
      setUserFix(lastUserLat, lastUserLng, null);
    }
    postToHost(JSON.stringify({ type: 'ready' }));
    // Permission dialog may resolve after load — retry once.
    if (!isNativeWebView) startWebGeolocation();
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

  function parseMsg(data) {
    if (data == null) return null;
    if (typeof data === 'object') return data;
    if (typeof data !== 'string') return null;
    try { return JSON.parse(data); } catch (e) { return null; }
  }

  window.addEventListener('message', function (event) {
    var msg = parseMsg(event.data);
    if (!msg || !msg.type) return;

    switch (msg.type) {
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
      case 'userLocation':
        // Native host path (and web backup from React store).
        if (msg.lat != null && msg.lng != null) {
          setUserFix(Number(msg.lat), Number(msg.lng), null);
        }
        break;
      case 'recenter':
        if (msg.lat != null && msg.lng != null && isValidLatLng(Number(msg.lat), Number(msg.lng))) {
          setUserFix(Number(msg.lat), Number(msg.lng), { force: true, fly: true });
        } else if (lastUserLat != null && lastUserLng != null) {
          setUserFix(lastUserLat, lastUserLng, { force: true, fly: true });
        } else if (!isNativeWebView && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            function (pos) {
              setUserFix(pos.coords.latitude, pos.coords.longitude, { force: true, fly: true });
              postToHost(JSON.stringify({
                type: 'browserLocation',
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }));
            },
            function () {},
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
          );
        }
        break;
    }
  });

  window.addEventListener('error', function (e) {
    postToHost(JSON.stringify({ type: 'error', message: e.message || 'Unknown error' }));
  });
</script>
</body>
</html>`;
}
