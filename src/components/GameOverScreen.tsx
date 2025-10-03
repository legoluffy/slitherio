import { Trophy, RotateCcw } from 'lucide-react';

interface GameOverScreenProps {
  score: number;
  onRestart: () => void;
}

export default function GameOverScreen({ score, onRestart }: GameOverScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 flex items-center justify-center p-4" style={{ backgroundColor: '#2d3142' }}>
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-400 to-orange-500 rounded-full mb-6 animate-pulse">
          <Trophy className="w-12 h-12 text-white" />
        </div>

        <h1 className="text-5xl font-bold text-white mb-2">Game Over!</h1>

        <div className="bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-2xl p-8 mb-6">
          <div className="text-slate-300 text-lg mb-2">Your Final Length</div>
          <div className="text-6xl font-bold text-white mb-1">{score}</div>
          <div className="text-slate-400">segments</div>
        </div>

        <button
          onClick={onRestart}
          className="w-full px-8 py-4 text-xl font-bold text-white bg-gradient-to-r from-green-500 to-blue-500 rounded-xl hover:from-green-600 hover:to-blue-600 transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
        >
          <RotateCcw className="w-6 h-6" />
          Play Again
        </button>

        <p className="text-slate-400 mt-6 text-sm">
          Try to beat your high score!
        </p>
      </div>
    </div>
  );
}
