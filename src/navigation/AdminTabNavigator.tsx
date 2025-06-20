import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Import useSafeAreaInsets
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Import các màn hình Admin
import DashboardScreen from '../screens/admin/dashboard';
import OrdersScreen from '../screens/admin/orders';
import ShippersScreen from '../screens/admin/shippers';
import ProfileScreen from '../screens/admin/profile';


const AdminTab = createBottomTabNavigator();

export default function AdminTabNavigator() {
  // Lấy các giá trị insets (khoảng cách đệm) an toàn của thiết bị
  const insets = useSafeAreaInsets(); // <--- Gọi hook này

  return (
    <AdminTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false, 
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'DashboardTab') {
            iconName = 'home-outline';
          } else if (route.name === 'OrdersTab') {
            iconName = 'list-outline';
          } else if (route.name === 'ShippersTab') {
            iconName = 'person-add-outline';
          } else if (route.name === 'ProfileTab') {
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
          // backgroundColor: 'white', // Thêm màu nền để dễ nhìn thấy padding
        }
      })}
    >
      <AdminTab.Screen
        name="DashboardTab"
        component={DashboardScreen}
        options={{ title: 'Tổng quan' }}
      />
      <AdminTab.Screen
        name="OrdersTab"
        component={OrdersScreen}
        options={{ title: 'Quản lý đơn hàng' }}
      />
      <AdminTab.Screen
        name="ShippersTab"
        component={ShippersScreen}
        options={{ title: 'Quản lý shipper' }}
      />
      <AdminTab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ title: 'Hồ sơ' }}
      />
    </AdminTab.Navigator>
  );
}