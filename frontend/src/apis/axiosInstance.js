import axios from 'axios';


const axiosInstance = axios.create({

  baseURL: window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://your-production-api.com", // replace with actual production API if needed
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 5000, // 요청 제한 시간 (원하는 대로 조절)
  withCredentials: true, // ✅ 쿠키 포함되도록 설정
});

export default axiosInstance;