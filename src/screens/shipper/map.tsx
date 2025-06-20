import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Image, TouchableOpacity, Alert, PermissionsAndroid, Platform, ScrollView } from 'react-native';
import MapboxGL , {UserTrackingMode} from '@rnmapbox/maps';
import { supabase } from '../../data/supabaseClient';
import { getUserId } from '../../data/getUserData';
import axios from 'axios';
import Geolocation from 'react-native-geolocation-service';



// Cấu hình Mapbox
const MAPBOX_ACCESS_TOKEN = '';
MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

const warehouseIcon = require('../../../assets/warehouse.png');
const warehouseCoords: [number, number] = [106.794445, 10.8453773]; // [longitude, latitude]

// Kiểu dữ liệu
type OrderFromDB = {
    id: string;
    delivery_address: string;
    latitude: number;
    longitude: number;
    weight: number;
};

type OrderForBackend = {
    id: string;
    latitude: number;
    longitude: number;
    weight: number;
};

type RoutePoint = {
    id?: string;
    type: "warehouse" | "order" | "current_location";
    latitude: number;
    longitude: number;
};

type OptimizedRouteResponse = {
    optimized_route: RoutePoint[];
    total_predicted_time_seconds: number;
    total_distance_meters?: number;
    message: string;
    route_geometries?: string[];
};

type RouteStep = {
    distance: number;
    duration: number;
    geometry: {
        coordinates: [number, number][];
        type: string;
    };
    maneuver: {
        bearing_after: number;
        bearing_before: number;
        location: [number, number];
        type: string;
        instruction: string;
    };
    name: string;
};

type RouteFeature = {
    type: 'Feature';
    properties: {
        routeId: string;
        steps?: RouteStep[];
    };
    geometry: {
        type: 'LineString';
        coordinates: [number, number][];
    };
};

type UserLocationType = {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading?: number | null;
};


