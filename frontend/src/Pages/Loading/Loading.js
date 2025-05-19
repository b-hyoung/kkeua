import React, { useEffect, useState } from 'react'
import './Loading.css';
import { useNavigate } from 'react-router-dom';
import LoadingButton from './LoadingButton';
import TutoModal from './Modal/TutoModal';
import axiosInstance from '../../apis/axiosInstance';
import { lobbyUrl } from '../../utils/urls';
import { USER_API } from '../../apis/userApi';
import Cookies from 'js-cookie';
import userIsTrue from '../../utils/userIsTrue';
import guestStore from '../../store/guestStore';
import { logoImg } from '../../utils/imgUrl';

function Loading() {
  console.log("Loading 컴포넌트 렌더링");

  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkGuest = async () => {
      const result = await userIsTrue();
      if (result) {
        alert("어허 로그인하셧으면 시작페이지 오지마세요 !");
        navigate(lobbyUrl)
      }
    };
    checkGuest();
  }, [navigate]);

  const startButtonOn = async () => {
    try {
      const response = await axiosInstance.post(USER_API.GET_GUEST, {
        nickname: null,
        device_info: navigator.userAgent
      });

      const data = response.data;

      guestStore.getState().setGuestInfo(data);

      alert(`게스트 ${data.nickname}님으로 로그인되었습니다!`);

      setTimeout(() => {
        setShowModal(true);
      }, 100);
    } catch (error) {
      console.error("게스트 로그인 실패:", error);
      alert("게스트 로그인에 실패했습니다.");
    }
  };

  const backButtonOn = () => {
    window.close();
  };

  const guideSections = [
    {
      image: <div className="w-[60px] h-[60px] border border-red-300 mr-2"></div>,
      text: (
        <>
          첫 번째 아이템<br />
          재미있는 효과<br />
          플레이를 도와줘요!
        </>
      ),
    },
    {
      image: <div className="w-full h-[120px] bg-gray-200 border border-red-300"></div>,
    },
    {
      image: <div className="w-[60px] h-[60px] border border-red-300 mr-2"></div>,
      text: (
        <>
          두 번째 아이템<br />
          상대를 방해하거나<br />
          유리하게 만들 수 있어요!
        </>
      ),
    },
    {
      image: <div className="w-full h-[120px] bg-gray-200 border border-red-300"></div>,
    },
    {
      image: <div className="w-[60px] h-[60px] border border-red-300 mr-2"></div>,
      text: (
        <>
          세 번째 아이템<br />
          위기를 기회로!<br />
          전략적 활용 가능!
        </>
      ),
    },
    {
      image: <div className="w-full h-[120px] bg-gray-200 border border-red-300"></div>,
    },
    {
      image: <div className="w-[60px] h-[60px] border border-red-300 mr-2"></div>,
      text: (
        <>
          네 번째 아이템<br />
          마지막 한 방!<br />
          반전의 기회를 노려보세요!
        </>
      ),
    },
    {
      image: <div className="w-full h-[120px] bg-gray-200 border border-red-300"></div>,
    },
  ];

  return (
    <div className='min-h-screen flex justify-center items-center'>
      <div>
        <div className='text-[25px]'>
          <a className='text-[33px] text-[#CD0000]' >끄</a>
          <a className='text-[#CD0000]' >ㅌ</a>
          <a className='text-[#DC8000]'>잇기</a>
          <a className='text-[33px] text-[#00B106]' >아</a>
          <a className='text-[#00B106]' >케</a>
          <a className='text-[#0088CC]'>이드</a>
        </div>

        <img src={logoImg} className="mx-auto mt-5 w-[40%]"></img>
        <LoadingButton onClick={startButtonOn} id="Loading__button--startbutton" text="시작하기"></LoadingButton><br></br>
        <LoadingButton onClick={backButtonOn} id="Loading__button--backbutton" text="뒤로가기"></LoadingButton>
      </div>

      <TutoModal
        showModal={showModal}
        setShowModal={(show) => {
          console.log("모달 상태 변경:", show);
          setShowModal(show);
          if (!show) {
            console.log("모달 닫힘 - 로비로 이동 시도");
            navigate(lobbyUrl);
          }
        }}
        guideSections={guideSections}
      />
    </div>
  )
}

export default Loading
