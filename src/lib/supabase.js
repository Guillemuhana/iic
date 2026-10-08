import { createClient } from '@supabase/supabase-js';
import { DEMO_URL, memoryStorage } from '../demo/mock';

const DEMO = import.meta.env.VITE_DEMO === '1';
const url = DEMO ? DEMO_URL : import.meta.env.VITE_SUPABASE_URL;
const key = DEMO ? 'demo-anon-key' : import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: !DEMO,
    storageKey: 'iic-tickets-auth',
    ...(DEMO ? { storage: memoryStorage } : {}),
  },
});
