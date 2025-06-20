import AsyncStorage from "@react-native-async-storage/async-storage";


export const saveUserId = async (userId: string) => {
  try {
    await AsyncStorage.setItem("userId", userId);
  } catch (error) {
    console.error("Error saving userId:", error);
  }
};

export const getUserId = async () => {
  try {
    const userId = await AsyncStorage.getItem("userId");
    return userId;
  } catch (error) {
    console.error("Error retrieving userId:", error);
    return null;
  }
};

export const removeUserId = async () => {
  try {
    await AsyncStorage.removeItem("userId");
  } catch (error) {
    console.error("Error deleting userId:", error);
  }
};

