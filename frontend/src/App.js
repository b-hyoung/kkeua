import './App.css';
import { BrowserRouter as Router, Route, Routes, useNavigate } from 'react-router-dom'; //루트
import Loading from './Pages/Loading/Loading';
import InGame from './Pages/InGame/InGame';
import Lobby from './Pages/Lobby/Lobby';
import GameLobbyPage from './Pages/GameLobbyPage/GameLobbyPage';
import { useEffect } from 'react';
import LoadingTest from './Pages/Loading/LoadingTest';
import LobbyTest from './Pages/Lobby/LobbyTest';



function App() {
  
  return (
    <div className="App">
      <Router>
        <Routes>
          {/* <Route path="/" element={<Loading />} /> */}
          <Route path="/" element={<LoadingTest />} />
          <Route path="/keaing/:gameid" element={<InGame />} />
          {/* <Route path="/lobby" element={<Lobby />} /> */}
          <Route path="/lobby" element={<LobbyTest />} />
          <Route path="/kealobby/:roomId" element={<GameLobbyPage />} />  
        </Routes>
      </Router>
    </div>
  );
}

export default App;
