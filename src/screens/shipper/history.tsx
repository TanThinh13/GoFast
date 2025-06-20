import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '../../data/supabaseClient';
import { getUserId } from '../../data/getUserData';
import dayjs from 'dayjs';

interface Order {
  id: string;
  customer_name: string;
  item_name: string;
  shipper_id: string;
  delivery_address: string;
  created_at: string;
  delivered_at: string;
  fee: number;
  status: string;
}

const HistoryScreen = () => {
  const [deliveryHistory, setDeliveryHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from('Orders')
        .select('*')
        .eq('shipper_id', userId)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false });

      if (data) setDeliveryHistory(data as Order[]);
      setLoading(false);
    };

    fetchOrders();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
    }).format(amount);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.noDataText}>Đang tải lịch sử đơn hàng...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Lịch sử giao hàng</Text>

      {deliveryHistory.length === 0 ? (
        <Text style={styles.noDataText}>Không có đơn hàng đã giao.</Text>
      ) : (
        <View style={styles.recentOrdersContainer}>
          {deliveryHistory.slice(0, 5).map((order) => (
            <View key={order.id} style={styles.orderItem}>
              <Text style={styles.orderCustomer}>Khách: {order.customer_name}</Text>
              <Text style={styles.orderItemName}>Sản phẩm: {order.item_name}</Text>
              <Text style={styles.orderFee}>Phí: {formatCurrency(order.fee)}</Text>
              <Text style={styles.orderStatus}>Trạng thái: {order.status}</Text>
              <Text style={styles.orderDate}>
                Ngày tạo: {dayjs(order.created_at).format('DD/MM HH:mm')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#0F172A',
  },
  noDataText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
  },
  recentOrdersContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 32,
  },
  orderItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  orderCustomer: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  orderItemName: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 4,
  },
  orderFee: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16A34A',
    marginBottom: 4,
  },
  orderStatus: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});


export default HistoryScreen;