const MapDeliveryScreen = () => {
    // State management
    const [optimizedPoints, setOptimizedPoints] = useState<RoutePoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentRoute, setCurrentRoute] = useState<RouteFeature | null>(null);
    const [completedRoutes, setCompletedRoutes] = useState<RouteFeature[]>([]);
    const [currentStopIndex, setCurrentStopIndex] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(14);

    // Sử dụng useRef thay cho useState để đánh dấu việc fetch ban đầu
    const hasFetchedInitialRouteRef = useRef(false);
    // Ref mới để lưu trữ userLocation mới nhất mà không gây re-render
    const userLocationRef = useRef<UserLocationType | null>(null);


    // --- State mới cho định vị và ETA ---
    const [userLocation, setUserLocation] = useState<UserLocationType | null>(null);
    const [isFollowingUser, setIsFollowingUser] = useState(false);

    // --- State mới cho Turn-by-Turn ---
    const [currentRouteSteps, setCurrentRouteSteps] = useState<RouteStep[]>([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const cameraRef = useRef<MapboxGL.Camera>(null);
    const watchIdRef = useRef<number | null>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    // --- Hàm yêu cầu quyền vị trí (Chỉ Android) ---
    const requestLocationPermission = useCallback(async (): Promise<boolean> => {
        if (Platform.OS === 'android') {
            try {
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                    {
                        title: "Quyền truy cập vị trí",
                        message: "Ứng dụng này cần truy cập vị trí của bạn để hiển thị bạn trên bản đồ và tối ưu hóa tuyến đường.",
                        buttonNeutral: "Hỏi lại sau",
                        buttonNegative: "Hủy",
                        buttonPositive: "Đồng ý",
                    },
                );
                if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                    console.log("Android location permission granted");
                    return true;
                } else {
                    console.log("Android location permission denied");
                    Alert.alert("Quyền vị trí bị từ chối", "Vui lòng cho phép ứng dụng truy cập vị trí của bạn để sử dụng tính năng định vị.");
                    return false;
                }
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        console.log("Bỏ qua yêu cầu quyền vị trí trên nền tảng không phải Android.");
        return true;
    }, []);

    // --- Hàm bắt đầu theo dõi vị trí người dùng (Chỉ Android) ---
    // Hàm này sẽ cập nhật userLocation liên tục
    const startLocationTracking = useCallback(async () => {
        if (Platform.OS === 'android') {
            const hasPermission = await requestLocationPermission();
            if (!hasPermission) {
                console.warn("Không có quyền vị trí, không thể bắt đầu theo dõi.");
                return;
            }

            if (watchIdRef.current !== null) {
                Geolocation.clearWatch(watchIdRef.current);
            }

            watchIdRef.current = Geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, speed, heading } = position.coords;
                    const newLocation = { latitude, longitude, speed: speed !== undefined ? speed : null, heading: heading !== undefined ? heading : null };
                    setUserLocation(newLocation);
                    userLocationRef.current = newLocation; // Cập nhật ref
                },
                (error) => {
                    console.error("Lỗi lấy vị trí (Android):", error.message);
                    setUserLocation(null);
                    userLocationRef.current = null; // Cập nhật ref
                },
                {
                    enableHighAccuracy: true,
                    distanceFilter: 5, // Cập nhật sau mỗi 5 mét di chuyển
                    interval: 2000,    // Cập nhật mỗi 2 giây
                    fastestInterval: 1000, // Cập nhật nhanh nhất 1 giây
                }
            );
        } else {
            console.log("Bỏ qua theo dõi vị trí trên nền tảng không phải Android.");
        }
    }, [requestLocationPermission]);

    // --- Hàm dừng theo dõi vị trí (Chỉ Android) ---
    const stopLocationTracking = useCallback(() => {
        if (Platform.OS === 'android') {
            if (watchIdRef.current !== null) {
                Geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
                console.log("Đã dừng theo dõi vị trí trên Android.");
            }
        }
    }, []);


    // Lấy danh sách đơn hàng từ Supabase
    const fetchOrdersFromSupabase = async (): Promise<OrderFromDB[]> => {
        try {
            const userId = await getUserId();
            if (!userId) {
                Alert.alert('Lỗi', 'Người dùng chưa đăng nhập hoặc không tìm thấy ID.');
                return [];
            }

            const { data, error } = await supabase
                .from('Orders')
                .select('id, delivery_address, latitude, longitude, weight')
                .eq('shipper_id', userId)
                .eq('status', 'shipping');

            if (error) throw error;

            return data
                .filter(o => o.latitude && o.longitude)
                .map(o => ({
                    id: o.id,
                    delivery_address: o.delivery_address,
                    latitude: Number(o.latitude),
                    longitude: Number(o.longitude),
                    weight: Number(o.weight || 0),
                }));
        } catch (error) {
            console.error('Fetch orders from Supabase error:', error);
            Alert.alert('Lỗi', 'Không thể tải đơn hàng từ Supabase.');
            return [];
        }
    };

    // Gọi API tối ưu hóa lộ trình của bạn
    const optimizeRouteWithBackend = async (
        orders: OrderForBackend[],
        currentLat: number,
        currentLon: number
    ): Promise<OptimizedRouteResponse | null> => {
        try {
            const response = await axios.post<OptimizedRouteResponse>("http://10.0.2.2:8001/optimize_delivery_route/", {
                orders: orders,
                warehouse_latitude: warehouseCoords[1],
                warehouse_longitude: warehouseCoords[0],
                current_latitude: currentLat,
                current_longitude: currentLon,
            });

            console.log("Optimized Route Response:", JSON.stringify(response.data, null, 2));
            return response.data;
        } catch (error) {
            console.error("Lỗi khi gọi API tối ưu lộ trình:", error);
            Alert.alert("Lỗi", "Không thể tối ưu hóa lộ trình. Vui lòng kiểm tra kết nối server.");
            return null;
        }
    };

    // Lấy tuyến đường giữa hai điểm từ Mapbox Directions API, bao gồm các bước hướng dẫn
    const fetchSegmentRouteWithSteps = async (start: [number, number], end: [number, number], segmentId: string): Promise<RouteFeature | null> => {
        try {
            const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
            const response = await fetch(
                `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&steps=true&overview=full&language=vi&access_token=${MAPBOX_ACCESS_TOKEN}`
            );

            const data = await response.json();
            if (data.routes?.length) {
                const route = data.routes[0];
                return {
                    type: 'Feature',
                    properties: {
                        routeId: segmentId,
                        steps: route.legs[0]?.steps || [],
                    },
                    geometry: route.geometry
                };
            }
            console.warn(`Mapbox Directions API returned no routes for segment ${segmentId}.`);
            return null;
        } catch (error) {
            console.error(`Route segment fetch error for ${segmentId}:`, error);
            return null;
        }
    };

    // Khởi tạo toàn bộ quá trình giao hàng
    // Hàm này sẽ chỉ được gọi nếu hasFetchedInitialRouteRef.current là false
    const initDeliveryProcess = useCallback(async () => { // Không có tham số, sẽ đọc từ userLocationRef
        console.log("initDeliveryProcess called. hasFetchedInitialRouteRef.current:", hasFetchedInitialRouteRef.current);
        if (hasFetchedInitialRouteRef.current) {
            console.log("Initial route already fetched. Skipping initDeliveryProcess.");
            return;
        }

        const currentLoc = userLocationRef.current; // Lấy vị trí từ ref
        if (!currentLoc) {
            console.warn("initDeliveryProcess: No user location available to start.");
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const fetchedOrders = await fetchOrdersFromSupabase();

            const startLat = currentLoc.latitude;
            const startLon = currentLoc.longitude;

            if (fetchedOrders.length === 0) {
                Alert.alert("Thông báo", "Hiện không có đơn hàng nào cần giao hoặc lỗi tải.");
                setOptimizedPoints([
                    { type: "current_location", latitude: startLat, longitude: startLon },
                    { type: "warehouse", latitude: warehouseCoords[1], longitude: warehouseCoords[0] }
                ]);
                setCurrentStopIndex(0);
                setCurrentRouteSteps([]);
                setCurrentStepIndex(0);
                cameraRef.current?.setCamera({
                    centerCoordinate: [startLon, startLat],
                    zoomLevel: 17,
                    animationMode: "easeTo",
                    animationDuration: 1000,
                });
                hasFetchedInitialRouteRef.current = true; // Mark as fetched
                return;
            }

            const ordersForBackend: OrderForBackend[] = fetchedOrders.map(o => ({
                id: o.id,
                latitude: o.latitude,
                longitude: o.longitude,
                weight: o.weight,
            }));

            const optimizedResponse = await optimizeRouteWithBackend(ordersForBackend, startLat, startLon);

            if (optimizedResponse && optimizedResponse.optimized_route.length > 0) {
                setOptimizedPoints(optimizedResponse.optimized_route);
                setCurrentStopIndex(0);

                const startPoint = optimizedResponse.optimized_route[0];
                const endPoint = optimizedResponse.optimized_route[1];

                if (startPoint && endPoint) {
                    const initialRouteSegment = await fetchSegmentRouteWithSteps(
                        [startPoint.longitude, startPoint.latitude],
                        [endPoint.longitude, endPoint.latitude],
                        `segment-0-1`
                    );
                    setCurrentRoute(initialRouteSegment);
                    setCurrentRouteSteps(initialRouteSegment?.properties.steps || []);
                    setCurrentStepIndex(0);
                } else if (optimizedResponse.optimized_route.length === 1) {
                    Alert.alert("Thông báo", "Chỉ có vị trí hiện tại trong lộ trình tối ưu, không có đơn hàng nào.");
                    setCurrentRoute(null);
                    setCurrentRouteSteps([]);
                    setCurrentStepIndex(0);
                }

                const allLons = optimizedResponse.optimized_route.map(p => p.longitude);
                const allLats = optimizedResponse.optimized_route.map(p => p.latitude);

                if (allLons.length > 0 && allLats.length > 0) {
                    cameraRef.current?.fitBounds(
                        [Math.max(...allLons), Math.max(...allLats)],
                        [Math.min(...allLons), Math.min(...allLats)],
                        80,
                        1000
                    );
                } else {
                    cameraRef.current?.setCamera({
                        centerCoordinate: [startLon, startLat],
                        zoomLevel: 17,
                        animationMode: "easeTo",
                        animationDuration: 1000,
                    });
                }

                const totalTime = optimizedResponse.total_predicted_time_seconds;
                const totalDistance = optimizedResponse.total_distance_meters;
                Alert.alert(
                    "Tuyến đường tối ưu",
                    `Tổng thời gian dự kiến: ${Math.round(totalTime / 60)} phút ${Math.round(totalTime % 60)} giây\n` +
                    `Tổng khoảng cách: ${totalDistance ? (totalDistance / 1000).toFixed(2) : 'N/A'} km`
                );
                hasFetchedInitialRouteRef.current = true; // Mark as fetched

            } else {
                Alert.alert("Thông báo", "Backend không trả về lộ trình tối ưu.");
                setOptimizedPoints([
                    { type: "current_location", latitude: startLat, longitude: startLon },
                    { type: "warehouse", latitude: warehouseCoords[1], longitude: warehouseCoords[0] }
                ]);
                setCurrentStopIndex(0);
                setCurrentRouteSteps([]);
                setCurrentStepIndex(0);
                cameraRef.current?.setCamera({
                    centerCoordinate: [startLon, startLat],
                    zoomLevel: 17,
                    animationMode: "easeTo",
                    animationDuration: 1000,
                });
                hasFetchedInitialRouteRef.current = true; // Mark as fetched
            }
        } catch (error) {
            console.error("Lỗi trong initDeliveryProcess:", error);
            Alert.alert("Lỗi hệ thống", "Không thể khởi tạo quá trình giao hàng.");
        } finally {
            setLoading(false);
        }
    }, []); // <-- Dependencies rỗng để hàm chỉ được tạo một lần và không bao giờ thay đổi


    // Chuyển đến điểm giao tiếp theo
    const goToNextStop = async () => {
        if (currentStopIndex >= optimizedPoints.length - 1) {
            Alert.alert('Hoàn thành', 'Đã giao hết đơn hàng và quay về kho!');
            if (currentRoute) {
                setCompletedRoutes(prev => [...prev, currentRoute]);
            }
            setCurrentRoute(null);
            setCurrentRouteSteps([]);
            setCurrentStopIndex(optimizedPoints.length);
            return;
        }

        if (currentRoute) {
            setCompletedRoutes(prev => [...prev, currentRoute]);
        }

        const nextIndex = currentStopIndex + 1;
        const currentPoint = optimizedPoints[currentStopIndex];
        const nextPoint = optimizedPoints[nextIndex];

        const newRouteSegment = await fetchSegmentRouteWithSteps(
            [currentPoint.longitude, currentPoint.latitude],
            [nextPoint.longitude, nextPoint.latitude],
            `segment-${currentStopIndex}-${nextIndex}`
        );

        setCurrentRoute(newRouteSegment);
        setCurrentRouteSteps(newRouteSegment?.properties.steps || []);
        setCurrentStepIndex(0);
        setCurrentStopIndex(nextIndex);

        if (nextPoint) {
            cameraRef.current?.flyTo(
                [nextPoint.longitude, nextPoint.latitude],
                1000
            );
            setZoomLevel(15);
        }
        setIsFollowingUser(true);
    };

    // Hàm zoom
    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 1, 20));
        cameraRef.current?.zoomTo(zoomLevel + 1, 500);
        setIsFollowingUser(false);
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 1, 8));
        cameraRef.current?.zoomTo(zoomLevel - 1, 500);
        setIsFollowingUser(false);
    };

    // Hàm căn giữa lại bản đồ vào vị trí người dùng
    const centerOnUserLocation = () => {
        // Lấy userLocation mới nhất từ ref
        if (userLocationRef.current && cameraRef.current) {
            cameraRef.current.flyTo([userLocationRef.current.longitude, userLocationRef.current.latitude], 1000);
            cameraRef.current.zoomTo(17, 1000);
            setIsFollowingUser(true);
        } else {
            Alert.alert("Thông báo", "Không có vị trí người dùng hiện tại.");
        }
    };


    // --- Effect để bắt đầu theo dõi vị trí (chỉ Android) ---
    useEffect(() => {
        if (Platform.OS === 'android') {
            startLocationTracking();
        }
        return () => {
            if (Platform.OS === 'android') {
                stopLocationTracking();
            }
        };
    }, [startLocationTracking, stopLocationTracking]);


    // --- Effect để khởi tạo quá trình giao hàng (chạy MỘT LẦN) ---
    // Effect này chỉ kiểm tra userLocationRef và hasFetchedInitialRouteRef
    useEffect(() => {
        console.log("useEffect for initDeliveryProcess triggered. userLocationRef.current:", userLocationRef.current, "hasFetchedInitialRouteRef.current:", hasFetchedInitialRouteRef.current);

        // Sử dụng một timeout nhỏ để đảm bảo userLocationRef có thời gian được cập nhật lần đầu tiên
        // sau khi startLocationTracking được gọi và vị trí đầu tiên được nhận.
        // Điều này giúp tránh trường hợp initDeliveryProcess được gọi quá sớm khi userLocationRef vẫn còn null.
        const timer = setTimeout(() => {
            if (userLocationRef.current && !hasFetchedInitialRouteRef.current) {
                console.log("User location available, attempting to initialize delivery process (from useEffect).");
                initDeliveryProcess(); // Gọi hàm không có tham số
            }
        }, 500); // 500ms đủ để có thể nhận được vị trí đầu tiên

        // Cleanup function để tránh gọi initDeliveryProcess nếu component unmount quá nhanh
        return () => clearTimeout(timer);

    }, [initDeliveryProcess]); // Dependencies chỉ bao gồm initDeliveryProcess (là một hàm ổn định)


    // --- Effect để điều khiển Camera theo vị trí người dùng (Chỉ Android) ---
    useEffect(() => {
        if (Platform.OS === 'android' && userLocation && isFollowingUser && cameraRef.current) {
            cameraRef.current.setCamera({
                centerCoordinate: [userLocation.longitude, userLocation.latitude],
                zoomLevel: zoomLevel,
                pitch: 45,
                heading: userLocation.heading || 0,
                animationMode: "easeTo",
                animationDuration: 1000
            });
        }
    }, [userLocation, isFollowingUser, zoomLevel]);

    // --- Effect để tự động chuyển bước hướng dẫn ---
    useEffect(() => {
        // Sử dụng userLocationRef.current cho tính toán khoảng cách để tránh re-render không cần thiết
        // cho ETA và chuyển bước hướng dẫn.
        const currentLoc = userLocationRef.current;
        if (!currentLoc || currentRouteSteps.length === 0) {
            return;
        }

        const currentStep = currentRouteSteps[currentStepIndex];
        if (!currentStep || !currentStep.maneuver) {
            return;
        }

        const stepEndCoords = currentStep.maneuver.location;

        const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
            const R = 6371e3;
            const φ1 = lat1 * Math.PI / 180;
            const φ2 = lat2 * Math.PI / 180;
            const Δφ = (lat2 - lat1) * Math.PI / 180;
            const Δλ = (lon2 - lon1) * Math.PI / 180;

            const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            return R * c;
        };

        const distanceToNextManeuver = haversineDistance(
            currentLoc.latitude, currentLoc.longitude, // Sử dụng currentLoc từ ref
            stepEndCoords[1], stepEndCoords[0]
        );

        const threshold = 20;

        if (distanceToNextManeuver < threshold && currentStepIndex < currentRouteSteps.length - 1) {
            console.log(`Đã đến gần điểm rẽ (còn ${distanceToNextManeuver.toFixed(2)}m), chuyển sang bước tiếp theo.`);
            setCurrentStepIndex(prevIndex => prevIndex + 1);
        } else if (distanceToNextManeuver < threshold && currentStepIndex === currentRouteSteps.length - 1) {
            console.log("Đã đến điểm cuối của chặng đường hiện tại.");
        }
    }, [userLocation, currentRouteSteps, currentStepIndex]); // Vẫn giữ userLocation ở đây vì nó cập nhật UI camera và các phần khác

    // Effect để cuộn ScrollView đến bước hiện tại
    useEffect(() => {
        if (scrollViewRef.current && currentRouteSteps.length > 0) {
            const itemHeight = 30;
            const scrollOffset = currentStepIndex * itemHeight;
            scrollViewRef.current.scrollTo({ y: scrollOffset, animated: true });
        }
    }, [currentStepIndex, currentRouteSteps]);


    // Hàm trợ giúp để tính chỉ số thứ tự trên marker
    const getMarkerLabel = (point: RoutePoint, index: number): string => {
        if (point.type === 'warehouse') {
            return '🏠';
        }
        if (point.type === 'current_location') {
            return '📍';
        }
        let orderSequence = 0;
        for (let i = 0; i <= index; i++) {
            if (optimizedPoints[i]?.type === 'order') {
                orderSequence++;
            }
        }
        return `${orderSequence}`;
    };
