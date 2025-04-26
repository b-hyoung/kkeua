import { useEffect, useState } from 'react';

export default function useStartTime(delay = 5000) {
  const [isStart, setIsStart] = useState(false);
  const [countdown, setCountdown] = useState(delay / 1000);
  const [showStartText, setShowStartText] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowStartText(true);

          // 🔥 여기서 requestAnimationFrame으로 최소 1프레임은 "시작!"이 보이게 함
          requestAnimationFrame(() => {
            setTimeout(() => {
              setIsStart(true);
            }, 1000); // 1초간 "시작!" 보여주기
          });

          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [delay]);

  return { isStart, countdown, showStartText };
}
