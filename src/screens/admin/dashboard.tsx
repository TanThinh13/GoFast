import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import dayjs from 'dayjs';
import { supabase } from '../../data/supabaseClient';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);

interface MonthlyStats {
  [month: string]: { revenue: number; orders: number };
}

interface DeliveryItem {
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

export default function DashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({});
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryItem[]>([]);
  const [shipperCount, setShipperCount] = useState<number>(0);

  const screenWidth = Dimensions.get('window').width;
  const currentMonthKey = dayjs().format('YYYY-MM');
  const currentMonthData = monthlyStats[currentMonthKey] || { revenue: 0, orders: 0 };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch delivered orders
        const { data: historyData, error: historyError } = await supabase
          .from('Orders')
          .select('*')
          .eq('status', 'delivered')
          .order('delivered_at', { ascending: false });

        if (historyError) throw historyError;

        if (historyData) {
          const monthly: MonthlyStats = {};
          historyData.forEach((item) => {
            if (item?.delivered_at) {
              const month = dayjs(item.delivered_at).format('YYYY-MM');
              if (!monthly[month]) monthly[month] = { revenue: 0, orders: 0 };
              monthly[month].revenue += item.fee || 0;
              monthly[month].orders += 1;
            }
          });
          setMonthlyStats(monthly);
          setDeliveryHistory(historyData as DeliveryItem[]);
        }

        // Fetch shipper count
        const { data: shippersData, error: shippersError } = await supabase
          .from('Users')
          .select('id')
          .eq('role', 'shipper');

        if (shippersError) throw shippersError;
        if (shippersData) setShipperCount(shippersData.length);
      } catch (err: any) {
        console.error('Fetch error:', err.message);
        setError('Đã xảy ra lỗi khi tải dữ liệu.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'red' }}>{error}</Text>
      </View>
    );
  }

  const months = Object.keys(monthlyStats).sort().slice(-6);
  const orderData = months.map((m) => monthlyStats[m]?.orders || 0);
  const revenueData = months.map((m) => monthlyStats[m]?.revenue || 0);

  const chartConfigBase = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: () => '#000',
    style: { borderRadius: 8 },
  };
  const formatNumberForChart = (num: number): string => {
    if (num >= 1000000000) { // Billion
      return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (num >= 1000000) { // Million
      return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) { // Thousand
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Tổng quan</Text>

      {/* Summary Info */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{currentMonthData.orders}</Text>
          <Text style={styles.summaryLabel}>ĐH tháng {dayjs().format('MM/YY')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatCurrency(currentMonthData.revenue)}</Text>
          <Text style={styles.summaryLabel}>Doanh thu tháng {dayjs().format('MM/YY')}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{shipperCount}</Text>
          <Text style={styles.summaryLabel}>Shipper</Text>
        </View>
      </View>

      {/* Bar Chart: Orders */}
      {months.length > 0 && (
        <>
          <View style={styles.chartContainer}>
            <Text style={styles.subTitle}>Số đơn hàng (6 tháng)</Text>
            <BarChart
              data={{
                labels: months.map((m) => dayjs(m).format('MM/YY')),
                datasets: [{ data: orderData }],
              }}
              width={screenWidth - 32}
              height={260}
              yAxisSuffix=" đơn"
              chartConfig={{
                ...chartConfigBase,
                color: (opacity = 1) => `rgba(255, 99, 132, ${opacity})`,
              }}
              style={styles.chart}
              verticalLabelRotation={30}
              fromZero
              yAxisLabel={''}
              showValuesOnTopOfBars={true} />
          </View>

          {/* Bar Chart: Revenue */}
          <View style={styles.chartContainer}>
            <Text style={styles.subTitle}>Doanh thu (6 tháng)</Text>
            <BarChart
              data={{
                labels: months.map((m) => dayjs(m).format('MM/YY')),
                datasets: [{ data: revenueData }],
              }}
              width={screenWidth - 32}
              height={260}
              yAxisLabel=""
              yAxisSuffix=" vnđ"
              chartConfig={{
                ...chartConfigBase,
                color: (opacity = 1) => `rgba(75, 192, 192, ${opacity})`,
                labelColor: () => '#333',
                formatYLabel: (yValue) => formatNumberForChart(parseFloat(yValue)),
              }}
              style={styles.chart}
              verticalLabelRotation={30}
              fromZero
              showValuesOnTopOfBars={true}
            />
          </View>
        </>
      )}

      {/* Recent Orders */}
      <Text style={styles.subTitle}>Đơn hàng gần đây</Text>
      {deliveryHistory.length === 0 ? (
        <Text style={styles.noDataText}>Chưa có đơn hàng nào.</Text>
      ) : (
        <View style={styles.recentOrdersContainer}>
          {deliveryHistory.slice(0, 5).map((order) => (
            <View key={order.id} style={styles.orderItem}>
              <Text style={styles.orderCustomer}>Khách: {order.customer_name}</Text>
              <Text style={styles.orderItemName}>SP: {order.item_name}</Text>
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F8FAFC', // nền sáng nhẹ
    marginTop : 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#0F172A', // dark slate
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2563EB', // blue-600
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 15,
    color: '#6B7280', // gray-500
    textAlign: 'center',
  },
  subTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
    color: '#1F2937', // gray-800
  },
  chartContainer: {
    marginBottom: 24,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  chart: {
    borderRadius: 8,
  },
  noDataText: {
    textAlign: 'center',
    color: '#9CA3AF', // gray-400
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
  },
  recentOrdersContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 32,
  },
  orderItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB', // gray-200
  },
  orderCustomer: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827', // gray-900
  },
  orderItemName: {
    fontSize: 16,
    color: '#374151', // gray-700
  },
  orderFee: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16A34A', // green-600
  },
  orderStatus: {
    fontSize: 16,
    color: '#6B7280', // gray-500
  },
  orderDate: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

