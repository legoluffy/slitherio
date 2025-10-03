import { useState } from 'react';
import { Waves } from 'lucide-react';

interface StartScreenProps {
  onStart: (name: string) => void;
}

export default function StartScreen({ onStart }: StartScreenProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onStart(name.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 flex items-center justify-center p-4" style={{ backgroundColor: '#2d3142' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-blue-500 rounded-full mb-4">
            <Waves className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-6xl font-bold text-white mb-2 tracking-tight">
            Slither<span className="text-green-400">.io</span>
          </h1>
          <p className="text-slate-300 text-lg">
            Eat food, grow longer, and dominate the arena
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={15}
              className="w-full px-6 py-4 text-lg text-center bg-white/10 border-2 border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-green-400 focus:bg-white/20 transition-all backdrop-blur-sm"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full px-8 py-4 text-xl font-bold text-white bg-gradient-to-r from-green-500 to-blue-500 rounded-xl hover:from-green-600 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
          >
            Play Now
          </button>
        </form>

        <div className="mt-8 space-y-4">
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <h3 className="text-white font-bold mb-3 text-lg">How to Play</h3>
            <ul className="text-slate-300 space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Move your mouse to control snake direction</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Hold click to boost speed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Eat colorful food to grow longer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Avoid hitting other snakes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">•</span>
                <span>Trap other snakes to eliminate them</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
