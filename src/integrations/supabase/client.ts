import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Hardcoded to BusPay's own Supabase project
const SUPABASE_URL = "https://ipttskmwgormpiglhjmf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4M1eP-LOz9KXx5UFjSL05A_-U2U2dy8";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});