import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions
} from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, AnimatedRegion, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

const { width } = Dimensions.get("window");
const DEFAULT_LATITUDE_DELTA = 0.009;
const DEFAULT_LONGITUDE_DELTA = 0.009;

// Coordenadas por defecto (Centro de México) si no hay GPS inicial
const INITIAL_COORDS = {
  latitude: 20.5888,
  longitude: -100.3899,
  latitudeDelta: DEFAULT_LATITUDE_DELTA,
  longitudeDelta: DEFAULT_LONGITUDE_DELTA
};

/**
 * Componente DeliveryMapTracker
 *
 * Integra expo-location y react-native-maps para:
 * 1. Solicitar permisos de ubicación en primer plano de forma segura.
 * 2. Suscribirse a cambios en tiempo real con watchPositionAsync.
 * 3. Animar fluidamente el marcador del repartidor con AnimatedRegion.
 * 4. Centrar automáticamente la cámara en las coordenadas actuales.
 * 5. Visualizar paradas y destinos de entrega asignados a la ruta.
 */
export default function DeliveryMapTracker({
  stops = [],
  onLocationChange = null,
  showStops = true,
  height = 280,
  style = null,
  autoCenterDefault = true
}) {
  const mapRef = useRef(null);
  const locationSubscription = useRef(null);

  const [hasPermission, setHasPermission] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [heading, setHeading] = useState(0);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isAutoCenter, setIsAutoCenter] = useState(autoCenterDefault);
  const [errorMessage, setErrorMessage] = useState(null);

  // Región animada para el marcador del repartidor
  const animatedCoordinate = useRef(
    new AnimatedRegion({
      latitude: INITIAL_COORDS.latitude,
      longitude: INITIAL_COORDS.longitude,
      latitudeDelta: DEFAULT_LATITUDE_DELTA,
      longitudeDelta: DEFAULT_LONGITUDE_DELTA
    })
  ).current;

  /**
   * Centra la cámara del mapa en las coordenadas especificadas
   */
  const centerMapOnCoords = useCallback((coords, duration = 800) => {
    if (!mapRef.current || !coords) return;
    const region = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: DEFAULT_LATITUDE_DELTA,
      longitudeDelta: DEFAULT_LONGITUDE_DELTA
    };

    if (Platform.OS === "android") {
      mapRef.current.animateToRegion(region, duration);
    } else {
      mapRef.current.animateCamera(
        {
          center: {
            latitude: coords.latitude,
            longitude: coords.longitude
          },
          zoom: 16
        },
        { duration }
      );
    }
  }, []);

  /**
   * Anima fluidamente el marcador hacia las nuevas coordenadas
   */
  const animateMarker = useCallback(
    (newCoords) => {
      if (Platform.OS === "android") {
        if (animatedCoordinate.timing) {
          animatedCoordinate
            .timing({
              latitude: newCoords.latitude,
              longitude: newCoords.longitude,
              duration: 1000
            })
            .start();
        } else {
          animatedCoordinate.setValue({
            latitude: newCoords.latitude,
            longitude: newCoords.longitude
          });
        }
      } else {
        animatedCoordinate
          .timing({
            latitude: newCoords.latitude,
            longitude: newCoords.longitude,
            duration: 1000
          })
          .start();
      }
    },
    [animatedCoordinate]
  );

  /**
   * Solicita permisos de ubicación en primer plano y suscribe watchPositionAsync
   */
  const startLocationTracking = useCallback(async () => {
    try {
      setErrorMessage(null);

      // 1. Solicitar permisos de primer plano de manera segura
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setHasPermission(false);
        setErrorMessage("Permiso de ubicación denegado. Actívalo en ajustes para rastrear tu ruta.");
        setIsTracking(false);
        return;
      }

      setHasPermission(true);

      // 2. Obtener ubicación inicial inmediata
      const initialPos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });

      if (initialPos?.coords) {
        const { latitude, longitude, heading: initialHeading, speed } = initialPos.coords;
        const initialCoords = { latitude, longitude };

        setCurrentLocation(initialCoords);
        if (initialHeading !== null && initialHeading !== undefined) setHeading(initialHeading);
        if (speed && speed > 0) setSpeedKmh(Math.round(speed * 3.6));

        animatedCoordinate.setValue({
          latitude,
          longitude
        });

        centerMapOnCoords(initialCoords, 500);

        if (onLocationChange) {
          onLocationChange(initialPos.coords);
        }
      }

      // 3. Limpiar suscripción previa si existiese
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // 4. Suscribirse a cambios en tiempo real con watchPositionAsync
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation || Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5
        },
        (loc) => {
          if (!loc?.coords) return;
          const { latitude, longitude, heading: newHeading, speed: newSpeed } = loc.coords;
          const newCoords = { latitude, longitude };

          setCurrentLocation(newCoords);
          if (newHeading !== null && newHeading !== undefined && newHeading >= 0) {
            setHeading(newHeading);
          }
          if (newSpeed !== null && newSpeed !== undefined && newSpeed >= 0) {
            setSpeedKmh(Math.round(newSpeed * 3.6));
          }

          // Animar marcador de forma fluida
          animateMarker(newCoords);

          // Centrar automáticamente si está activo el seguimiento de cámara
          if (isAutoCenter) {
            centerMapOnCoords(newCoords, 600);
          }

          // Notificar listener externo (ej. para telemetría al backend)
          if (onLocationChange) {
            onLocationChange(loc.coords);
          }
        }
      );

      setIsTracking(true);
    } catch (err) {
      console.warn("Error iniciando tracking de GPS:", err.message);
      setErrorMessage("No se pudo iniciar el servicio de ubicación GPS");
      setIsTracking(false);
    }
  }, [animateMarker, centerMapOnCoords, isAutoCenter, onLocationChange, animatedCoordinate]);

  // Iniciar tracking al montar el componente
  useEffect(() => {
    startLocationTracking();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [startLocationTracking]);

  // Manejador del botón "Centrar en mi ubicación"
  const handleRecenter = () => {
    setIsAutoCenter(true);
    if (currentLocation) {
      centerMapOnCoords(currentLocation, 500);
    } else {
      startLocationTracking();
    }
  };

  // Filtrar paradas válidas con coordenadas para renderizar en el mapa
  const validStops = showStops
    ? stops
        .map((s, idx) => {
          const lat = Number(s.latitude || s.lat || s.delivery_lat);
          const lng = Number(s.longitude || s.lng || s.delivery_lng);
          if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
            return { ...s, parsedLat: lat, parsedLng: lng, stopIndex: idx + 1 };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  return (
    <View style={[styles.container, { height }, style]}>
      {hasPermission === false ? (
        <View style={styles.permissionBox}>
          <Ionicons name="location-outline" size={40} color={colors.danger || "#ef4444"} />
          <Text style={styles.permissionTitle}>Permiso de Ubicación Necesario</Text>
          <Text style={styles.permissionDesc}>
            {errorMessage || "MealOps necesita acceso a tu ubicación para trazar y guiar tu ruta de reparto."}
          </Text>
          <TouchableOpacity style={styles.permissionBtn} onPress={startLocationTracking} activeOpacity={0.8}>
            <Ionicons name="refresh" size={16} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.permissionBtnText}>Conceder Permisos</Text>
          </TouchableOpacity>
        </View>
      ) : !currentLocation ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary || "#ea580c"} />
          <Text style={styles.loadingText}>Conectando con señal GPS en tiempo real...</Text>
        </View>
      ) : (
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_DEFAULT}
            style={styles.map}
            initialRegion={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: DEFAULT_LATITUDE_DELTA,
              longitudeDelta: DEFAULT_LONGITUDE_DELTA
            }}
            showsUserLocation={false} // Usamos marcador animado personalizado
            showsCompass={true}
            showsTraffic={false}
            showsMyLocationButton={false}
            onPanDrag={() => setIsAutoCenter(false)}
          >
            {/* Marcador Animado del Repartidor */}
            <Marker.Animated
              coordinate={animatedCoordinate}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
              rotation={heading}
              title="Tu Ubicación (Repartidor)"
              description={`${speedKmh} km/h · En ruta`}
            >
              <View style={styles.driverMarkerContainer}>
                <View style={styles.driverMarkerPulse} />
                <View style={styles.driverMarkerCircle}>
                  <Ionicons name="bicycle" size={18} color="#ffffff" />
                </View>
                {heading > 0 && (
                  <View
                    style={[
                      styles.driverHeadingPointer,
                      { transform: [{ rotate: `${heading}deg` }] }
                    ]}
                  />
                )}
              </View>
            </Marker.Animated>

            {/* Marcadores de Paradas de Entrega */}
            {validStops.map((stop) => {
              const isDelivered = stop.status === "delivered";
              const isPending = !isDelivered;

              return (
                <Marker
                  key={`stop-${stop.id || stop.stop_order || stop.stopIndex}`}
                  coordinate={{
                    latitude: stop.parsedLat,
                    longitude: stop.parsedLng
                  }}
                  title={`Parada #${stop.stop_order || stop.stopIndex} · F${String(stop.folio || stop.order_id || "").padStart(3, "0")}`}
                  description={stop.address || stop.customer_name || "Punto de entrega"}
                  pinColor={isDelivered ? "#16a34a" : colors.primary || "#ea580c"}
                >
                  <View style={[styles.stopMarkerBadge, isDelivered && styles.stopMarkerDelivered]}>
                    <Text style={styles.stopMarkerText}>{stop.stop_order || stop.stopIndex}</Text>
                  </View>
                </Marker>
              );
            })}

            {/* Línea de Trayectoria hacia paradas si existen */}
            {validStops.length > 0 && currentLocation && (
              <Polyline
                coordinates={[
                  currentLocation,
                  ...validStops.map((s) => ({
                    latitude: s.parsedLat,
                    longitude: s.parsedLng
                  }))
                ]}
                strokeColor={colors.primary || "#ea580c"}
                strokeWidth={3}
                lineDashPattern={[6, 4]}
              />
            )}
          </MapView>

          {/* Badge Flotante Superior: Estado del GPS y Velocidad */}
          <View style={styles.topStatusBadge}>
            <View style={[styles.gpsIndicatorDot, isTracking && styles.gpsIndicatorActive]} />
            <Text style={styles.topStatusText}>
              {isTracking ? "GPS EN VIVO" : "BUSCANDO GPS"}
            </Text>
            {speedKmh > 0 && (
              <View style={styles.speedPill}>
                <Text style={styles.speedPillText}>{speedKmh} km/h</Text>
              </View>
            )}
          </View>

          {/* Botón Flotante para Recentrar Cámara */}
          <TouchableOpacity
            style={[styles.recenterButton, isAutoCenter && styles.recenterButtonActive]}
            onPress={handleRecenter}
            activeOpacity={0.85}
          >
            <Ionicons
              name={isAutoCenter ? "locate" : "locate-outline"}
              size={22}
              color={isAutoCenter ? colors.primary || "#ea580c" : "#475569"}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3
  },
  mapWrapper: {
    flex: 1,
    position: "relative"
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  loadingBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textAlign: "center"
  },
  permissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#ffffff"
  },
  permissionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
    marginTop: 10,
    marginBottom: 6,
    textAlign: "center"
  },
  permissionDesc: {
    fontSize: 12.5,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 18
  },
  permissionBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary || "#ea580c",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12
  },
  permissionBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800"
  },
  driverMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44
  },
  driverMarkerPulse: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(234, 88, 12, 0.25)"
  },
  driverMarkerCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary || "#ea580c",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  driverHeadingPointer: {
    position: "absolute",
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.primary || "#ea580c"
  },
  stopMarkerBadge: {
    backgroundColor: colors.primary || "#ea580c",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  },
  stopMarkerDelivered: {
    backgroundColor: "#16a34a"
  },
  stopMarkerText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  topStatusBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    gap: 6
  },
  gpsIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#eab308"
  },
  gpsIndicatorActive: {
    backgroundColor: "#22c55e"
  },
  topStatusText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4
  },
  speedPill: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8
  },
  speedPillText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800"
  },
  recenterButton: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4
  },
  recenterButtonActive: {
    borderColor: colors.primary || "#ea580c"
  }
});