return (
        <View style={styles.container}>
            <MapboxGL.MapView
                style={styles.map}
                styleURL="mapbox://styles/mapbox/streets-v12"
                onPress={() => setIsFollowingUser(false)}
            >
                <MapboxGL.Camera
                    ref={cameraRef}
                    zoomLevel={17}
                    centerCoordinate={userLocation ? [userLocation.longitude, userLocation.latitude] : warehouseCoords}
                    pitch={45}
                    animationMode="easeTo"
                    animationDuration={2000}
                    followUserMode={UserTrackingMode.FollowWithHeading}
                />

                {/* Hiển thị vị trí người dùng (Chỉ Android) */}
                {Platform.OS === 'android' && (
                    <MapboxGL.UserLocation
                        visible={true}
                        showsUserHeadingIndicator={true}
                        minDisplacement={1}
                        onUpdate={(feature) => {
                            const { longitude, latitude, speed, heading } = feature.coords;
                            const newLocation = {
                                latitude,
                                longitude,
                                speed: speed !== undefined ? speed : null,
                                heading: heading !== undefined ? heading : null
                            };
                            setUserLocation(newLocation);
                            userLocationRef.current = newLocation; // Cập nhật ref ngay lập tức
                        }}
                    />
                )}

                {/* Các điểm giao hàng và điểm kho đã tối ưu */}
                {optimizedPoints.map((point, index) => {
                    const isCurrentStop = index === currentStopIndex;
                    const isCompleted = index < currentStopIndex;

                    if (point.type === 'current_location' && index === 0) {
                        return null;
                    }

                    return (
                        <MapboxGL.PointAnnotation
                            key={`optimized-point-${index}`}
                            id={`optimized-point-${index}`}
                            coordinate={[point.longitude, point.latitude]}
                        >
                            <View style={[
                                styles.orderMarker,
                                point.type === 'warehouse' ? styles.warehouseMarkerSmall : null,
                                isCurrentStop && styles.currentMarker,
                                isCompleted && styles.completedMarker
                            ]}>
                                <Text style={[
                                    styles.markerText,
                                    (isCurrentStop || isCompleted) && { color: 'white' }
                                ]}>
                                    {getMarkerLabel(point, index)}
                                </Text>
                            </View>
                            <MapboxGL.Callout
                                title={
                                    point.type === 'warehouse' ? 'Kho hàng' :
                                    point.type === 'current_location' ? 'Vị trí hiện tại' :
                                    `Điểm giao ${getMarkerLabel(point, index)}`
                                }
                            />
                        </MapboxGL.PointAnnotation>
                    );
                })}

                {/* Marker kho hàng chính (hiển thị riêng nếu nó là điểm đích cuối cùng) */}
                {optimizedPoints.length > 0 && optimizedPoints[optimizedPoints.length - 1].type === 'warehouse' && (
                    <MapboxGL.PointAnnotation id="warehouse-final" coordinate={warehouseCoords}>
                        <View style={styles.warehouseMarker}>
                            <Image source={warehouseIcon} style={styles.warehouseIcon} />
                        </View>
                        <MapboxGL.Callout title="Kho hàng chính" />
                    </MapboxGL.PointAnnotation>
                )}


                {completedRoutes.length > 0 ? (
                    <MapboxGL.ShapeSource
                        id="completedRoutes"
                        shape={{
                            type: 'FeatureCollection',
                            features: completedRoutes
                        }}
                    >
                        <MapboxGL.LineLayer
                            id="completedRoutesLine"
                            style={{
                                lineColor: '#10b981',
                                lineWidth: 3,
                                lineOpacity: 0.7
                            }}
                        />
                    </MapboxGL.ShapeSource>
                ) : null}

                {currentRoute ? (
                    <MapboxGL.ShapeSource id="currentRoute" shape={currentRoute}>
                        <MapboxGL.LineLayer
                            id="currentRouteLine"
                            style={{
                                lineColor: '#3b82f6',
                                lineWidth: 4,
                                lineOpacity: 0.9
                            }}
                        />
                    </MapboxGL.ShapeSource>
                ) : null}

            </MapboxGL.MapView>

            {/* Nút điều khiển lộ trình */}
            <View style={styles.controls}>
                <TouchableOpacity
                    style={[
                        styles.nextButton,
                        currentStopIndex >= optimizedPoints.length - 1 && styles.disabledButton
                    ]}
                    onPress={goToNextStop}
                    disabled={currentStopIndex >= optimizedPoints.length - 1}
                >
                    <Text style={styles.nextButtonText}>
                        {currentStopIndex >= optimizedPoints.length - 1 ? 'Hoàn thành' : 'Điểm tiếp theo'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Nút zoom */}
            <View style={styles.zoomControls}>
                <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
                    <Text style={styles.zoomButtonText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
                    <Text style={styles.zoomButtonText}>-</Text>
                </TouchableOpacity>
                {/* Nút căn giữa vào vị trí người dùng (chỉ hiển thị nếu có vị trí và trên Android) */}
                {Platform.OS === 'android' && userLocation && (
                    <TouchableOpacity style={styles.zoomButton} onPress={centerOnUserLocation}>
                        <Text style={styles.zoomButtonText}>📍</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Hiển thị thông tin tốc độ (Chỉ Android) */}
            {Platform.OS === 'android' && (
                <View style={styles.infoOverlay}>
                    {userLocation && typeof userLocation.speed === 'number' && (
                        <Text style={styles.infoText}>
                            Tốc độ: {(userLocation.speed * 3.6).toFixed(1)} km/h
                        </Text>
                    )}
                </View>
            )}

            {/* Hiển thị toàn bộ hướng dẫn Turn-by-Turn (Chỉ Android) */}
            {Platform.OS === 'android' && currentRouteSteps.length > 0 && (
                <View style={styles.turnByTurnOverlay}>
                    <Text style={styles.turnByTurnTitle}>Hướng dẫn:</Text>
                    <ScrollView ref={scrollViewRef} style={styles.instructionsScrollView}>
                        {currentRouteSteps.map((step, index) => (
                            <View
                                key={`step-${index}`}
                                style={[
                                    styles.instructionItem,
                                    index === currentStepIndex ? styles.currentInstructionItem : null
                                ]}
                            >
                                <Text style={[
                                    styles.instructionText,
                                    index === currentStepIndex ? styles.currentInstructionText : null
                                ]}>
                                    {index + 1}. {step.maneuver.instruction}
                                </Text>
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Loading indicator */}
            {loading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                    <Text style={styles.loadingText}>Đang tải lộ trình...</Text>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
    },
    map: {
        flex: 1,
    },
    warehouseMarker: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#1e3a8a',
    },
    warehouseMarkerSmall: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#ffcc00',
        borderColor: '#e6b800',
        borderWidth: 2,
    },
    warehouseIcon: {
        width: 24,
        height: 24,
    },
    orderMarker: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#e5e7eb',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#6b7280',
    },
    currentMarker: {
        backgroundColor: '#3b82f6',
        borderColor: '#1d4ed8',
    },
    completedMarker: {
        backgroundColor: '#10b981',
        borderColor: '#047857',
    },
    markerText: {
        fontWeight: 'bold',
        fontSize: 12,
        color: '#1f2937',
    },
    controls: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    nextButton: {
        backgroundColor: '#3b82f6',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 24,
        elevation: 3,
    },
    disabledButton: {
        backgroundColor: '#9ca3af',
    },
    nextButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    zoomControls: {
        position: 'absolute',
        right: 16,
        top: '50%',
        transform: [{ translateY: -50 }],
    },
    zoomButton: {
        width: 40,
        height: 40,
        backgroundColor: 'white',
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 8,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
    },
    zoomButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#3b82f6',
        fontSize: 16,
    },
    infoOverlay: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 10,
        padding: 15,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 10,
    },
    infoText: {
        fontSize: 15,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 5,
    },
    etaContainer: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    turnByTurnOverlay: {
        position: 'absolute',
        bottom: 100,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(59, 130, 246, 0.9)',
        borderRadius: 10,
        padding: 15,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 10,
        maxHeight: 200,
    },
    turnByTurnTitle: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    instructionsScrollView: {
        flexGrow: 1,
    },
    instructionItem: {
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.2)',
    },
    currentInstructionItem: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 5,
        paddingHorizontal: 5,
    },
    instructionText: {
        color: 'white',
        fontSize: 14,
        textAlign: 'left',
    },
    currentInstructionText: {
        fontWeight: 'bold',
        fontSize: 15,
    },
});


export default MapDeliveryScreen;