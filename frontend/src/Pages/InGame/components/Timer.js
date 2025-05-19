import { useEffect, useState } from "react";

function Timer(initTime, onTimeOut) {
    const [timeLeft, setTimeLeft] = useState(initTime); 

    useEffect(() => {
        if(timeLeft <= 0) {
            onTimeOut?.(); 
            return; 
        }

    const timer = setTimeout(() => {
        setTimeLeft(prev => prev -1); 
    }, 1000); 

    return () => clearTimeout(timer); 
    }, [timeLeft]);

    const resetTimer = () => setTimeLeft(initTime); 
    return { timeLeft, resetTimer }; 
}

export default Timer;