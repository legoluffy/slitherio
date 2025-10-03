import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Player {
  id: string;
  name: string;
  score: number;
  position_x: number;
  position_y: number;
  angle: number;
  color: string;
  segments: Array<{ x: number; y: number }>;
  is_alive: boolean;
  last_updated: string;
}

export interface Food {
  id: string;
  position_x: number;
  position_y: number;
  color: string;
  value: number;
}
