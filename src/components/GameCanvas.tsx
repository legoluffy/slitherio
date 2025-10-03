import { useEffect, useRef, useState } from 'react';
import { supabase, Player, Food } from '../lib/supabase';

const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 5000;
const CELL_SIZE = 40;
const INITIAL_SNAKE_LENGTH = 10;
const SEGMENT_SPACING = 8;
const BASE_SPEED = 3;
const BOOST_SPEED = 6;

interface GameCanvasProps {
  playerName: string;
  onGameOver: (score: number) => void;
}

export default function GameCanvas({ playerName, onGameOver }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(INITIAL_SNAKE_LENGTH);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);

  const playerIdRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isBoostingRef = useRef(false);
  const animationFrameRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());

  const playerRef = useRef<Player | null>(null);
  const otherPlayersRef = useRef<Map<string, Player>>(new Map());
  const foodRef = useRef<Map<string, Food>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseDown = () => {
      isBoostingRef.current = true;
    };

    const handleMouseUp = () => {
      isBoostingRef.current = false;
    };

    window.addEventListener('resize', handleResize);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    initializeGame();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      cleanup();
    };
  }, [playerName]);

  const getRandomColor = () => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
      '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C06C84'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const initializeGame = async () => {
    const startX = Math.random() * (WORLD_WIDTH - 1000) + 500;
    const startY = Math.random() * (WORLD_HEIGHT - 1000) + 500;
    const color = getRandomColor();

    const segments: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
      segments.push({ x: startX - i * SEGMENT_SPACING, y: startY });
    }

    const { data, error } = await supabase
      .from('players')
      .insert({
        name: playerName,
        score: INITIAL_SNAKE_LENGTH,
        position_x: startX,
        position_y: startY,
        angle: 0,
        color,
        segments,
        is_alive: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating player:', error);
      return;
    }

    playerIdRef.current = data.id;
    playerRef.current = data;
    setScore(INITIAL_SNAKE_LENGTH);

    await loadFood();
    subscribeToChanges();
    startGameLoop();
  };

  const loadFood = async () => {
    const { data } = await supabase.from('food').select('*');
    if (data) {
      foodRef.current.clear();
      data.forEach(food => {
        foodRef.current.set(food.id, food);
      });
    }

    if (foodRef.current.size < 200) {
      await spawnFood(200 - foodRef.current.size);
    }
  };

  const spawnFood = async (count: number) => {
    const foodItems = [];
    for (let i = 0; i < count; i++) {
      foodItems.push({
        position_x: Math.random() * WORLD_WIDTH,
        position_y: Math.random() * WORLD_HEIGHT,
        color: getRandomColor(),
        value: 1,
      });
    }

    const { data } = await supabase.from('food').insert(foodItems).select();
    if (data) {
      data.forEach(food => {
        foodRef.current.set(food.id, food);
      });
    }
  };

  const subscribeToChanges = () => {
    supabase
      .channel('game-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          otherPlayersRef.current.delete(payload.old.id);
        } else {
          const player = payload.new as Player;
          if (player.id !== playerIdRef.current && player.is_alive) {
            otherPlayersRef.current.set(player.id, player);
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food' }, (payload) => {
        const food = payload.new as Food;
        foodRef.current.set(food.id, food);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'food' }, (payload) => {
        foodRef.current.delete(payload.old.id);
      })
      .subscribe();

    const loadOtherPlayers = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('is_alive', true)
        .neq('id', playerIdRef.current!);

      if (data) {
        otherPlayersRef.current.clear();
        data.forEach(player => {
          otherPlayersRef.current.set(player.id, player);
        });
      }
    };

    loadOtherPlayers();
    setInterval(loadOtherPlayers, 5000);

    const updateLeaderboard = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('is_alive', true)
        .order('score', { ascending: false })
        .limit(10);

      if (data) {
        setLeaderboard(data);
      }
    };

    updateLeaderboard();
    setInterval(updateLeaderboard, 2000);
  };

  const startGameLoop = () => {
    const gameLoop = () => {
      updateGame();
      renderGame();
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };
    gameLoop();
  };

  const updateGame = async () => {
    if (!playerRef.current || !playerIdRef.current) return;

    const now = Date.now();
    const deltaTime = (now - lastUpdateRef.current) / 16.67;
    lastUpdateRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const dx = mouseRef.current.x - centerX;
    const dy = mouseRef.current.y - centerY;
    const targetAngle = Math.atan2(dy, dx);

    playerRef.current.angle = targetAngle;

    const speed = (isBoostingRef.current ? BOOST_SPEED : BASE_SPEED) * deltaTime;

    const newX = playerRef.current.position_x + Math.cos(targetAngle) * speed;
    const newY = playerRef.current.position_y + Math.sin(targetAngle) * speed;

    playerRef.current.position_x = Math.max(50, Math.min(WORLD_WIDTH - 50, newX));
    playerRef.current.position_y = Math.max(50, Math.min(WORLD_HEIGHT - 50, newY));

    const newSegments = [{ x: playerRef.current.position_x, y: playerRef.current.position_y }];
    for (let i = 0; i < playerRef.current.segments.length - 1; i++) {
      const prev = newSegments[i] || playerRef.current.segments[i];
      const curr = playerRef.current.segments[i];
      const dx = prev.x - curr.x;
      const dy = prev.y - curr.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > SEGMENT_SPACING) {
        const ratio = SEGMENT_SPACING / dist;
        newSegments.push({
          x: prev.x - dx * ratio,
          y: prev.y - dy * ratio,
        });
      } else {
        newSegments.push(curr);
      }
    }

    playerRef.current.segments = newSegments;

    checkFoodCollision();
    checkPlayerCollision();

    if (now - (playerRef.current as any).lastSync > 100) {
      await supabase
        .from('players')
        .update({
          position_x: playerRef.current.position_x,
          position_y: playerRef.current.position_y,
          angle: playerRef.current.angle,
          segments: playerRef.current.segments,
          score: playerRef.current.score,
          last_updated: new Date().toISOString(),
        })
        .eq('id', playerIdRef.current);

      (playerRef.current as any).lastSync = now;
    }
  };

  const checkFoodCollision = () => {
    if (!playerRef.current) return;

    const headRadius = 10 + playerRef.current.score * 0.1;

    foodRef.current.forEach(async (food, id) => {
      const dx = playerRef.current!.position_x - food.position_x;
      const dy = playerRef.current!.position_y - food.position_y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < headRadius + 5) {
        playerRef.current!.score += food.value;
        setScore(playerRef.current!.score);

        await supabase.from('food').delete().eq('id', id);
        foodRef.current.delete(id);

        if (Math.random() < 0.5) {
          spawnFood(1);
        }
      }
    });
  };

  const checkPlayerCollision = () => {
    if (!playerRef.current) return;

    const headX = playerRef.current.position_x;
    const headY = playerRef.current.position_y;
    const headRadius = 10 + playerRef.current.score * 0.1;

    otherPlayersRef.current.forEach(other => {
      for (let i = 1; i < other.segments.length; i++) {
        const seg = other.segments[i];
        const dx = headX - seg.x;
        const dy = headY - seg.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const otherRadius = 8 + other.score * 0.08;

        if (dist < headRadius + otherRadius) {
          handleDeath();
          return;
        }
      }
    });

    for (let i = 3; i < playerRef.current.segments.length; i++) {
      const seg = playerRef.current.segments[i];
      const dx = headX - seg.x;
      const dy = headY - seg.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < headRadius) {
        handleDeath();
        return;
      }
    }
  };

  const handleDeath = async () => {
    if (!playerIdRef.current || !playerRef.current) return;

    const finalScore = playerRef.current.score;

    await supabase.from('players').delete().eq('id', playerIdRef.current);

    const segments = playerRef.current.segments;
    const foodFromDeath = segments.map(seg => ({
      position_x: seg.x + (Math.random() - 0.5) * 20,
      position_y: seg.y + (Math.random() - 0.5) * 20,
      color: getRandomColor(),
      value: 1,
    }));

    if (foodFromDeath.length > 0) {
      await supabase.from('food').insert(foodFromDeath);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    onGameOver(finalScore);
  };

  const renderGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || !playerRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cameraX = playerRef.current.position_x;
    const cameraY = playerRef.current.position_y;
    const offsetX = canvas.width / 2 - cameraX;
    const offsetY = canvas.height / 2 - cameraY;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#0f3460';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD_WIDTH; x += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x + offsetX, offsetY);
      ctx.lineTo(x + offsetX, WORLD_HEIGHT + offsetY);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += CELL_SIZE) {
      ctx.beginPath();
      ctx.moveTo(offsetX, y + offsetY);
      ctx.lineTo(WORLD_WIDTH + offsetX, y + offsetY);
      ctx.stroke();
    }

    foodRef.current.forEach(food => {
      ctx.fillStyle = food.color;
      ctx.beginPath();
      ctx.arc(food.position_x + offsetX, food.position_y + offsetY, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    otherPlayersRef.current.forEach(player => {
      renderSnake(ctx, player, offsetX, offsetY, false);
    });

    renderSnake(ctx, playerRef.current, offsetX, offsetY, true);
  };

  const renderSnake = (
    ctx: CanvasRenderingContext2D,
    player: Player,
    offsetX: number,
    offsetY: number,
    isCurrentPlayer: boolean
  ) => {
    const segments = player.segments;
    const baseRadius = 10 + player.score * 0.1;

    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const radius = baseRadius * (1 - i * 0.02 / segments.length);

      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(seg.x + offsetX, seg.y + offsetY, Math.max(radius, 8), 0, Math.PI * 2);
      ctx.fill();

      if (i > 0 && i < segments.length - 1) {
        ctx.strokeStyle = player.color;
        ctx.lineWidth = Math.max(radius, 8) * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(seg.x + offsetX, seg.y + offsetY);
        const next = segments[i + 1];
        ctx.lineTo(next.x + offsetX, next.y + offsetY);
        ctx.stroke();
      }
    }

    if (segments.length > 0) {
      const head = segments[0];

      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const eyeOffset = baseRadius * 0.4;
      const eyeSize = baseRadius * 0.2;
      const eyeAngle = player.angle + Math.PI / 6;

      ctx.beginPath();
      ctx.arc(
        head.x + offsetX + Math.cos(eyeAngle) * eyeOffset,
        head.y + offsetY + Math.sin(eyeAngle) * eyeOffset,
        eyeSize,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.beginPath();
      ctx.arc(
        head.x + offsetX + Math.cos(player.angle - Math.PI / 6) * eyeOffset,
        head.y + offsetY + Math.sin(player.angle - Math.PI / 6) * eyeOffset,
        eyeSize,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (!isCurrentPlayer) {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, head.x + offsetX, head.y + offsetY - baseRadius - 10);
      }
    }
  };

  const cleanup = async () => {
    if (playerIdRef.current) {
      await supabase.from('players').delete().eq('id', playerIdRef.current);
    }
    supabase.removeAllChannels();
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0" />

      <div className="absolute top-6 left-6 bg-black/70 text-white px-6 py-3 rounded-lg backdrop-blur-sm">
        <div className="text-sm opacity-75">Length</div>
        <div className="text-3xl font-bold">{score}</div>
      </div>

      <div className="absolute top-6 right-6 bg-black/70 text-white p-4 rounded-lg backdrop-blur-sm min-w-[250px]">
        <div className="text-xl font-bold mb-3 text-center border-b border-white/20 pb-2">
          Leaderboard
        </div>
        <div className="space-y-2">
          {leaderboard.map((player, index) => (
            <div
              key={player.id}
              className={`flex justify-between items-center text-sm ${
                player.id === playerIdRef.current ? 'text-yellow-400 font-bold' : ''
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="w-6 text-right font-bold">#{index + 1}</span>
                <span className="truncate max-w-[120px]">{player.name}</span>
              </span>
              <span className="font-mono">{player.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 text-white px-6 py-3 rounded-lg backdrop-blur-sm text-center">
        <div className="text-sm">Move: Mouse • Boost: Hold Click</div>
      </div>
    </div>
  );
}
