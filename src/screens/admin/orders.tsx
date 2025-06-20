import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Button,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { supabase } from '../../data/supabaseClient'; // Đảm bảo import đúng đường dẫn
import { Picker } from '@react-native-picker/picker';
import MapboxGL from '@rnmapbox/maps';
import { pick, types } from '@react-native-documents/picker';
import * as XLSX from 'xlsx';
import RNFS from 'react-native-fs';


// --- Interfaces ---
interface Order {
  id: string;
  customer_name: string;
  item_name: string;
  delivery_address: string;
  created_at: string;
  fee: number;
  status: 'pending' | 'shipping' | 'delivered' | 'cancelled' | 'returned';
  shipper_id: string | null;
  longitude?: number;
  latitude?: number;
}

interface Shipper {
  id: string;
  fullname: string;
}

interface Coords {
  latitude: number;
  longitude: number;
}

interface GeocodingResult {
  address: string; // The original address query
  coords: Coords | null; // Null if not found
  placeName?: string;
  relevance?: number; // Not directly from Nominatim, but can keep for consistency
  placeType?: string[]; // Nominatim returns 'class', 'type'
}

// Đảm bảo MapboxGL.setAccessToken chỉ được gọi một lần và trước khi sử dụng Mapbox
// MapboxGL.MapView vẫn cần access token này để hiển thị bản đồ
MapboxGL.setAccessToken('pk.eyJ1IjoidGFudGhpbmgxMyIsImEiOiJjbWIxajVqN28wOHI2MnFwb3Q4dTE5YzRiIn0.YDm-TlsqGnraJ5q8CKYZvQ');

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrder, setNewOrder] = useState({
    customer_name: '',
    item_name: '',
    delivery_address: '',
    fee: '',
    status: 'pending' as Order['status'],
  });
  const [selectedLocationForNewOrder, setSelectedLocationForNewOrder] = useState<Coords | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedEditCoords, setSelectedEditCoords] = useState<Coords | null>(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [orderToAssign, setOrderToAssign] = useState<Order | null>(null);
  const [selectedShipper, setSelectedShipper] = useState<string | null>(null);
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [loadingShippers, setLoadingShippers] = useState(true);

  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [selectedOrdersToAssign, setSelectedOrdersToAssign] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false); // Trạng thái mới để kiểm soát chế độ chọn

  // --- Hàm tải đơn hàng và shipper ---
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch orders that are not 'delivered'
      const { data, error } = await supabase.from('Orders').select('*').neq('status', 'delivered').order('created_at', { ascending: false });
      if (error) {
        console.error('Supabase Error fetching orders:', error);
        Alert.alert('Lỗi', `Không thể tải đơn hàng: ${error.message || 'Lỗi không xác định'}`);
      } else {
        setOrders(data);
        setFilteredOrders(data);
      }
    } catch (networkError) {
      console.error('Network Error fetching orders:', networkError);
      Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi. Vui lòng kiểm tra internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchShippers = useCallback(async () => {
    setLoadingShippers(true);
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('id, fullname')
        .eq('role', 'shipper');

      if (error) {
        console.error('Supabase Error fetching shippers:', error.message);
        Alert.alert('Lỗi', `Không thể tải danh sách shipper: ${error.message || 'Lỗi không xác định'}`);
      } else {
        setShippers(data as Shipper[]);
      }
    } catch (networkError) {
      console.error('Network Error fetching shippers:', networkError);
      Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi khi tải shipper.');
    } finally {
      setLoadingShippers(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchShippers();
  }, [fetchOrders, fetchShippers]);

  // --- Tìm kiếm đơn hàng ---
  useEffect(() => {
    const lowercasedSearchText = searchText.toLowerCase();
    const filtered = orders.filter(
      (order) =>
        order.customer_name.toLowerCase().includes(lowercasedSearchText) ||
        order.item_name.toLowerCase().includes(lowercasedSearchText) ||
        order.delivery_address.toLowerCase().includes(lowercasedSearchText) ||
        order.status.toLowerCase().includes(lowercasedSearchText)
    );
    setFilteredOrders(filtered);
  }, [searchText, orders]);

  // --- Hàm Geocoding (Sử dụng Nominatim - cho một địa chỉ) ---
  const geocodeAddress = useCallback(async (
    address: string,
    setCoordsFn: React.Dispatch<React.SetStateAction<Coords | null>>,
  ) => {
    if (!address) {
      setCoordsFn(null);
      return;
    }

    try {
      // Nominatim endpoint
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1&countrycodes=vn`;

      console.log('🌍 NOMINATIM FORWARD - Fetching URL:', url);

      const response = await fetch(url, {
        headers: {
          // Nominatim yêu cầu User-Agent
          'User-Agent': 'GoFastDeliveryApp/1.0 (phantanthinh1306@gmail.com)' // Thay bằng email của bạn
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`🌍 NOMINATIM FORWARD - HTTP Error! Status: ${response.status}, Phản hồi: ${errorText}`);
        throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
      }
      const data = await response.json();
      console.log('🌍 NOMINATIM FORWARD - Data received:', data);

      if (data && data.length > 0) {
        const primaryResult = data[0];
        const latitude = parseFloat(primaryResult.lat);
        const longitude = parseFloat(primaryResult.lon);

        setCoordsFn({ latitude, longitude }); // Cập nhật tọa độ
        console.log('🌍 NOMINATIM FORWARD - Tọa độ tìm thấy:', { latitude, longitude });
      } else {
        setCoordsFn(null); // Không tìm thấy tọa độ
        console.warn('🌍 NOMINATIM FORWARD - Không tìm thấy kết quả geocoding cho địa chỉ đã cho.');
        Alert.alert('Thông báo', 'Không tìm thấy kết quả cho địa chỉ này. Vui lòng thử địa chỉ khác hoặc kiểm tra lại.');
      }
    } catch (error: any) {
      console.error('🌍 NOMINATIM FORWARD - Lỗi chung:', error);
      setCoordsFn(null);
      if (error.message && (error.message.includes('Network request failed') || error.message.includes('Failed to construct \'Response\': The status provided (0)'))) {
        Alert.alert('Lỗi mạng', 'Không có kết nối mạng hoặc Nominatim API không phản hồi. Vui lòng kiểm tra internet.');
      } else {
        Alert.alert('Lỗi Geocoding', `Đã xảy ra lỗi khi tìm kiếm địa chỉ: ${error.message || 'Lỗi không xác định'}`);
      }
    }
  }, []);

  // --- Hàm Geocoding hàng loạt (Sử dụng Nominatim - cho nhiều địa chỉ) ---
  // LƯU Ý QUAN TRỌNG: Nominatim công khai có giới hạn tốc độ nghiêm ngặt.
  // Thao tác này có thể bị chặn nếu bạn gửi quá nhiều yêu cầu cùng lúc.
  // Đối với ứng dụng sản xuất hoặc số lượng lớn, bạn nên tự host Nominatim hoặc sử dụng một dịch vụ batch geocoding khác.
  const batchGeocodeAddresses = useCallback(async (addresses: string[]): Promise<GeocodingResult[]> => {
    if (addresses.length === 0) {
      return [];
    }

    const results: GeocodingResult[] = [];

    for (const address of addresses) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1&countrycodes=vn`;
        console.log(`🌍 NOMINATIM BATCH - Fetching URL for: ${address}`);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'GoFastDeliveryApp/1.0 (phantanthinh1306@gmail.com)' // Thay bằng email của bạn
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`🌍 NOMINATIM BATCH - HTTP Error! Status: ${response.status}, Phản hồi: ${errorText} for address: ${address}`);
          // Nếu có lỗi HTTP, thêm kết quả rỗng và tiếp tục
          results.push({ address, coords: null });
          continue; // Chuyển sang địa chỉ tiếp theo
        }
        const data = await response.json();

        if (data && data.length > 0) {
          const primaryResult = data[0];
          const latitude = parseFloat(primaryResult.lat);
          const longitude = parseFloat(primaryResult.lon);
          results.push({
            address: address,
            coords: { latitude, longitude },
            placeName: primaryResult.display_name,
            placeType: [primaryResult.class, primaryResult.type],
          });
        } else {
          console.warn(`🌍 NOMINATIM BATCH - Không tìm thấy tọa độ cho địa chỉ: ${address}`);
          results.push({ address, coords: null });
        }
      } catch (error: any) {
        console.error(`🌍 NOMINATIM BATCH - Lỗi chung cho địa chỉ ${address}:`, error);
        results.push({ address, coords: null });
      }
      // Thêm độ trễ nhỏ giữa các yêu cầu để tránh bị chặn IP từ Nominatim công cộng
      await new Promise(resolve => setTimeout(resolve, 500)); // Đợi 500ms
    }
    return results;
  }, []);


  // --- Hàm tìm kiếm địa chỉ cho đơn hàng mới ---
  const handleSearchNewOrderAddress = useCallback(() => {
    if (newOrder.delivery_address) {
      geocodeAddress(newOrder.delivery_address, setSelectedLocationForNewOrder);
    } else {
      Alert.alert('Thông báo', 'Vui lòng nhập địa chỉ giao hàng.');
    }
  }, [newOrder.delivery_address, geocodeAddress]);

  // --- Hàm tìm kiếm địa chỉ cho đơn hàng chỉnh sửa ---
  const handleSearchEditOrderAddress = useCallback(() => {
    if (editingOrder?.delivery_address) {
      geocodeAddress(editingOrder.delivery_address, setSelectedEditCoords);
    } else {
      Alert.alert('Thông báo', 'Vui lòng nhập địa chỉ giao hàng.');
    }
  }, [editingOrder?.delivery_address, geocodeAddress]);

  // --- Effect for Geocoding edited order address (initial load) ---
  useEffect(() => {
    if (showEditModal && editingOrder) {
      if (editingOrder.latitude && editingOrder.longitude) {
        setSelectedEditCoords({
          latitude: editingOrder.latitude,
          longitude: editingOrder.longitude,
        });
      } else {
        // Nếu không có tọa độ sẵn, thử geocoding địa chỉ
        // geocodeAddress(editingOrder.delivery_address, setSelectedEditCoords); // Tùy chọn: gọi geocode khi mở modal
        setSelectedEditCoords(null);
      }
    } else {
      setSelectedEditCoords(null);
      setEditingOrder(null);
    }
  }, [showEditModal, editingOrder?.latitude, editingOrder?.longitude, editingOrder?.delivery_address, geocodeAddress]);


  // --- Function to handle map press event ---
  const onMapPress = useCallback((event: any, isAddModal: boolean) => {
    if (event.geometry?.type === 'Point') {
      const [longitude, latitude] = (event.geometry.coordinates as [number, number]);
      if (isAddModal) {
        setSelectedLocationForNewOrder({ latitude, longitude });
      } else {
        setSelectedEditCoords({ latitude, longitude });
      }
    }
  }, []);

  // --- Add Order Function ---
  const addOrder = async (orderData: Omit<Order, 'id' | 'created_at' | 'shipper_id'>) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('Orders').insert([orderData]).select();
      if (error) {
        console.error('Supabase Error adding order:', error);
        Alert.alert('Lỗi', `Không thể thêm đơn hàng: ${error.message || 'Lỗi không xác định'}`);
      } else {
        Alert.alert('Thành công', 'Đơn hàng đã được thêm.');
        fetchOrders();
        setShowAddModal(false);
        setNewOrder({ customer_name: '', item_name: '', delivery_address: '', fee: '', status: 'pending' });
        setSelectedLocationForNewOrder(null);
      }
    } catch (networkError) {
      console.error('Network Error adding order:', networkError);
      Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi khi thêm đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  const unassignedOrders = useMemo(() => {
    return filteredOrders.filter((order) => !order.shipper_id);
  }, [filteredOrders]);

  const assignedOrdersGrouped = useMemo(() => {
    const assigned = filteredOrders.filter((order) => order.shipper_id !== null);
    return assigned.reduce((acc, order) => {
      if (order.shipper_id) {
        const shipper = shippers.find(s => s.id === order.shipper_id);
        const orderWithShipperName = { ...order, shipper_name: shipper?.fullname || 'Unknown Shipper' };
        acc[order.shipper_id] = [...(acc[order.shipper_id] || []), orderWithShipperName];
      }
      return acc;
    }, {} as Record<string, Order[]>);
  }, [filteredOrders, shippers]);

  const combinedOrdersData = useMemo(() => {
    const data: Array<{ type: 'header'; title: string } | (Order & { type: 'order'; shipper_name?: string })> = [];

    if (unassignedOrders.length > 0) {
      data.push({ type: 'header', title: 'Đơn hàng chưa phân công' });
      unassignedOrders.forEach(order => {
        data.push({ type: 'order', ...order });
      });
    }

    Object.keys(assignedOrdersGrouped).forEach((shipperId) => {
      const shipper = shippers.find(s => s.id === shipperId);
      const ordersForShipper = assignedOrdersGrouped[shipperId];

      if (shipper && ordersForShipper?.length > 0) {
        data.push({
          type: 'header',
          title: `Đơn hàng của ${shipper.fullname}`
        });
        ordersForShipper.forEach(order => {
          data.push({ type: 'order', ...order, shipper_name: shipper.fullname });
        });
      }
    });
    return data;
  }, [unassignedOrders, assignedOrdersGrouped, shippers]);

  // --- Update Order Function ---
  const updateOrder = async () => {
    if (!editingOrder || !editingOrder.id) return;
    if (!selectedEditCoords) {
      Alert.alert('Lỗi', 'Vui lòng chọn vị trí trên bản đồ.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Orders')
        .update({
          customer_name: editingOrder.customer_name,
          item_name: editingOrder.item_name,
          delivery_address: editingOrder.delivery_address,
          fee: parseFloat(editingOrder.fee as any),
          status: editingOrder.status,
          latitude: selectedEditCoords.latitude,
          longitude: selectedEditCoords.longitude,
        })
        .eq('id', editingOrder.id)
        .select();

      if (error) {
        console.error('Supabase Error updating order:', error);
        Alert.alert('Lỗi', `Không thể cập nhật đơn hàng: ${error.message || 'Lỗi không xác định'}`);
      } else {
        Alert.alert('Thành công', 'Đơn hàng đã được cập nhật.');
        fetchOrders();
        setShowEditModal(false);
        setEditingOrder(null);
        setSelectedEditCoords(null);
      }
    } catch (networkError) {
      console.error('Network Error updating order:', networkError);
      Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi khi cập nhật đơn hàng.');
    } finally {
      setLoading(false);
    }
  };

  // --- Delete Order Function ---
  const deleteOrder = async (orderId: string) => {
    Alert.alert(
      'Xác nhận xóa',
      'Bạn có chắc muốn xóa đơn hàng này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.from('Orders').delete().eq('id', orderId);
              if (error) {
                console.error('Supabase Error deleting order:', error);
                Alert.alert('Lỗi', `Không thể xóa đơn hàng: ${error.message || 'Lỗi không xác định'}`);
              } else {
                Alert.alert('Thành công', 'Đơn hàng đã được xóa.');
                fetchOrders();
              }
            } catch (networkError) {
              console.error('Network Error deleting order:', networkError);
              Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi khi xóa đơn hàng.');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleToggleSelectOrder = useCallback((orderId: string) => {
    setSelectedOrdersToAssign((prevSelected) => {
      const isAlreadySelected = prevSelected.includes(orderId);
      let newSelection: string[];
      if (isAlreadySelected) {
        newSelection = prevSelected.filter((id) => id !== orderId);
      } else {
        newSelection = [...prevSelected, orderId];
      }

      // Nếu không còn đơn hàng nào được chọn, thoát khỏi chế độ lựa chọn
      if (newSelection.length === 0) {
        setSelectionMode(false);
      }
      return newSelection;
    });
  }, []);

  // Hàm để bắt đầu chế độ lựa chọn khi nhấn giữ
  const handleLongPressOrder = useCallback((orderId: string) => {
    setSelectionMode(true);
    handleToggleSelectOrder(orderId); // Tự động chọn đơn hàng khi nhấn giữ
  }, [handleToggleSelectOrder]);


  const handleAssignOrdersToShipper = useCallback(async () => {
    if (selectedOrdersToAssign.length === 0) {
      Alert.alert('Thông báo', 'Vui lòng chọn ít nhất một đơn hàng để thực hiện.'); // Đổi thông báo
      return;
    }
    if (!selectedShipper) {
      Alert.alert('Thông báo', 'Vui lòng chọn một shipper hoặc lựa chọn "Hủy phân công".');
      return;
    }

    setLoading(true);
    try {
      let updateData: { shipper_id: string | null; status?: string };
      let successMessage: string;

      if (selectedShipper === 'unassign') {
        // Nếu chọn hủy phân công
        updateData = { shipper_id: null, status: 'pending' }; // Set shipper_id về null và trạng thái về pending
        successMessage = `Đã hủy phân công ${selectedOrdersToAssign.length} đơn hàng.`;
      } else {
        // Nếu chọn một shipper cụ thể
        updateData = { shipper_id: selectedShipper, status: 'shipping' }; // Set shipper_id và trạng thái shipping
        const assignedShipper = shippers.find(s => s.id === selectedShipper)?.fullname;
        successMessage = `Đã phân công ${selectedOrdersToAssign.length} đơn hàng cho ${assignedShipper || 'một shipper'}.`;
      }

      const updates = selectedOrdersToAssign.map((orderId) =>
        supabase
          .from('Orders')
          .update(updateData) // Sử dụng updateData đã xác định ở trên
          .eq('id', orderId)
      );

      const results = await Promise.all(updates);
      const errors = results.filter((res) => res.error);

      if (errors.length > 0) {
        Alert.alert('Lỗi', 'Đã xảy ra lỗi khi thực hiện phân công/hủy phân công đơn hàng.');
        console.error('Supabase Error assigning/unassigning orders:', errors);
      } else {
        Alert.alert('Thành công', successMessage);
        setSelectedOrdersToAssign([]);
        setSelectedShipper(null);
        setShowAssignModal(false);
        setSelectionMode(false); // Thoát khỏi chế độ lựa chọn sau khi phân công/hủy phân công
        fetchOrders(); // Tải lại danh sách đơn hàng để cập nhật UI
      }
    } catch (networkError) {
      console.error('Network Error assigning/unassigning orders:', networkError);
      Alert.alert('Lỗi', 'Không có kết nối mạng hoặc server không phản hồi khi thực hiện phân công/hủy phân công.');
    } finally {
      setLoading(false);
    }
  }, [selectedOrdersToAssign, selectedShipper, fetchOrders, shippers]); // Thêm 'shippers' vào dependency array

  const handleEditPress = (order: Order) => {
    // Chỉ cho phép chỉnh sửa nếu không ở chế độ lựa chọn
    if (!selectionMode) {
      setEditingOrder(order);
      // Tọa độ đã được xử lý trong useEffect khi showEditModal thay đổi
      setShowEditModal(true);
    } else {
      handleToggleSelectOrder(order.id); // Nếu đang ở chế độ lựa chọn, nhấn vào để chọn/bỏ chọn
    }
  };

  // --- Hàm xử lý nhập từ Excel ---
  const handleImportOrdersFromExcel = async () => {
    try {
      const res = await pick({
        type: [types.xlsx],
        copyTo: 'cachesDirectory',
      });

      if (!res || res.length === 0) return;

      const fileUri = res[0].uri;
      const actualPath = fileUri;

      console.log('📊 EXCEL IMPORT - Reading file from:', actualPath);

      const fileContentBase64 = await RNFS.readFile(actualPath, 'base64');

      const binaryString = atob(fileContentBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const workbook = XLSX.read(bytes.buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const rawOrdersToInsert: any[] = jsonData.map((row: any) => ({
        customer_name: row['Tên khách hàng'],
        item_name: row['Tên sản phẩm'],
        delivery_address: row['Địa chỉ'],
        fee: parseFloat(row['Phí']),
        status: 'pending',
      }));

      // Extract all addresses for batch geocoding
      const addressesToGeocode = rawOrdersToInsert.map(order => order.delivery_address);

      Alert.alert("Đang xử lý", "Đang chuyển đổi địa chỉ thành tọa độ. Vui lòng chờ...");
      const geocodedResults = await batchGeocodeAddresses(addressesToGeocode);

      const newOrdersWithCoords = rawOrdersToInsert.map((order, index) => {
        const result = geocodedResults[index];
        return {
          ...order,
          latitude: result?.coords?.latitude || null,
          longitude: result?.coords?.longitude || null,
        };
      });

      console.log('📊 Inserting into Supabase...');
      const { data, error } = await supabase
        .from('Orders')
        .insert(newOrdersWithCoords) // Insert orders with geocoded coordinates
        .select();

      if (error) {
        console.error('Supabase error:', error);
        Alert.alert('Lỗi', error.message || 'Không thể thêm đơn hàng');
      } else {
        Alert.alert('Thành công', `Đã nhập ${data.length} đơn hàng.`);
        fetchOrders(); // Đảm bảo bạn có hàm này để refresh lại dữ liệu
      }
    } catch (err: any) {
      if (err.code === 'DOCUMENT_PICKER_CANCELED') {
        console.log('📁 Người dùng hủy chọn file');
      } else {
        console.error('📁 Lỗi khi xử lý file:', err);
        Alert.alert('Lỗi', err.message || 'Đã xảy ra lỗi');
      }
    }
  };
  const showUnassignOption = useMemo(() => {
    // Kiểm tra xem có bất kỳ đơn hàng nào trong danh sách được chọn
    // hiện đang có shipper_id không.
    return selectedOrdersToAssign.some(orderId => {
      const order = orders.find(o => o.id === orderId);
      return order && order.shipper_id !== null;
    });
  }, [selectedOrdersToAssign, orders]);


  // --- Render individual order item ---
  const renderOrderItem = useCallback(({ item }: { item: any }) => {
    if (item.type === 'header') {
      return <Text style={styles.sectionHeader}>{item.title}</Text>;
    }

    const isAssigned = !!item.shipper_id;

    return (
      <TouchableOpacity
        style={[styles.card, isAssigned && styles.assignedOrderCard]}
        onLongPress={() => handleLongPressOrder(item.id)} // Nhấn giữ để vào chế độ lựa chọn và chọn đơn hàng
        onPress={() => selectionMode ? handleToggleSelectOrder(item.id) : handleEditPress(item)} // Nhấn để chọn/bỏ chọn nếu đang ở chế độ lựa chọn, ngược lại thì chỉnh sửa
      >
        {selectionMode && ( // Chỉ hiển thị ô tích khi đang ở chế độ lựa chọn
          <Icon
            name={selectedOrdersToAssign.includes(item.id) ? 'check-square' : 'square'}
            size={20}
            color={selectedOrdersToAssign.includes(item.id) ? '#28A745' : '#888'}
            style={{ marginRight: 8 }}
          />
        )}

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{item.customer_name}</Text>
          <Text style={styles.orderItemText}>Sản phẩm: {item.item_name}</Text>
          <Text style={styles.orderItemText}>Địa chỉ: {item.delivery_address}</Text>
          <Text style={styles.orderItemText}>Phí: {item.fee.toLocaleString()}đ</Text>
          <Text style={styles.orderItemText}>Ngày tạo: {new Date(item.created_at).toLocaleDateString('vi-VN')}</Text>
          <Text style={styles.orderItemText}>Trạng thái: {item.status}</Text>
          {isAssigned && item.shipper_name && (
            <Text style={styles.orderItemText}>Shipper: {item.shipper_name}</Text>
          )}
        </View>

        {!selectionMode && ( // Ẩn nút chỉnh sửa/xóa khi đang ở chế độ lựa chọn
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionButton} onPress={() => handleEditPress(item)}>
              <Icon name="edit" size={20} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => deleteOrder(item.id)}>
              <Icon name="trash-2" size={20} color="#F44336" />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [selectedOrdersToAssign, selectionMode, handleToggleSelectOrder, handleLongPressOrder, handleEditPress, deleteOrder]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Quản lý đơn hàng</Text>

      <View style={styles.actionBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm kiếm đơn hàng..."
          value={searchText}
          onChangeText={setSearchText}
        />
        {!selectionMode && ( // Ẩn nút thêm và nhập Excel khi đang ở chế độ lựa chọn
          <>
            <TouchableOpacity style={styles.iconButton} onPress={() => setShowAddModal(true)}>
              <Icon name="plus-circle" size={24} color="#007AFF" />
            </TouchableOpacity>
            {/* New button for Excel import */}
            <TouchableOpacity style={styles.iconButton} onPress={handleImportOrdersFromExcel}>
              <Icon name="file-text" size={24} color="#28A745" /> {/* Green icon for import */}
            </TouchableOpacity>
          </>
        )}

        {selectedOrdersToAssign.length > 0 && ( // Chỉ hiển thị nút phân công khi có đơn hàng được chọn
          <TouchableOpacity
            style={styles.assignButton}
            onPress={() => setShowAssignModal(true)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="user-plus" size={24} color="#fff" />
              <Text style={styles.assignButtonText}>
                Phân công ({selectedOrdersToAssign.length})
              </Text>
            </View>
          </TouchableOpacity>

        )}
        {selectionMode && ( // Nút hủy chế độ lựa chọn
          <TouchableOpacity
            style={[styles.assignButton, { backgroundColor: '#FF3B30' }]}
            onPress={() => {
              setSelectionMode(false);
              setSelectedOrdersToAssign([]);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Icon name="x-circle" size={24} color="#fff" />
              <Text style={styles.assignButtonText}>Hủy</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loadingIndicator} />
      ) : (
        <FlatList
          data={combinedOrdersData}
          keyExtractor={(item: any, index) => {
            if (item.type === 'order' && 'id' in item) {
              return `${item.type}-${item.id}`;
            }
            return `header-${index}`;
          }}
          renderItem={renderOrderItem}
          contentContainerStyle={{ paddingBottom: 100 }}
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={21}
        />
      )}

      {/* --- Add Order Modal --- */}
      <Modal visible={showAddModal} animationType="slide" transparent={false}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.modalScrollContainer}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Thêm đơn hàng mới</Text>
              <TextInput
                placeholder="Tên khách hàng"
                style={styles.input}
                value={newOrder.customer_name}
                onChangeText={(text) =>
                  setNewOrder((prev) => ({ ...prev, customer_name: text }))
                }
              />
              <TextInput
                placeholder="Tên sản phẩm"
                style={styles.input}
                value={newOrder.item_name}
                onChangeText={(text) =>
                  setNewOrder((prev) => ({ ...prev, item_name: text }))
                }
              />
              <TextInput
                placeholder="Phí giao hàng"
                style={styles.input}
                keyboardType="numeric"
                value={newOrder.fee}
                onChangeText={(text) =>
                  setNewOrder((prev) => ({ ...prev, fee: text }))
                }
              />

              {/* Delivery Address with Search Icon for Add Modal */}
              <View style={styles.inputWithIconContainer}>
                <TextInput
                  placeholder="Địa chỉ giao hàng"
                  style={styles.inputWithIcon}
                  value={newOrder.delivery_address}
                  onChangeText={(text) =>
                    setNewOrder((prev) => ({ ...prev, delivery_address: text }))
                  }
                />
                <TouchableOpacity onPress={handleSearchNewOrderAddress} style={styles.searchIcon}>
                  <Icon name="search" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>

              {/* Map for new order location selection */}
              <View style={isMapExpanded ? styles.mapExpandedContainer : styles.mapSmallContainer}>
                <MapboxGL.MapView
                  style={styles.fullMap}
                  styleURL={MapboxGL.StyleURL.Street}
                  onPress={(e) => onMapPress(e, true)}
                >
                  <MapboxGL.Camera
                    zoomLevel={selectedLocationForNewOrder ? 18 : 14}
                    centerCoordinate={
                      selectedLocationForNewOrder
                        ? [selectedLocationForNewOrder.longitude, selectedLocationForNewOrder.latitude]
                        : [106.66, 10.77] // Default position (HCMC)
                    }
                    animationMode="flyTo"
                    animationDuration={1000}
                  />
                  {selectedLocationForNewOrder && (
                    <MapboxGL.PointAnnotation
                      id="selectedPointAdd"
                      coordinate={[selectedLocationForNewOrder.longitude, selectedLocationForNewOrder.latitude]}
                    >
                      <View>
                        <Icon name="map-pin" size={24} color="blue" />
                      </View>
                    </MapboxGL.PointAnnotation>
                  )}
                </MapboxGL.MapView>
                <TouchableOpacity
                  style={styles.mapToggleButton}
                  onPress={() => setIsMapExpanded(prev => !prev)}
                >
                  <Icon name={isMapExpanded ? "minimize-2" : "maximize-2"} size={24} color="#007AFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    setNewOrder({
                      customer_name: '',
                      item_name: '',
                      delivery_address: '',
                      fee: '',
                      status: 'pending',
                    });
                    setSelectedLocationForNewOrder(null);
                    setIsMapExpanded(false);
                  }}
                  style={[styles.modalButton, styles.cancelButton]}
                >
                  <Text style={styles.modalButtonText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedLocationForNewOrder && newOrder.fee !== '') {
                      addOrder({
                        ...newOrder,
                        fee: parseFloat(newOrder.fee),
                        latitude: selectedLocationForNewOrder.latitude,
                        longitude: selectedLocationForNewOrder.longitude,
                      });
                    } else {
                      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin và chọn vị trí trên bản đồ.');
                    }
                  }}
                  style={[styles.modalButton, styles.saveButton]}
                >
                  <Text style={styles.modalButtonText}>Lưu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- Edit Order Modal --- */}
      <Modal visible={showEditModal} animationType="slide" transparent={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView contentContainerStyle={styles.modalScrollContainer}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Chỉnh sửa đơn hàng</Text>
              {editingOrder && (
                <>
                  <TextInput
                    placeholder="Tên khách hàng"
                    style={styles.input}
                    value={editingOrder.customer_name}
                    onChangeText={(text) =>
                      setEditingOrder((prev) => (prev ? { ...prev, customer_name: text } : null))
                    }
                  />
                  <TextInput
                    placeholder="Tên sản phẩm"
                    style={styles.input}
                    value={editingOrder.item_name}
                    onChangeText={(text) =>
                      setEditingOrder((prev) => (prev ? { ...prev, item_name: text } : null))
                    }
                  />
                  <TextInput
                    placeholder="Phí giao hàng"
                    style={styles.input}
                    keyboardType="numeric"
                    value={String(editingOrder.fee)}
                    onChangeText={(text) =>
                      setEditingOrder((prev) => (prev ? { ...prev, fee: Number(text) } : null))
                    }
                  />

                  {/* Delivery Address with Search Icon for Edit Modal */}
                  <View style={styles.inputWithIconContainer}>
                    <TextInput
                      placeholder="Địa chỉ giao hàng"
                      style={styles.inputWithIcon}
                      value={editingOrder.delivery_address}
                      onChangeText={(text) =>
                        setEditingOrder((prev) => (prev ? { ...prev, delivery_address: text } : null))
                      }
                    />
                    <TouchableOpacity onPress={handleSearchEditOrderAddress} style={styles.searchIcon}>
                      <Icon name="search" size={20} color="#007AFF" />
                    </TouchableOpacity>
                  </View>


                  <Picker
                    selectedValue={editingOrder.status}
                    style={styles.picker}
                    onValueChange={(itemValue: 'pending' | 'shipping' | 'delivered' | 'cancelled' | 'returned') =>
                      setEditingOrder({ ...editingOrder, status: itemValue })
                    }
                  >
                    <Picker.Item label="Đang chờ" value="pending" />
                    <Picker.Item label="Đang giao" value="shipping" />
                    <Picker.Item label="Đã giao" value="delivered" />
                    <Picker.Item label="Đã hủy" value="cancelled" />
                    <Picker.Item label="Hoàn trả" value="returned" />
                  </Picker>

                  {/* Map for edit order location selection */}
                  <View style={isMapExpanded ? styles.mapExpandedContainer : styles.mapSmallContainer}>
                    <MapboxGL.MapView
                      style={styles.fullMap}
                      styleURL={MapboxGL.StyleURL.Street}
                      onPress={(e) => onMapPress(e, false)}
                    >
                      <MapboxGL.Camera
                        zoomLevel={selectedEditCoords ? 18 : 14}
                        centerCoordinate={
                          selectedEditCoords
                            ? [selectedEditCoords.longitude, selectedEditCoords.latitude]
                            : [106.66, 10.77] // Default position
                        }
                        animationMode="flyTo"
                        animationDuration={1000}
                      />
                      {selectedEditCoords && (
                        <MapboxGL.PointAnnotation
                          id="selectedPointEdit"
                          coordinate={[selectedEditCoords.longitude, selectedEditCoords.latitude]}
                        >
                          <View>
                            <Icon name="map-pin" size={24} color="red" />
                          </View>
                        </MapboxGL.PointAnnotation>
                      )}
                    </MapboxGL.MapView>
                    <TouchableOpacity
                      style={styles.mapToggleButton}
                      onPress={() => setIsMapExpanded(prev => !prev)}
                    >
                      <Icon name={isMapExpanded ? "minimize-2" : "maximize-2"} size={24} color="#007AFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      onPress={() => setShowEditModal(false)}
                      style={[styles.modalButton, styles.cancelButton]}
                    >
                      <Text style={styles.modalButtonText}>Hủy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={updateOrder} style={[styles.modalButton, styles.saveButton]}>
                      <Text style={styles.modalButtonText}>Lưu</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* --- Assign Shipper Modal --- */}
      <Modal visible={showAssignModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Phân công đơn hàng cho Shipper</Text>
            {loadingShippers ? (
              <ActivityIndicator size="large" color="#007AFF" />
            ) : (
              <Picker
                selectedValue={selectedShipper}
                style={styles.picker}
                onValueChange={(itemValue) => setSelectedShipper(itemValue)}
              >
                <Picker.Item label="Chọn Shipper" value={null} />
                {/* HIỂN THỊ DÒNG NÀY CHỈ KHI CÓ ĐƠN HÀNG ĐÃ ĐƯỢC PHÂN CÔNG */}
                {showUnassignOption && (
                  <Picker.Item label="Hủy phân công (Xóa Shipper)" value="unassign" />
                )}

                {shippers.map((shipper) => (
                  <Picker.Item key={shipper.id} label={shipper.fullname} value={shipper.id} />
                ))}
              </Picker>
            )}
            <View style={styles.modalActions}>
              <Button title="Huỷ" color="gray" onPress={() => setShowAssignModal(false)} />
              <Button title="Xác nhận" onPress={handleAssignOrdersToShipper} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f8f8',
    marginTop : 20,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
    textAlign: 'center',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: 'auto',
  },
  actionButton: {
    marginLeft: 8,
    padding: 5,
  },
  assignButton: {
    flexDirection: 'row',
    backgroundColor: '#FF9800',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  assignButtonText: {
    color: '#fff',
    paddingRight: 5,
    paddingLeft: 5
  },
  picker: {
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: '#fff',
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#333',
  },
  assignedOrderCard: {
    backgroundColor: '#e0f7fa',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#b2dfdb',
  },
  modalContainer: {
    width: '90%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    elevation: 5,
    marginLeft: 20,
  },
  input: {
    height: 45,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  inputWithIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  inputWithIcon: {
    flex: 1,
    height: 45,
    paddingHorizontal: 10,
  },
  searchIcon: {
    padding: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 25,
    width: '100%',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    width: '45%',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  mapSmallContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    position: 'relative',
  },
  modalScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  mapExpandedContainer: {
    flex: 1,
    width: '120%',
    borderRadius: 8,
    marginLeft: -13,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  fullMap: {
    flex: 1,
  },
  mapToggleButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 8,
    borderRadius: 5,
    zIndex: 10,
  },
  card: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#ccc',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#007AFF',
  },
  actionBar: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  iconButton: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  orderItemText: {
    fontSize: 16,
  },
});