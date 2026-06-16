import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ==========================================
// ⚠️  SUPABASE CREDENTIALS
// Replace these with your own Supabase project URL and anon key.
// You can find them at: https://supabase.com/dashboard → Project Settings → API
// ==========================================
const SUPABASE_URL = 'https://zsydatrphekpaexjcrsa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzeWRhdHJwaGVrcGFleGpjcnNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTE5NDYsImV4cCI6MjA5NzE4Nzk0Nn0.yiTff5m1w_IeLWKTnACd9lakxo-df7gMflHjeIVkujc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
