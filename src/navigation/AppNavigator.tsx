import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AdminTabNavigator from './AdminTabNavigator';
import ShipperDetailScreen from '../screens/admin/shipperDetail'; // Đường dẫn chính xác

import type { RootStackParamList } from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <RootStack.Navigator>
      <RootStack.Screen
        name="AdminTabs"
        component={AdminTabNavigator}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="ShipperDetail"
        component={ShipperDetailScreen}
        options={{ title: 'Chi tiết Shipper' }}
      />
    </RootStack.Navigator>
  );
}
