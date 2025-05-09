import { useEffect, useState } from 'react';

export default function TopMsgAni({ text, onDone }) {
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (!text) return setDisplayText('');

    const chars = Array.from(text);
    let current = '';
    let index = 0;

    const interval = setInterval(() => {
      current += chars[index];
      setDisplayText(current);

      if (index >= chars.length - 1) {
        clearInterval(interval);
        setTimeout(() => {
            if (onDone) onDone();
          }, 500);
      }

      index++;
    }, 150);

    return () => clearInterval(interval);
  }, [text, onDone]);

  return (
    <>
      <div className="text-xl leading-tight">{displayText}</div>
    </>
  );
}
