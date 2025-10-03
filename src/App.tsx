import { useState } from 'react';
import StartScreen from './components/StartScreen';
import GameCanvas from './components/GameCanvas';
import GameOverScreen from './components/GameOverScreen';

type GameState = 'start' | 'playing' | 'gameover';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('start');
  const [playerName, setPlayerName] = useState('');
  const [finalScore, setFinalScore] = useState(0);

  const handleStart = (name: string) => {
    setPlayerName(name);
    setGameState('playing');
  };

  const handleGameOver = (score: number) => {
    setFinalScore(score);
    setGameState('gameover');
  };

  const handleRestart = () => {
    setGameState('start');
    setPlayerName('');
    setFinalScore(0);
  };

  return (
    <>
      {gameState === 'start' && <StartScreen onStart={handleStart} />}
      {gameState === 'playing' && (
        <GameCanvas playerName={playerName} onGameOver={handleGameOver} />
      )}
      {gameState === 'gameover' && (
        <GameOverScreen score={finalScore} onRestart={handleRestart} />
      )}
    </>
  );
}
