// ============================================================================
// Supabase connection config.
// Only the ANON PUBLIC key goes here — this file is downloaded by every
// visitor's browser, so anything in it is effectively public. Never put the
// service_role key in this file or anywhere else in frontend code.
// ============================================================================

const SUPABASE_URL = "https://rcjcxykcepscsmmfkqvi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjamN4eWtjZXBzY3NtbWZrcXZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NDk0MjksImV4cCI6MjEwMjUyNTQyOX0.HCmmR6-D3w4ineo4vs7KUdqL03Ku3Ad6SY-QoTHWQWw";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);