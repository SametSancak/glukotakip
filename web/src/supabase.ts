import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xbctogjqvwbcdcqafxny.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhiY3RvZ2pxdndiY2RjcWFmeG55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1OTA2NTksImV4cCI6MjExMTE2NjY1OX0.AZ2O4v_PqxNo7au_Tk6GoC7K4d5-It0kibZD-iWSqT8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);