const SUPABASE_URL = 'https://jgbevmpurdyhkbibatjy.supabase.co'; // Замени на свой URL
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmV2bXB1cmR5aGtiaWJhdGp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MDMyMDUsImV4cCI6MjA5OTI3OTIwNX0.17qogBz5NJAeP4ktCBn929R_X3U4Ch4C0AujN53sCwI'; // Замени на свой anon key

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);