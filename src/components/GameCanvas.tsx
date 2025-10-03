import { useEffect, useRef, useState } from 'react';
import { supabase, Player, Food } from '../lib/supabase';

const WORLD_WIDTH = 5000;
const WORLD_HEIGHT = 5000;
const CELL_SIZE = 40;
const INITIAL_SNAKE_LENGTH = 22;
const SEGMENT_SPACING = 6;
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
  const boostParticlesRef = useRef<Array<{ x: number; y: number; life: number }>>([]);

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

    let speed = (isBoostingRef.current ? BOOST_SPEED : BASE_SPEED) * deltaTime;

    if (isBoostingRef.current && playerRef.current.score > INITIAL_SNAKE_LENGTH) {
      if (Math.random() < 0.3) {
        playerRef.current.score = Math.max(INITIAL_SNAKE_LENGTH, playerRef.current.score - 0.1);
        setScore(Math.floor(playerRef.current.score));
      }

      if (Math.random() < 0.5) {
        const tailSeg = playerRef.current.segments[Math.floor(playerRef.current.segments.length * 0.7)];
        if (tailSeg) {
          boostParticlesRef.current.push({
            x: tailSeg.x + (Math.random() - 0.5) * 10,
            y: tailSeg.y + (Math.random() - 0.5) * 10,
            life: 1.0
          });
        }
      }
    }

    boostParticlesRef.current = boostParticlesRef.current
      .map(p => ({ ...p, life: p.life - 0.02 }))
      .filter(p => p.life > 0);

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

    ctx.fillStyle = '#2b2d3a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawHexagonPattern(ctx, cameraX, cameraY, offsetX, offsetY, canvas.width, canvas.height);

    boostParticlesRef.current.forEach(particle => {
      const alpha = particle.life;
      const size = 3 * particle.life;
      ctx.fillStyle = `rgba(255, 255, 100, ${alpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(particle.x + offsetX, particle.y + offsetY, size, 0, Math.PI * 2);
      ctx.fill();
    });

    foodRef.current.forEach(food => {
      renderFood(ctx, food, offsetX, offsetY);
    });

    otherPlayersRef.current.forEach(player => {
      renderSnake(ctx, player, offsetX, offsetY, false);
    });

    renderSnake(ctx, playerRef.current, offsetX, offsetY, true);
  };

  const drawHexagonPattern = (
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number
  ) => {
    const hexSize = 55;
    const hexHeight = hexSize * Math.sqrt(3);
    const hexWidth = hexSize * 2;

    const startX = Math.floor((cameraX - width / 2) / (hexWidth * 0.75)) - 1;
    const endX = Math.ceil((cameraX + width / 2) / (hexWidth * 0.75)) + 1;
    const startY = Math.floor((cameraY - height / 2) / hexHeight) - 1;
    const endY = Math.ceil((cameraY + height / 2) / hexHeight) + 1;

    for (let row = startY; row <= endY; row++) {
      for (let col = startX; col <= endX; col++) {
        const x = col * hexWidth * 0.75;
        const y = row * hexHeight + (col % 2) * hexHeight / 2;

        const gradient = ctx.createRadialGradient(
          x + offsetX, y + offsetY, 0,
          x + offsetX, y + offsetY, hexSize
        );
        gradient.addColorStop(0, '#3a3d4f');
        gradient.addColorStop(0.7, '#32354a');
        gradient.addColorStop(1, '#2a2d3e');

        ctx.fillStyle = gradient;
        ctx.strokeStyle = '#42455a';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const hx = x + offsetX + hexSize * Math.cos(angle);
          const hy = y + offsetY + hexSize * Math.sin(angle);
          if (i === 0) {
            ctx.moveTo(hx, hy);
          } else {
            ctx.lineTo(hx, hy);
          }
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  };


  const renderFood = (
    ctx: CanvasRenderingContext2D,
    food: Food,
    offsetX: number,
    offsetY: number
  ) => {
    const x = food.position_x + offsetX;
    const y = food.position_y + offsetY;
    const radius = 5;

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
    gradient.addColorStop(0, food.color);
    gradient.addColorStop(0.4, food.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = food.color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };

  const renderSnake = (
    ctx: CanvasRenderingContext2D,
    player: Player,
    offsetX: number,
    offsetY: number,
    isCurrentPlayer: boolean
  ) => {
    const segments = player.segments;
    const baseRadius = 12 + player.score * 0.08;

    if (segments.length > 0) {
      const head = segments[0];
      const x = head.x + offsetX;
      const y = head.y + offsetY;

      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 3);
      glowGradient.addColorStop(0, `${player.color}80`);
      glowGradient.addColorStop(0.3, `${player.color}40`);
      glowGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, baseRadius * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const radius = Math.max(baseRadius * (1 - i * 0.008 / segments.length), 8);
      const x = seg.x + offsetX;
      const y = seg.y + offsetY;

      const bodyGradient = ctx.createRadialGradient(
        x - radius * 0.4, y - radius * 0.4, 0,
        x, y, radius * 1.2
      );
      const lighterColor = adjustColorBrightness(player.color, 50);
      bodyGradient.addColorStop(0, lighterColor);
      bodyGradient.addColorStop(0.5, player.color);
      bodyGradient.addColorStop(1, adjustColorBrightness(player.color, -30));

      ctx.fillStyle = bodyGradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();

      if (i % 2 === 0) {
        const highlightGradient = ctx.createRadialGradient(
          x - radius * 0.3, y - radius * 0.3, 0,
          x, y, radius * 0.7
        );
        highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
        highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlightGradient;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (segments.length > 0) {
      const head = segments[0];
      const x = head.x + offsetX;
      const y = head.y + offsetY;

      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 2.5;
      const eyeOffset = baseRadius * 0.52;
      const eyeSize = baseRadius * 0.28;
      const eyeAngle1 = player.angle + Math.PI / 5.5;
      const eyeAngle2 = player.angle - Math.PI / 5.5;

      const eye1X = x + Math.cos(eyeAngle1) * eyeOffset;
      const eye1Y = y + Math.sin(eyeAngle1) * eyeOffset;
      ctx.beginPath();
      ctx.arc(eye1X, eye1Y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.beginPath();
      ctx.arc(
        eye1X + Math.cos(player.angle) * eyeSize * 0.35,
        eye1Y + Math.sin(player.angle) * eyeSize * 0.35,
        eyeSize * 0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.beginPath();
      const eye2X = x + Math.cos(eyeAngle2) * eyeOffset;
      const eye2Y = y + Math.sin(eyeAngle2) * eyeOffset;
      ctx.arc(eye2X, eye2Y, eyeSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.beginPath();
      ctx.arc(
        eye2X + Math.cos(player.angle) * eyeSize * 0.35,
        eye2Y + Math.sin(player.angle) * eyeSize * 0.35,
        eyeSize * 0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();

      if (!isCurrentPlayer) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = 'white';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, x, y - baseRadius - 14);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    }
  };

  const adjustColorBrightness = (color: string, amount: number): string => {
    const hex = color.replace('#', '');
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + amount);
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + amount);
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + amount);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const renderMinimap = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx || !playerRef.current) return;

    ctx.fillStyle = 'rgba(30, 32, 42, 0.95)';
    ctx.fillRect(0, 0, 192, 192);

    const scaleX = 192 / WORLD_WIDTH;
    const scaleY = 192 / WORLD_HEIGHT;

    otherPlayersRef.current.forEach(player => {
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(
        player.position_x * scaleX,
        player.position_y * scaleY,
        2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    });

    ctx.fillStyle = '#7FFF00';
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      playerRef.current.position_x * scaleX,
      playerRef.current.position_y * scaleY,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, 190, 190);
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

      <div className="absolute bottom-3 left-3 text-white" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.8)', fontFamily: 'Arial, sans-serif' }}>
        <div className="text-sm font-normal" style={{ color: '#d0d0d0' }}>Your length: <span className="font-semibold" style={{ color: 'white' }}>{score}</span></div>
        {playerIdRef.current && leaderboard.length > 0 && (
          <div className="text-sm font-normal" style={{ color: '#d0d0d0' }}>
            Your rank: <span className="font-semibold" style={{ color: 'white' }}>{leaderboard.findIndex(p => p.id === playerIdRef.current) + 1 || '?'}</span> of <span className="font-semibold" style={{ color: 'white' }}>{leaderboard.length}</span>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 text-white min-w-[300px]" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
        <div className="text-3xl font-bold mb-3 text-center tracking-wide" style={{ fontFamily: 'Arial, sans-serif' }}>
          Leaderboard
        </div>
        <div className="space-y-0.5">
          {leaderboard.slice(0, 10).map((player, index) => {
            const isCurrentPlayer = player.id === playerIdRef.current;
            return (
              <div
                key={player.id}
                className={`flex justify-between items-center text-sm ${
                  isCurrentPlayer ? 'font-bold' : 'font-normal'
                }`}
                style={{
                  color: isCurrentPlayer ? '#7FFF00' : 'white',
                  opacity: isCurrentPlayer ? 1 : 0.85
                }}
              >
                <span className="flex items-center gap-2">
                  <span className="w-6 text-left text-xs">#{index + 1}</span>
                  <span className="truncate max-w-[160px]">{player.name}</span>
                </span>
                <span>{player.score}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 w-48 h-48 border-2 rounded overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', borderColor: 'rgba(255, 255, 255, 0.2)' }}>
        <canvas
          ref={(canvas) => {
            if (canvas && playerRef.current) {
              renderMinimap(canvas);
            }
          }}
          width={192}
          height={192}
          className="w-full h-full"
        />
        <div className="absolute bottom-1 right-2 text-white text-xs font-normal" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.9)', color: '#a0a0a0' }}>server 4164</div>
      </div>


    </div>
  );
}
