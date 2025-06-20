// GoFastBare/App.tsx
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './src/data/supabaseClient'; 
import { getUserId } from './src/data/getUserData';

// Screens
import LoginScreen from './src/screens/login';
import ShipperDetailScreen from './src/screens/admin/shipperDetail';

// Tab Navigators
import AdminTabNavigator from './src/navigation/AdminTabNavigator';
import ShipperTabNavigator from './src/navigation/ShipperTabNavigator';

const RootStack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    LogBox.ignoreLogs([
      'AsyncStorage has been extracted from react-native core',
      'Non-serializable values were found in the navigation state',
    ]);

    const checkAuthAndRole = async () => {
      try {
        const userId = await getUserId();
        if (!userId) {
          console.log('Không có userId trong storage. Chuyển về đăng nhập.');
          setInitialRoute('Login');
          return;
        }

        const { data, error } = await supabase
          .from('Users')
          .select('role')
          .eq('id', userId)
          .single();

        if (error || !data) {
          console.error('Lỗi khi lấy vai trò người dùng:', error?.message);
          setInitialRoute('Login');
          return;
        }

        if (data.role === 'admin') {
          setInitialRoute('AdminApp');
        } else if (data.role === 'shipper') {
          setInitialRoute('ShipperApp');
        } else {
          console.warn('Vai trò người dùng không xác định:', data.role);
          setInitialRoute('Login');
        }
      } catch (e) {
        console.error('Lỗi trong quá trình kiểm tra xác thực:', e);
        setInitialRoute('Login');
      } finally {
        setLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_OUT') {
          setInitialRoute('Login');
          setLoading(false);
        } else if (event === 'SIGNED_IN') {
          await checkAuthAndRole();
        }
      }
    );

    checkAuthAndRole();

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  if (loading || initialRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="AdminApp" component={AdminTabNavigator} />
        <RootStack.Screen name="ShipperApp" component={ShipperTabNavigator} />
        <RootStack.Screen
          name="shipperDetail"
          component={ShipperDetailScreen}
          options={{ headerShown: false, title: 'Chi tiết Shipper' }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
});
