// GoFastBare/src/screens/admin/ShippersScreen.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  Alert, Modal, Pressable, ActivityIndicator, StyleSheet, RefreshControl, SafeAreaView
} from 'react-native';
import { supabase } from '../../data/supabaseClient'; 
import Ionicons from 'react-native-vector-icons/Ionicons'; 
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import Clipboard from '@react-native-clipboard/clipboard'

// Định nghĩa kiểu cho navigation prop của màn hình này
type ShippersScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'AdminTabs'>;

export default function ShippersScreen() {
  // Sử dụng hook useNavigation với kiểu đã định nghĩa
  // Đảm bảo rằng chỉ có MỘT lần khai báo navigation hook trong component
  const navigation = useNavigation<ShippersScreenNavigationProp>();

  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [filteredShippers, setFilteredShippers] = useState<Shipper[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newShipper, setNewShipper] = useState({
    fullname: '',
    phone: '',
    address: '',
    cccd:'',
  });
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Định nghĩa interface Shipper (đặt ở đây để dễ quản lý hơn, hoặc giữ nguyên ở ngoài nếu bạn dùng nó global)
  interface Shipper {
    id: string;
    fullname: string;
    email: string;
    phone: string;
    address: string;
    role: 'shipper';
  }

  // Utility: Xoá dấu tiếng Việt
  const removeVietnameseTones = (str: string) => {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();
  };

  // Utility: Tạo mật khẩu ngẫu nhiên
  const generateSecurePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const digits = '0123456789';
    // Kết hợp chữ thường và số cho 6 ký tự ở giữa
    const lowerAndDigits = lower + digits;

    const getRandom = (set: string) => set[Math.floor(Math.random() * set.length)];

    let password = '';

    // 1. Ký tự đầu tiên là một chữ cái viết hoa
    password += getRandom(upper);

    // 2. Sáu ký tự tiếp theo có thể là chữ thường hoặc số
    for (let i = 0; i < 6; i++) {
        password += getRandom(lowerAndDigits);
    }

    // 3. Ký tự cuối cùng là một ký tự đặc biệt
    password += getRandom(special);

    // Mật khẩu đã được tạo theo đúng thứ tự và độ dài, không cần xáo trộn nữa
    return password;
};

  // Utility: Sinh email không trùng
  const generateUniqueEmail = async (fullname: string) => {
    const base = removeVietnameseTones(fullname);
    let email = `${base}@shipper.com`;
    let counter = 1;

    while (true) {
      const { data, error } = await supabase
        .from('Users')
        .select('id')
        .eq('email', email);

      if (error) {
        console.error("Lỗi khi kiểm tra email:", error.message);
        return null; // Trả về null nếu có lỗi
      }

      if (!data || data.length === 0) {
        return email; // Email duy nhất
      }

      email = `${base}${counter}@shipper.com`;
      counter++;
    }
  };


  const fetchShippers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('Users')
        .select('*')
        .eq('role', 'shipper')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setShippers(data as Shipper[]);
      setFilteredShippers(data as Shipper[]);
    } catch (error: any) {
      console.error('Lỗi khi tải danh sách shipper:', error.message);
      Alert.alert('Lỗi', `Không thể tải danh sách shipper: ${error.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchShippers();
  }, [fetchShippers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchShippers();
  };


  const handleSearch = (text: string) => {
    setSearchText(text);
    if (text === '') {
      setFilteredShippers(shippers);
    } else {
      const lowercasedText = text.toLowerCase();
      const filtered = shippers.filter(
        (shipper) =>
          shipper.fullname.toLowerCase().includes(lowercasedText) ||
          shipper.email.toLowerCase().includes(lowercasedText) ||
          shipper.phone.toLowerCase().includes(lowercasedText)
      );
      setFilteredShippers(filtered);
    }
  };

  const handleAddShipper = async () => {
    if (!newShipper.fullname || !newShipper.phone || !newShipper.address) {
      Alert.alert('Lỗi', 'Vui lòng điền đầy đủ thông tin.');
      return;
    }

    setLoading(true);
    try {
      // 1. Tạo email và mật khẩu
      const email = await generateUniqueEmail(newShipper.fullname);
      if (!email) {
        Alert.alert('Lỗi', 'Không thể tạo email duy nhất.');
        setLoading(false);
        return;
      }
      const password = generateSecurePassword();

      // 2. Tạo tài khoản Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
      });

      if (authError || !authData.user) {
        throw authError;
      }

      // 3. Chèn thông tin người dùng vào bảng 'Users'
      const { error: userError } = await supabase.from('Users').insert({
        id: authData.user.id,
        fullname: newShipper.fullname,
        email: email,
        phone: newShipper.phone,
        address: newShipper.address,
        cccd : newShipper.cccd,
        role: 'shipper',
      });

      if (userError) {
        // Nếu có lỗi khi insert user, hãy xoá tài khoản auth đã tạo
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw userError;
      }

      Alert.alert('Thành công', 'Shipper đã được thêm.');
      setCreatedInfo({ email, password }); // Hiển thị thông tin đăng nhập
      setShowAddModal(false);
      setNewShipper({ fullname: '', phone: '', address: '', cccd :'' }); // Reset form
      fetchShippers(); // Tải lại danh sách
    } catch (error: any) {
      console.error('Lỗi khi thêm shipper:', error.message);
      Alert.alert('Lỗi', `Không thể thêm shipper: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteShipper = async (id: string) => {
  Alert.alert(
    'Xác nhận xóa',
    'Bạn có chắc chắn muốn xóa shipper này? Hành động này sẽ xóa cả tài khoản đăng nhập của họ.',
    [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        onPress: async () => {
          setLoading(true);
          try {
            const response = await fetch(`http://10.0.2.2:3000/api/delete-user/${id}`, {
              method: 'DELETE',
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || 'Lỗi không xác định');
            }

            Alert.alert('Thành công', 'Shipper đã được xóa.');
            fetchShippers();
          } catch (error: any) {
            console.error('Lỗi khi xóa shipper:', error.message);
            Alert.alert('Lỗi', `Không thể xóa shipper: ${error.message}`);
          } finally {
            setLoading(false);
          }
        },
      },
    ],
    { cancelable: true }
  );
};

  const renderShipperItem = ({ item }: { item: Shipper }) => (
    <View style={styles.shipperItem}>
      <View style={styles.shipperInfo}>
        <Text style={styles.shipperName}>{item.fullname}</Text>
        <Text style={styles.shipperContact}>Email: {item.email}</Text>
        <Text style={styles.shipperContact}>SĐT: {item.phone}</Text>
      </View>
      <View style={styles.shipperActions}>
        {/* Dòng này đã đúng và không gây lỗi với định nghĩa RootStackParamList hiện tại */}
        <TouchableOpacity onPress={() => navigation.navigate('shipperDetail', { id: item.id })} style={styles.actionButton}>
          <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteShipper(item.id)} style={styles.actionButton}>
          <Ionicons name="trash-outline" size={24} color="#FF6347" />
        </TouchableOpacity>
      </View>
    </View>
  );
  const copyToClipboard = (text: string, type: 'email' | 'password') => {
    Clipboard.setString(text);
    Alert.alert('Thành công', `${type === 'email' ? 'Email' : 'Mật khẩu'} đã được sao chép vào bộ nhớ tạm!`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Quản lý Shipper</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Tìm kiếm shipper..."
        value={searchText}
        onChangeText={handleSearch}
        placeholderTextColor="#aaa"
      />
      <TouchableOpacity onPress={() => setShowAddModal(true)} style={styles.addButton}>
        <Text style={styles.buttonText}>Thêm Shipper</Text>
      </TouchableOpacity>

      {loading && !refreshing ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text>Đang tải dữ liệu...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredShippers}
          renderItem={renderShipperItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Add Shipper Modal */}
      <Modal animationType="slide" transparent={true} visible={showAddModal}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Thêm Shipper mới</Text>
            <TextInput
              style={styles.input}
              placeholder="Họ và tên"
              value={newShipper.fullname}
              onChangeText={(text) => setNewShipper({ ...newShipper, fullname: text })}
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              placeholder="Số điện thoại"
              value={newShipper.phone}
              onChangeText={(text) => setNewShipper({ ...newShipper, phone: text })}
              keyboardType="phone-pad"
              placeholderTextColor="#aaa"
            /><TextInput
              style={styles.input}
              placeholder="CCCD"
              value={newShipper.cccd}
              onChangeText={(text) => setNewShipper({ ...newShipper, cccd: text })}
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={styles.input}
              placeholder="Địa chỉ"
              value={newShipper.address}
              onChangeText={(text) => setNewShipper({ ...newShipper, address: text })}
              placeholderTextColor="#aaa"
            />
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setShowAddModal(false)}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.modalButtonText}>Hủy</Text>
              </Pressable>
              <Pressable
                onPress={handleAddShipper}
                style={[styles.modalButton, styles.saveButton]}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalButtonText}>Tạo</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal hiển thị email & mật khẩu */}
     <Modal animationType="fade" transparent={true} visible={!!createdInfo}>
        <View style={styles.modalContainer}>
          <View style={styles.createdInfoModalContent}>
            <Text style={styles.createdInfoTitle}>Tạo tài khoản thành công</Text>

            <View style={styles.infoRow}>
              <Text style={styles.createdInfoText}>Email: {createdInfo?.email}</Text>
              <TouchableOpacity onPress={() => createdInfo?.email && copyToClipboard(createdInfo.email, 'email')} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.createdInfoText}>Mật khẩu: {createdInfo?.password}</Text>
              <TouchableOpacity onPress={() => createdInfo?.password && copyToClipboard(createdInfo.password, 'password')} style={styles.copyButton}>
                <Ionicons name="copy-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <Pressable
              onPress={() => setCreatedInfo(null)}
              style={styles.closeCreatedInfoButton}
            >
              <Text style={styles.modalButtonText}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f2f2f2',
    marginTop : 20,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  searchInput: {
    height: 40,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 15,
    backgroundColor: '#fff',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 20,
  },
  shipperItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
    alignItems: 'center',
  },
  shipperInfo: {
    flex: 1,
  },
  shipperName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  shipperContact: {
    fontSize: 16,
    color: '#555',
  },
  shipperActions: {
    flexDirection: 'row',
    marginLeft: 10,
  },
  actionButton: {
    marginLeft: 15,
    padding: 5,
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
    borderRadius: 12,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
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
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  createdInfoModalContent: {
   backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  createdInfoTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  createdInfoText: {
    marginBottom: 6,
    color: '#555',
    fontSize: 18,
  },
  closeCreatedInfoButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#ccc',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  copyButton: {
    marginLeft: 10,
    padding: 5,
  },
});