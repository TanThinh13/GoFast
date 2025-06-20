// GoFastBare/src/navigation/ShipperTabNavigator.tsx
import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons'; // Import Ionicons từ react-native-vector-icons
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import các màn hình Shipper
import DashboardScreen from '../screens/shipper/dashboard'; // Có thể dùng chung hoặc tạo riêng cho shipper
import HistoryScreen from '../screens/shipper/history';
import ProfileScreen from '../screens/shipper/profile';
import MapScreen from '../screens/shipper/map'; // Giả định shipper có màn hình bản đồ

const ShipperTab = createBottomTabNavigator();

export default function ShipperTabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <ShipperTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'ShipperDashboardTab') {
            iconName = 'home-outline';
          } else if (route.name === 'MapTab') {
            iconName = 'map-outline';
          } else if (route.name === 'HistoryTab') {
            iconName = 'time-outline';
          }
          else if (route.name === 'ShipperProfileTab') {
            iconName = 'person-circle-outline';
          }
          // @ts-ignore
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: 'bold',
          paddingBottom: 2,
        },
        tabBarStyle: {
          height: 55 + insets.bottom, // <--- Cộng thêm giá trị insets.bottom
          paddingBottom: insets.bottom, // <--- Thêm paddingBottom chính xác
        }
      })}
    >
      <ShipperTab.Screen
        name="ShipperDashboardTab"
        component={DashboardScreen} // Có thể là Dashboard chung hoặc ShipperDashboard riêng
        options={{ title: 'Tổng quan' }}
      />
      <ShipperTab.Screen
        name="MapTab"
        component={MapScreen}
        options={{ title: 'Bản đồ' }}
      />
      <ShipperTab.Screen
        name="HistoryTab"
        component={HistoryScreen}
        options={{ title: 'Lịch sử' }}
      />
      <ShipperTab.Screen
        name="ShipperProfileTab"
        component={ProfileScreen}
        options={{ title: 'Hồ sơ' }}
      />
    </ShipperTab.Navigator>
  );
}