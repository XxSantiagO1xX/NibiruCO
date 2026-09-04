const fallbackApi = "http://192.168.1.86:3000";

export const API = process.env.EXPO_PUBLIC_API_URL || fallbackApi;

export default API;
