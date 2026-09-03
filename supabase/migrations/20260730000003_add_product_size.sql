-- Add size column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS size TEXT;
