import React, { useState, useEffect, useRef, useCallback, useContext } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Image,
  Dimensions,
  StatusBar
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapView, { Marker, AnimatedRegion, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";

import { AppContext } from "../context/AppContext";
import { API_URL } from "../config/api";
import colors from "../theme/colors";
import { openPhoneCall } from "../utils/navigation";

const { width, height: screenHeight } = Dimensions.get("window");
const DEFAULT_DELTA = 0.012;

// Coordenadas base por defecto
const DEFAULT_CENTER = {
  latitude: 20.5888,
  longitude: -100.3899,
  latitudeDelta: DEFAULT_DELTA,
  longitudeDelta: DEFAULT_DELTA
};

/**
 * Calcula la distancia en kilómetros entre dos coordenadas usando la fórmula de Haversine
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Number(d.toFixed(1));
}

/**
 * Estima los minutos de llegada basados en distancia y velocidad media urbana (22 km/h)
 */
function estimateEtaMinutes(distanceKm, reportedEta = null) {
  if (reportedEta !== null && reportedEta !== undefined && reportedEta > 0) {
    return Math.round(reportedEta);
  }
  if (!distanceKm || distanceKm <= 0) return 2;
  const urbanSpeedKmH = 22;
  const minutes = Math.round((distanceKm / urbanSpeedKmH) * 60) + 3; // +3 min de estacionamiento/entrega
  return Math.max(1, minutes);
}

export default function DeliveryTrackingScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { token, user, socket } = useContext(AppContext);

  const orderId = route?.params?.orderId || route?.params?.order?.id;
  const initialOrder = route?.params?.order || null;

  const mapRef = useRef(null);
  const locationSubscription = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadingGps, setLoadingGps] = useState(true);
  const [trackingData, setTrackingData] = useState(null);
  const [driverCoords, setDriverCoords] = useState(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [driverSpeedKmh, setDriverSpeedKmh] = useState(0);
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [hasGpsPermission, setHasGpsPermission] = useState(null);
  const [initialRegion, setInitialRegion] = useState(DEFAULT_CENTER);

  // Región animada para el marcador del repartidor
  const animatedDriverCoord = useRef(
    new AnimatedRegion({
      latitude: DEFAULT_CENTER.latitude,
      longitude: DEFAULT_CENTER.longitude,
      latitudeDelta: DEFAULT_DELTA,
      longitudeDelta: DEFAULT_DELTA
    })
  ).current;

  /**
   * Anima el marcador del repartidor suavemente hacia nuevas coordenadas
   */
  const animateDriverMarker = useCallback(
    (newCoords) => {
      if (!newCoords || !Number.isFinite(newCoords.latitude) || !Number.isFinite(newCoords.longitude)) return;
      if (Platform.OS === "android") {
        if (animatedDriverCoord.timing) {
          animatedDriverCoord
            .timing({
              latitude: newCoords.latitude,
              longitude: newCoords.longitude,
              duration: 1000
            })
            .start();
        } else {
          animatedDriverCoord.setValue({
            latitude: newCoords.latitude,
            longitude: newCoords.longitude
          });
        }
      } else {
        animatedDriverCoord
          .timing({
            latitude: newCoords.latitude,
            longitude: newCoords.longitude,
            duration: 1000
          })
          .start();
      }
    },
    [animatedDriverCoord]
  );

  /**
   * Centra la cámara del mapa en las coordenadas del repartidor o ajusta el encuadre
   */
  const centerOnDriver = useCallback((coords, duration = 800) => {
    if (!mapRef.current || !coords) return;
    mapRef.current.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA
      },
      duration
    );
  }, []);

  /**
   * Ajusta el encuadre del mapa para mostrar tanto al repartidor como el destino
   */
  const fitRouteBounds = useCallback(() => {
    if (!mapRef.current) return;
    const points = [];
    if (driverCoords) points.push(driverCoords);
    if (destinationCoords) points.push(destinationCoords);

    if (points.length >= 2) {
      mapRef.current.fitToCoordinates(points, {
        edgePadding: {
          top: insets.top + 70,
          right: 50,
          bottom: 280,
          left: 50
        },
        animated: true
      });
      setIsAutoCenter(false);
    } else if (driverCoords) {
      centerOnDriver(driverCoords);
      setIsAutoCenter(true);
    }
  }, [driverCoords, destinationCoords, insets.top, centerOnDriver]);

  /**
   * Consulta los datos de rastreo de la orden desde el backend
   */
  const loadTrackingData = useCallback(async () => {
    if (!orderId || !token) return;
    try {
      const res = await axios.get(`${API_URL}/deliveries/orders/${orderId}/track`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = res.data;
      setTrackingData(data);

      // Parsear destino del cliente
      const destLat = Number(data?.destination?.lat || data?.destination?.latitude);
      const destLng = Number(data?.destination?.lng || data?.destination?.longitude);
      if (Number.isFinite(destLat) && Number.isFinite(destLng) && destLat !== 0 && destLng !== 0) {
        setDestinationCoords({ latitude: destLat, longitude: destLng });
      }

      // Si el backend reporta la posición del chofer
      const driverLat = Number(data?.driver?.last_lat || data?.driver?.lat);
      const driverLng = Number(data?.driver?.last_lng || data?.driver?.lng);
      if (Number.isFinite(driverLat) && Number.isFinite(driverLng) && driverLat !== 0 && driverLng !== 0) {
        const coords = { latitude: driverLat, longitude: driverLng };
        setDriverCoords(coords);
        animateDriverMarker(coords);
      }
    } catch (err) {
      console.log("Error loading delivery tracking:", err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, token, animateDriverMarker]);

  /**
   * Suscribe el GPS en tiempo real usando watchPositionAsync
   */
  const setupLocationSubscription = useCallback(async () => {
    try {
      // 1. Solicitar explícitamente permisos de ubicación en primer plano al montar
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setHasGpsPermission(false);
        setLoadingGps(false);
        return;
      }

      setHasGpsPermission(true);

      // 2. Obtener posición GPS inicial del dispositivo para evitar mapa en blanco
      try {
        const currentPos = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced || Location.Accuracy.High
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout GPS")), 4000))
        ]);

        if (currentPos?.coords) {
          const { latitude, longitude, heading: h, speed: s } = currentPos.coords;
          const coords = { latitude, longitude };
          setDriverCoords(coords);
          if (h !== null && h !== undefined) setDriverHeading(h);
          if (s && s > 0) setDriverSpeedKmh(Math.round(s * 3.6));

          animatedDriverCoord.setValue(coords);
          setInitialRegion({
            latitude,
            longitude,
            latitudeDelta: DEFAULT_DELTA,
            longitudeDelta: DEFAULT_DELTA
          });
          centerOnDriver(coords, 500);
        }
      } catch (gpsErr) {
        // En caso de que la señal tarde o falle, usar Santiago de Querétaro como respaldo
        console.warn("Señal GPS tardó en responder, usando Querétaro como respaldo:", gpsErr.message);
        setInitialRegion(DEFAULT_CENTER);
      }

      // Limpiar suscripción previa
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }

      // 3. Suscripción en tiempo real con watchPositionAsync
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation || Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5
        },
        (location) => {
          if (!location?.coords) return;
          const { latitude, longitude, heading: newHeading, speed: newSpeed } = location.coords;
          const newCoords = { latitude, longitude };

          setDriverCoords(newCoords);
          if (newHeading !== null && newHeading !== undefined && newHeading >= 0) {
            setDriverHeading(newHeading);
          }
          if (newSpeed !== null && newSpeed !== undefined && newSpeed >= 0) {
            setDriverSpeedKmh(Math.round(newSpeed * 3.6));
          }

          // Animar marcador del chofer
          animateDriverMarker(newCoords);

          // Auto-centrar si está habilitado
          if (isAutoCenter) {
            centerOnDriver(newCoords, 600);
          }

          // Si el usuario autenticado es repartidor, emitir telemetría al backend
          if (user?.role === "repartidor") {
            axios
              .patch(
                `${API_URL}/deliveries/my-location`,
                {
                  lat: latitude,
                  lng: longitude,
                  heading: newHeading || 0,
                  speed: newSpeed || 0
                },
                { headers: { Authorization: `Bearer ${token}` } }
              )
              .catch(() => {});
          }
        }
      );
    } catch (err) {
      console.warn("GPS tracking error:", err.message);
    } finally {
      setLoadingGps(false);
    }
  }, [animateDriverMarker, centerOnDriver, isAutoCenter, token, user?.role, animatedDriverCoord]);

  // Inicialización y Sockets
  useEffect(() => {
    loadTrackingData();
    setupLocationSubscription();

    if (socket && orderId) {
      socket.emit("join-order", orderId);

      const handleDriverLocation = (loc) => {
        if (loc?.lat && loc?.lng) {
          const coords = { latitude: Number(loc.lat), longitude: Number(loc.lng) };
          setDriverCoords(coords);
          if (loc.heading) setDriverHeading(loc.heading);
          if (loc.speed) setDriverSpeedKmh(Math.round(loc.speed * 3.6));
          animateDriverMarker(coords);
          if (isAutoCenter) centerOnDriver(coords);
        }
      };

      const handleUpdate = () => loadTrackingData();

      socket.on("driver-location-updated", handleDriverLocation);
      socket.on("stop-arrived", handleUpdate);
      socket.on("order-updated", handleUpdate);
      socket.on("delivery-updated", handleUpdate);

      const interval = setInterval(loadTrackingData, 6000);

      return () => {
        clearInterval(interval);
        socket.emit("leave-order", orderId);
        socket.off("driver-location-updated", handleDriverLocation);
        socket.off("stop-arrived", handleUpdate);
        socket.off("order-updated", handleUpdate);
        socket.off("delivery-updated", handleUpdate);
        if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
        }
      };
    }

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [orderId, socket, loadTrackingData, setupLocationSubscription, animateDriverMarker, isAutoCenter, centerOnDriver]);

  // Calcular métricas en vivo (distancia y ETA)
  const remainingDistanceKm =
    driverCoords && destinationCoords
      ? calculateDistanceKm(
          driverCoords.latitude,
          driverCoords.longitude,
          destinationCoords.latitude,
          destinationCoords.longitude
        )
      : trackingData?.distance_km !== undefined
      ? Number(trackingData.distance_km)
      : null;

  const etaMinutes = estimateEtaMinutes(remainingDistanceKm, trackingData?.eta_minutes);

  const orderFolio = trackingData?.folio || initialOrder?.folio || orderId;
  const driver = trackingData?.driver || {};
  const statusKey = trackingData?.tracking_stage || trackingData?.status || "en_ruta";
  const pin = trackingData?.delivery_pin;
  const destinationAddress = trackingData?.destination?.address || initialOrder?.address || "Dirección de entrega";

  // Mapeo de estado para la tarjeta
  const getStatusBadge = () => {
    switch (statusKey) {
      case "repartidor_llego":
        return { label: "¡EL REPARTIDOR YA LLEGÓ!", color: "#16a34a", bg: "#dcfce7", icon: "home" };
      case "repartidor_cercano":
        return { label: "REPARTIDOR MUY CERCA", color: "#2563eb", bg: "#dbeafe", icon: "navigate" };
      case "en_ruta":
        return { label: "EN RUTA DE ENTREGA", color: colors.primary, bg: colors.primarySoft, icon: "bicycle" };
      case "esperando_recogida":
        return { label: "PREPARANDO EN SUCURSAL", color: "#ea580c", bg: "#ffedd5", icon: "restaurant" };
      default:
        return { label: "PEDIDO EN CURSO", color: colors.primary, bg: colors.primarySoft, icon: "time" };
    }
  };

  const statusBadge = getStatusBadge();

  // Estado de carga inicial de GPS y tracking para evitar pantalla en blanco
  if (loadingGps && !driverCoords && !destinationCoords) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <SafeAreaView style={styles.loadingInner}>
          <View style={styles.loadingIconBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.loadingTitle}>Obteniendo Ubicación en Vivo</Text>
          <Text style={styles.loadingSubtitle}>
            Conectando con GPS y mapa de entrega...
          </Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent={true} />

      {/* Mapa Principal de Pantalla Completa */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        onPanDrag={() => setIsAutoCenter(false)}
      >
        {/* Marcador Animado del Repartidor */}
        {driverCoords && (
          <Marker.Animated
            coordinate={animatedDriverCoord}
            anchor={{ x: 0.5, y: 0.5 }}
            flat={true}
            rotation={driverHeading}
            title={driver.name || "Repartidor MealOps"}
            description={`${driverSpeedKmh} km/h · En camino`}
          >
            <View style={styles.driverMarkerBox}>
              <View style={styles.driverMarkerPulse} />
              <View style={styles.driverMarkerIconBg}>
                <Ionicons name="bicycle" size={20} color="#ffffff" />
              </View>
              {driverHeading > 0 && (
                <View
                  style={[
                    styles.driverHeadingArrow,
                    { transform: [{ rotate: `${driverHeading}deg` }] }
                  ]}
                />
              )}
            </View>
          </Marker.Animated>
        )}

        {/* Marcador del Destino de Entrega (Cliente) */}
        {destinationCoords && (
          <Marker
            coordinate={destinationCoords}
            title="Tu Dirección de Entrega"
            description={destinationAddress}
            pinColor={colors.primary}
          >
            <View style={styles.destinationMarkerBox}>
              <Ionicons name="home" size={16} color="#ffffff" />
            </View>
          </Marker>
        )}

        {/* Línea de Ruta Conectando Repartidor y Destino */}
        {driverCoords && destinationCoords && (
          <Polyline
            coordinates={[driverCoords, destinationCoords]}
            strokeColor={colors.primary}
            strokeWidth={4}
            lineDashPattern={[8, 5]}
          />
        )}
      </MapView>

      {/* Header Superior Flotante con Botón de Regreso */}
      <SafeAreaView edges={["top"]} style={styles.headerSafeArea}>
        <View style={styles.floatingHeader}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => navigation?.goBack()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.headerCenterContent}>
            <Text style={styles.headerTitle}>Seguimiento en Vivo</Text>
            <Text style={styles.headerSubtitle}>Pedido #{String(orderFolio).padStart(3, "0")}</Text>
          </View>

          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={loadTrackingData}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Botones Flotantes de Control de Mapa (Recentrar y Ajustar Enfoque) */}
      <View style={[styles.mapControlsColumn, { bottom: insets.bottom + 270 }]}>
        <TouchableOpacity
          style={[styles.mapControlBtn, isAutoCenter && styles.mapControlBtnActive]}
          onPress={() => {
            setIsAutoCenter(true);
            if (driverCoords) centerOnDriver(driverCoords);
          }}
          activeOpacity={0.85}
        >
          <Ionicons
            name={isAutoCenter ? "locate" : "locate-outline"}
            size={22}
            color={isAutoCenter ? colors.primary : colors.text}
          />
        </TouchableOpacity>

        {destinationCoords && (
          <TouchableOpacity
            style={styles.mapControlBtn}
            onPress={fitRouteBounds}
            activeOpacity={0.85}
          >
            <Ionicons name="expand-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* TARJETA FLOTANTE SUPERPUESTA: ESTADO, ETA Y DISTANCIA */}
      <View style={[styles.floatingCardContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.floatingCard}>
          {/* Fila Superior: Badge de Estado y Mini Indicador */}
          <View style={styles.cardHeaderRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
              <Ionicons name={statusBadge.icon} size={14} color={statusBadge.color} />
              <Text style={[styles.statusBadgeText, { color: statusBadge.color }]}>
                {statusBadge.label}
              </Text>
            </View>

            {hasGpsPermission && (
              <View style={styles.liveGpsBadge}>
                <View style={styles.liveGpsDot} />
                <Text style={styles.liveGpsText}>GPS EN VIVO</Text>
              </View>
            )}
          </View>

          {/* Grid de Métricas Principales: ETA y Distancia Restante */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <View style={styles.metricIconBox}>
                <Ionicons name="time" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.metricLabel}>Tiempo Estimado</Text>
                <Text style={styles.metricValue}>
                  {loading ? "--" : `${etaMinutes} min`}
                </Text>
              </View>
            </View>

            <View style={styles.metricDivider} />

            <View style={styles.metricItem}>
              <View style={[styles.metricIconBox, { backgroundColor: "#eff6ff" }]}>
                <Ionicons name="navigate" size={20} color="#2563eb" />
              </View>
              <View>
                <Text style={styles.metricLabel}>Distancia</Text>
                <Text style={styles.metricValue}>
                  {loading || remainingDistanceKm === null ? "--" : `${remainingDistanceKm} km`}
                </Text>
              </View>
            </View>
          </View>

          {/* Fila de Perfil del Repartidor & Acción de Llamada */}
          <View style={styles.driverSection}>
            <View style={styles.driverAvatarBox}>
              {driver.avatar_url ? (
                <Image source={{ uri: driver.avatar_url }} style={styles.driverAvatar} />
              ) : (
                <Text style={styles.driverInitials}>
                  {(driver.name || "R").slice(0, 2).toUpperCase()}
                </Text>
              )}
            </View>

            <View style={styles.driverInfo}>
              <Text style={styles.driverName} numberOfLines={1}>
                {driver.name || "Repartidor asignado"}
              </Text>
              <Text style={styles.driverMeta}>
                {driver.vehicle || "Repartidor MealOps"} · {driverSpeedKmh > 0 ? `${driverSpeedKmh} km/h` : "En traslado"}
              </Text>
            </View>

            {driver.phone ? (
              <TouchableOpacity
                style={styles.callDriverBtn}
                onPress={() => openPhoneCall(driver.phone)}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={17} color="#ffffff" />
                <Text style={styles.callDriverBtnText}>Llamar</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* PIN de Entrega Seguro (Destacado para el cliente) */}
          {pin ? (
            <View style={styles.pinBanner}>
              <View style={styles.pinBannerLeft}>
                <Ionicons name="key" size={16} color="#c2410c" />
                <Text style={styles.pinBannerLabel}>PIN de Entrega:</Text>
              </View>
              <Text style={styles.pinBannerValue}>{pin}</Text>
            </View>
          ) : null}

          {/* Dirección de Destino */}
          <View style={styles.destinationRow}>
            <Ionicons name="location-outline" size={15} color={colors.muted} style={{ marginTop: 1 }} />
            <Text style={styles.destinationText} numberOfLines={1}>
              {destinationAddress}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  loadingInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24
  },
  loadingIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    letterSpacing: -0.2
  },
  loadingSubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    marginTop: 6
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  headerSafeArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10
  },
  floatingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderLight,
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 6
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  headerCenterContent: {
    alignItems: "center"
  },
  headerTitle: {
    fontSize: 14.5,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    marginTop: 1
  },
  mapControlsColumn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
    gap: 10
  },
  mapControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 5
  },
  mapControlBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft
  },
  driverMarkerBox: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center"
  },
  driverMarkerPulse: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 107, 0, 0.25)"
  },
  driverMarkerIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6
  },
  driverHeadingArrow: {
    position: "absolute",
    top: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.primary
  },
  destinationMarkerBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5
  },
  floatingCardContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    zIndex: 10
  },
  floatingCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 10
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3
  },
  liveGpsBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 5
  },
  liveGpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22c55e"
  },
  liveGpsText: {
    fontSize: 9.5,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.4
  },
  metricsGrid: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14
  },
  metricItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  metricIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center"
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.text,
    marginTop: 1
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: 10
  },
  driverSection: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 2,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 12
  },
  driverAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  driverAvatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover"
  },
  driverInitials: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primary
  },
  driverInfo: {
    flex: 1
  },
  driverName: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text
  },
  driverMeta: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.muted,
    marginTop: 1
  },
  callDriverBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 5
  },
  callDriverBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff"
  },
  pinBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#ffedd5",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 10
  },
  pinBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  pinBannerLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#c2410c"
  },
  pinBannerValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#c2410c",
    letterSpacing: 1.5
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 2
  },
  destinationText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    flex: 1
  }
});
