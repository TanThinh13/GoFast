import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ActivityIndicator, StyleSheet,
  Modal, TextInput, TouchableOpacity, Alert, ScrollView, Button
} from 'react-native';
import { supabase } from '../../data/supabaseClient';
import { getUserId, removeUserId } from '../../data/getUserData';
import Feather from 'react-native-vector-icons/Feather';
import { useNavigation, CommonActions } from '@react-navigation/native';


interface UserInfo {
  id: string;
  fullname: string | null;
  email: string | null;
  role: string | null;
  phone: string | null;
  address: string | null;
  cccd: string | null;
}

const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}:</Text>
    <Text style={styles.infoValue}>{value || 'N/A'}</Text>
  </View>
);

// --- MAIN COMPONENT ---
export default function ProfileScreen() {
  const navigation = useNavigation();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [editedInfo, setEditedInfo] = useState<UserInfo | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false); // State cho modal đặt lại mật khẩu
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const userId = await getUserId();

    if (!userId) {
      console.error("Không tìm thấy userId. Người dùng có thể chưa đăng nhập.");
      setLoading(false);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        })
      );
      return;
    }

    const { data, error } = await supabase
      .from('Users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Lỗi khi lấy thông tin người dùng:', error.message);
      Alert.alert('Lỗi', `Không thể tải thông tin hồ sơ: ${error.message}`);
      setUserInfo(null);
      setEditedInfo(null);
    } else if (data) {
      const typedData: UserInfo = { ...data, id: String(data.id) };
      setUserInfo(typedData);
      setEditedInfo(typedData);
    } else {
      console.warn("Không tìm thấy thông tin người dùng với userId này.");
      Alert.alert("Thông báo", "Không tìm thấy thông tin hồ sơ của bạn.");
      setUserInfo(null);
      setEditedInfo(null);
    }
    setLoading(false);
  }, [navigation]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const validateInput = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!editedInfo) {
      newErrors.general = "Thông tin chỉnh sửa không tồn tại.";
      setErrors(newErrors);
      return false;
    }

    if (!editedInfo.fullname || editedInfo.fullname.trim() === '') {
      newErrors.fullname = 'Họ tên không được để trống.';
    }

    if (!editedInfo.phone || editedInfo.phone.trim() === '') {
      newErrors.phone = 'Số điện thoại không được để trống.';
    } else if (!/^\d{8,}$/.test(editedInfo.phone)) {
      newErrors.phone = 'Số điện thoại phải có ít nhất 8 chữ số và chỉ chứa số.';
    }

    if (!editedInfo.address || editedInfo.address.trim() === '') {
      newErrors.address = 'Địa chỉ không được để trống.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveProfile = async () => {
    if (!validateInput()) {
      return;
    }

    if (!userInfo?.id || !editedInfo) {
      Alert.alert('Lỗi', 'Không có thông tin người dùng để cập nhật.');
      return;
    }

    setLoading(true);
    const { error } = await supabase
      .from('Users')
      .update({
        fullname: editedInfo.fullname,
        phone: editedInfo.phone,
        address: editedInfo.address,
      })
      .eq('id', userInfo.id);

    if (error) {
      console.error('Lỗi khi cập nhật hồ sơ:', error.message);
      Alert.alert('Lỗi', `Không thể cập nhật hồ sơ: ${error.message}`);
    } else {
      Alert.alert('Thành công', 'Hồ sơ đã được cập nhật.');
      await fetchProfile();
      setEditModalVisible(false);
      setErrors({});
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    setPasswordError('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('Vui lòng điền đầy đủ các trường.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu xác nhận không khớp.');
      return;
    }

    // Lấy thông tin session hiện tại để kiểm tra email
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData?.session) {
      setPasswordError('Không thể lấy phiên người dùng hiện tại. Vui lòng đăng nhập lại.');
      return;
    }
    const email = sessionData.session.user.email;

    if (!email) {
      setPasswordError('Không thể xác thực người dùng. Email không có sẵn.');
      return;
    }

    // Xác thực lại bằng mật khẩu cũ (Sign in với mật khẩu cũ)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: oldPassword,
    });

    if (signInError) {
      // Nếu mật khẩu cũ không khớp, Supabase sẽ trả về lỗi
      setPasswordError('Mật khẩu cũ không chính xác. ' + signInError.message);
      return;
    }

    // Nếu mật khẩu cũ hợp lệ, tiến hành cập nhật mật khẩu mới
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      console.error('Lỗi đổi mật khẩu:', updateError.message);
      setPasswordError('Lỗi khi cập nhật mật khẩu: ' + updateError.message);
    } else {
      Alert.alert('Thành công', 'Đổi mật khẩu thành công.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError(''); // Xóa lỗi nếu có
      setResetPasswordModalVisible(false); // Đóng modal sau khi đổi mật khẩu thành công
    }
  };


  const handleLogout = async () => {
    Alert.alert(
      "Xác nhận đăng xuất",
      "Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?",
      [
        {
          text: "Hủy",
          style: "cancel"
        },
        {
          text: "Đăng xuất",
          onPress: async () => {
            const { error } = await supabase.auth.signOut();
            if (!error) {
              await removeUserId();
              navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                })
              );
            } else {
              console.error("Đăng xuất thất bại:", error.message);
              Alert.alert("Lỗi", `Đăng xuất thất bại: ${error.message}`);
            }
          }
        }
      ],
      { cancelable: false }
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Đang tải thông tin hồ sơ...</Text>
      </View>
    );
  }

  if (!userInfo) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorDisplay}>Không thể tải thông tin người dùng.</Text>
        <Button title="Thử lại" onPress={fetchProfile} color="#007AFF" />
        <View style={{ marginTop: 20 }}>
          <Button title="Đăng xuất" onPress={handleLogout} color="#FF6B6B" />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Hồ sơ của tôi</Text>
        <TouchableOpacity
          onPress={() => {
            setEditedInfo(userInfo);
            setErrors({});
            setEditModalVisible(true);
          }}
          style={styles.editButton}
        >
          <Feather name="edit" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
          <InfoRow label="Họ tên" value={userInfo.fullname} />
          <InfoRow label="Email" value={userInfo.email} />
          <InfoRow label="CCCD" value={userInfo.cccd} />
          <InfoRow label="Số điện thoại" value={userInfo.phone} />
          <InfoRow label="Địa chỉ" value={userInfo.address} />
      </View>

      {/* Nút Đặt lại mật khẩu */}
      <TouchableOpacity
        onPress={() => {
          setResetPasswordModalVisible(true);
          setPasswordError(''); // Xóa lỗi cũ khi mở modal
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
        }}
        style={styles.resetPasswordBtn} // Áp dụng style mới cho nút
      >
        <Feather name="lock" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.resetPasswordText}>Đặt lại mật khẩu</Text>
      </TouchableOpacity>

      {/* Nút Đăng xuất */}
      <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
        <Feather name="log-out" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </TouchableOpacity>

      {/* Edit Profile Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => {
          setEditModalVisible(false);
          setErrors({});
          setEditedInfo(userInfo);
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chỉnh sửa hồ sơ</Text>
            <TextInput
              style={[styles.input, errors.fullname && styles.inputError]}
              placeholder="Họ tên"
              value={editedInfo?.fullname || ''}
              onChangeText={(text) => setEditedInfo(prev => prev ? { ...prev, fullname: text } : null)}
              placeholderTextColor="#aaa"
            />
            {errors.fullname && <Text style={styles.errorText}>{errors.fullname}</Text>}

            <TextInput
              style={[styles.input, errors.phone && styles.inputError]}
              placeholder="Số điện thoại"
              value={editedInfo?.phone || ''}
              onChangeText={(text) => setEditedInfo(prev => prev ? { ...prev, phone: text } : null)}
              keyboardType="phone-pad"
              placeholderTextColor="#aaa"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}

            <TextInput
              style={[styles.input, errors.cccd && styles.inputError]}
              placeholder="CCCD"
              value={editedInfo?.cccd || ''}
              onChangeText={(text) => setEditedInfo(prev => prev ? { ...prev, cccd: text } : null)}
              keyboardType="phone-pad"
              placeholderTextColor="#aaa"
            />
            {errors.cccd && <Text style={styles.errorText}>{errors.cccd}</Text>}

            <TextInput
              style={[styles.input, errors.address && styles.inputError]}
              placeholder="Địa chỉ"
              value={editedInfo?.address || ''}
              onChangeText={(text) => setEditedInfo(prev => prev ? { ...prev, address: text } : null)}
              placeholderTextColor="#aaa"
            />
            {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setErrors({});
                  setEditedInfo(userInfo);
                }}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.modalButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveProfile} style={[styles.modalButton, styles.saveButton]}>
                <Text style={styles.modalButtonText}>Lưu</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={resetPasswordModalVisible}
        onRequestClose={() => {
          setResetPasswordModalVisible(false);
          setPasswordError(''); // Xóa lỗi khi đóng modal
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Đặt lại mật khẩu</Text>
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="Mật khẩu cũ"
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="Mật khẩu mới"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholderTextColor="#aaa"
            />
            <TextInput
              style={[styles.input, passwordError && styles.inputError]}
              placeholder="Xác nhận mật khẩu mới"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholderTextColor="#aaa"
            />
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setResetPasswordModalVisible(false);
                  setPasswordError('');
                }}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.modalButtonText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangePassword} style={[styles.modalButton, styles.saveButton]}>
                <Text style={styles.modalButtonText}>Cập nhật</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// --- STYLES ---
const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#007AFF',
  },
  errorDisplay: {
    fontSize: 18,
    color: '#D32F2F',
    marginBottom: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  editButton: {
    padding: 10,
    borderRadius: 5,
  },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 20, // Giảm khoảng cách để chừa chỗ cho nút đặt lại mật khẩu
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#555',
    width: 140,
  },
  infoValue: {
    fontSize: 17,
    color: '#333',
    flex: 1,
  },
  resetPasswordBtn: {
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    marginBottom: 15, // Khoảng cách giữa nút đặt lại mật khẩu và nút đăng xuất
  },
  resetPasswordText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutBtn: {
    backgroundColor: '#FF6B6B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    marginBottom: 30, // Khoảng cách cuối trang
  },
  logoutText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
    marginBottom: 25,
    color: '#333',
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
  inputError: {
    borderColor: '#E74C3C',
    borderWidth: 2,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    marginTop: -10,
    marginBottom: 10,
    alignSelf: 'flex-start',
    paddingLeft: 5,
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
});