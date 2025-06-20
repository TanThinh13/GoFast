import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons'; // Import Ionicons từ react-native-vector-icons

// Import các màn hình Admin
import DashboardScreen from '../screens/admin/dashboard';
import OrdersScreen from '../screens/admin/orders';
import ShippersScreen from '../screens/admin/shippers';
import ProfileScreen from '../screens/admin/profile'; // Profile có thể dùng chung
import { Platform } from 'react-native';

const AdminTab = createBottomTabNavigator();

export default function AdminTabNavigator() {
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
          height: 55, 
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