// GoFastBare/src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../data/supabaseClient';
import { saveUserId } from "../data/getUserData";
import { useNavigation, StackActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

type RootStackParamList = {
  Login: undefined;
  AdminApp: undefined; 
  ShipperApp: undefined; 
};


export default function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !authData?.user) {
      Alert.alert('Lỗi đăng nhập', error?.message || 'Không thể đăng nhập');
      setLoading(false);
      return;
    }

    const { data: userData, error: userError } = await supabase
      .from('Users')
      .select('role, id')
      .eq('id', authData.user.id)
      .single();

    if (userError || !userData?.role) {
      Alert.alert('Lỗi', 'Không thể lấy thông tin vai trò người dùng.');
      setLoading(false);
      return;
    }

    await saveUserId(userData.id);

    if (userData.role === 'admin') {
      // Giờ đây, phương thức 'replace' đã được nhận diện
      navigation.replace('AdminApp');
    } else if (userData.role === 'shipper') {
      // Giờ đây, phương thức 'replace' đã được nhận diện
      navigation.replace('ShipperApp');
    } else {
      Alert.alert('Lỗi', 'Vai trò không xác định.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đăng nhập hệ thống</Text>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        placeholderTextColor="#aaa"
      />
      <TextInput
        placeholder="Mật khẩu"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        placeholderTextColor="#aaa"
      />
      <TouchableOpacity onPress={handleLogin} style={styles.button} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Đăng nhập</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    height: 48,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 15,
    backgroundColor: '#fff',
    color: '#333',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});