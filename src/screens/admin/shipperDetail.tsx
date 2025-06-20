import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Button,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Pressable,
  TouchableOpacity, // Import TouchableOpacity
} from 'react-native';
import { supabase } from '../../data/supabaseClient';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native'; // Import useNavigation
import type { RootStackParamList } from '../../navigation/types';
import Ionicons from 'react-native-vector-icons/Ionicons';

type ShipperDetailRouteProp = RouteProp<RootStackParamList, 'shipperDetail'>;

interface Shipper {
  id: string;
  fullname?: string;
  email?: string;
  password?: string;
  phone?: string;
  address?: string;
  role?: string;
  created_at?: string;
  cccd: string;
}

interface DeliveryItem {
  id: string;
  customer_name: string;
  item_name: string;
  delivery_address: string;
  created_at: string;
  delivered_at: string | null;
  fee: number;
  status: string;
}

export default function ShipperDetailScreen() {
  const route = useRoute<ShipperDetailRouteProp>();
  const navigation = useNavigation(); // Khởi tạo navigation object
  const { id } = route.params as { id: string };

  const [shipper, setShipper] = useState<Shipper | null>(null);
  const [editableShipper, setEditableShipper] = useState<Shipper | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: shipperData, error: shipperError } = await supabase
        .from('Users')
        .select('*')
        .eq('id', id)
        .single();

      if (shipperError) {
        console.error('Lỗi khi lấy shipper:', shipperError.message);
        Alert.alert('Lỗi', `Không thể tải thông tin shipper: ${shipperError.message}`);
      } else {
        setShipper(shipperData);
      }

      const { data: deliveriesData, error: deliveriesError } = await supabase
        .from('Orders')
        .select('*')
        .eq('shipper_id', id)
        .order('created_at', { ascending: false });

      if (deliveriesError) {
        console.error('Lỗi khi lấy đơn hàng của shipper:', deliveriesError.message);
        Alert.alert('Lỗi', `Không thể tải đơn hàng: ${deliveriesError.message}`);
      } else {
        setDeliveries(deliveriesData || []);
      }
    } catch (e: any) {
      console.error('Lỗi chung khi tải chi tiết shipper:', e.message);
      Alert.alert('Lỗi', `Đã xảy ra lỗi: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleUpdate = async () => {
    if (!editableShipper) return;
    try {
      const { error } = await supabase
        .from('Users')
        .update({
          fullname: editableShipper.fullname,
          phone: editableShipper.phone,
          address: editableShipper.address,
        })
        .eq('id', editableShipper.id);

      if (error) throw error;
      Alert.alert('✅ Thành công', 'Thông tin shipper đã được cập nhật');
      setModalVisible(false);
      fetchData();
    } catch (error: any) {
      Alert.alert('❌ Lỗi', error.message || 'Không thể cập nhật');
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Đang tải chi tiết shipper...</Text>
      </View>
    );
  }

  if (!shipper) {
    return (
      <View style={{ padding: 20 }}>
        <Text style={{ fontSize: 18 }}>🚫 Không tìm thấy thông tin shipper</Text>
        <Button title="Tải lại" onPress={fetchData} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* BỌC NÚT BACK VÀ TIÊU ĐỀ TRONG MỘT VIEW MỚI */}
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={30} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Chi tiết Shipper</Text>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.subTitle}>Thông tin</Text>
          <Ionicons
            name="create-outline"
            size={24}
            color="#007AFF"
            onPress={() => {
              setEditableShipper(shipper);
              setModalVisible(true);
            }}
          />
        </View>
        <Text style={styles.infoText}>Họ tên: {shipper.fullname}</Text>
        <Text style={styles.infoText}>Email: {shipper.email}</Text>
        <Text style={styles.infoText}>SĐT: {shipper.phone}</Text>
        <Text style={styles.infoText}>CCCD: {shipper.cccd}</Text>
        <Text style={styles.infoText}>Địa chỉ: {shipper.address}</Text>
        <Text style={styles.infoText}>
          Ngày tham gia: {shipper.created_at ? new Date(shipper.created_at).toLocaleDateString('vi-VN') : 'N/A'}
        </Text>
      </View>

      <Text style={styles.subTitle}>Đơn hàng đã giao/đang giao</Text>
      {deliveries.length === 0 ? (
        <Text style={styles.noDataText}>Shipper này chưa có đơn hàng nào được giao.</Text>
      ) : (
        <View style={styles.deliveriesContainer}>
          {deliveries.map((delivery) => (
            <View key={delivery.id} style={styles.deliveryItem}>
              <Text style={styles.deliveryStatus}>Trạng thái: {delivery.status}</Text>
              <Text style={styles.deliveryText}>Khách hàng: {delivery.customer_name}</Text>
              <Text style={styles.deliveryText}>Mặt hàng: {delivery.item_name}</Text>
              <Text style={styles.deliveryText}>Phí: {delivery.fee.toLocaleString('vi-VN')} VND</Text>
              <Text style={styles.deliveryText}>
                Ngày giao: {delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleDateString('vi-VN') : 'Chưa giao'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* MODAL chỉnh sửa thông tin */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chỉnh sửa thông tin</Text>

            <TextInput
              style={styles.input}
              placeholder="Họ tên"
              value={editableShipper?.fullname}
              onChangeText={(text) => setEditableShipper((prev) => ({ ...prev!, fullname: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Số điện thoại"
              value={editableShipper?.phone}
              onChangeText={(text) => setEditableShipper((prev) => ({ ...prev!, phone: text }))}
            /><TextInput
              style={styles.input}
              placeholder="CCCD"
              value={editableShipper?.cccd}
              onChangeText={(text) => setEditableShipper((prev) => ({ ...prev!, cccd: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Địa chỉ"
              value={editableShipper?.address}
              onChangeText={(text) => setEditableShipper((prev) => ({ ...prev!, address: text }))}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable style={styles.buttonCancel} onPress={() => setModalVisible(false)}>
                <Text style={{ color: '#fff' }}>Huỷ</Text>
              </Pressable>
              <Pressable style={styles.buttonSave} onPress={handleUpdate}>
                <Text style={{ color: '#fff' }}>Lưu</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 24,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24, 
    marginTop: 10, 
  },
  backButton: {
    paddingRight: 10, 
    paddingVertical: 5,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginLeft : 40,
    flex: 1, 
  },
  subTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 17,
    marginBottom: 8,
    color: '#444',
  },
  deliveriesContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
    padding: 15,
    marginBottom: 20,
  },
  deliveryItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 5,
  },
  deliveryStatus: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  deliveryText: {
    fontSize: 16,
    color: '#555',
  },
  noDataText: {
    textAlign: 'center',
    color: 'gray',
    marginTop: 10,
    marginBottom: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '100%',
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
 input: {
    width: '100%',
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fefefe',
  },
  buttonCancel: {
    backgroundColor: '#999',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  buttonSave: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
});