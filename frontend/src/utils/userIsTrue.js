import axiosInstance from '../Api/axiosInstance';
import { USER_API } from '../Api/userApi';
import Cookies from 'js-cookie';

async function userIsTrue() {
  const cookieUuid = Cookies.get('kkua_guest_uuid');

  // 쿠키에 UUID가 있는지 확인
  if (!cookieUuid) {
    return false;
  }

  try {
    // 백엔드 스키마에 맞게 요청 구성
    const response = await axiosInstance.post(USER_API.GET_GUEST, {
      guest_uuid: cookieUuid,
      device_info: navigator.userAgent
    });

    if (response.data && response.data.uuid) {
      return true;
    }
  } catch (error) {
    console.warn("UUID 확인 중 오류 발생:", error);
    console.warn("유효하지 않은 uuid, 새 게스트 생성 필요");
  }

  return false;
}

export default userIsTrue;
