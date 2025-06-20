import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://amxzxzzzzbtbjzxihlpg.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteHp4enp6emJ0Ymp6eGlobHBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUzNzA5NjksImV4cCI6MjA2MDk0Njk2OX0.Fq8_EmVyC6PVTfuy9ls2wJnbmsmywC48dOxdXao3IWc'
export const supabase = createClient(supabaseUrl, supabaseKey)