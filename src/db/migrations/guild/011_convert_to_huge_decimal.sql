-- Migration: Convert all numeric amounts to HugeDecimal JSON format
-- This ensures exact precision for all values and eliminates BigInt/number mixing
-- Schema-safe: Only converts existing tables/columns; no CREATE TABLE or column references that may not exist

-- Step 1: Migrate balances to HugeDecimal JSON format (if table exists and balance is not already TEXT)
-- For existing TEXT balances, we need to convert plain numbers to JSON format
-- Format: {"t":"hd","s":1,"m":"mantissa","sc":"0","e":"0"}

-- Note: Full balances migration moved to TS runner for safety (handles existence checks and type conversion)
