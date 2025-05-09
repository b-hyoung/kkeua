import React from 'react';
import { useNavigate } from 'react-router-dom';
import { lobbyUrl } from '../../../utils/urls';

function TutoModal({ showModal, setShowModal, guideSections }) {

  if (!showModal) return null;

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleConfirmButton = () => {
    handleCloseModal();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40 transition-opacity duration-300"></div>
      <div className="fixed top-1/2 left-1/2 w-[350px] h-[700px] -translate-x-1/2 -translate-y-1/2 bg-white bg-opacity-95 shadow-lg border rounded-[20px] px-5 py-6 z-50 overflow-y-auto transition-all duration-300 transform scale-100">
        <h2 className="text-center text-[28px] font-bold text-green-500 mb-4">게임 설명</h2>
        <p className="text-center text-[14px] mb-3">끝말잇기 대격변!</p>
        <p className="text-center text-[14px] mb-5 text-[rgb(84,84,84)]">
          끝말잇기 아이템전 <span className="text-red-500 font-bold text-xl">끄아</span>에 오신것을 환영합니다.
        </p>

        <div className="flex flex-col gap-4">
          {guideSections.map((section, index) => (
            <div key={index} className={`flex items-start text-left ${section.text ? '' : ''}`}>
              {section.image}
              {section.text && <p className="text-sm text-left">{section.text}</p>}
            </div>
          ))}
          <button onClick={handleConfirmButton} className="block w-full bg-[#89EC89] text-white text-[25px] font-bold py-2 rounded-full mt-6">
            시작하기
          </button>
        </div>
      </div>
    </>
  );
}

export default TutoModal;
