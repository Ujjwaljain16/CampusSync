# Policy Recursion Fix

## Problem
You're getting this error: `infinite recursion detected in policy for relation "user_roles"`

This happens when Row Level Security (RLS) policies reference themselves, creating a circular dependency.

## Quick Fix

### Option 1: Run the Fix Script
```bash
cd my-app
node scripts/fix-policy-recursion.js
```

### Option 2: Manual SQL Fix
1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Run this SQL:

```sql
-- Complete fix for infinite recursion in user_roles policies
-- Step 1: Drop all existing policies
DROP POLICY IF EXISTS "Users can read their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can read all roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

-- Step 2: Disable RLS temporarily to break the recursion
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;

-- Step 3: Drop the problematic function if it exists
DROP FUNCTION IF EXISTS is_admin();

-- Step 4: Create a simple admin check function that doesn't cause recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get the user's role directly without using policies
  SELECT role INTO user_role 
  FROM user_roles 
  WHERE user_id = auth.uid();
  
  RETURN user_role = 'admin';
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Re-enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Step 6: Create simple, non-recursive policies
-- Policy: Users can read their own role
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can read all roles
CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (is_admin());

-- Policy: Admins can insert roles
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (is_admin());

-- Policy: Admins can update roles
CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (is_admin());

-- Policy: Admins can delete roles
CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (is_admin());

-- Step 7: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON user_roles TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
```

## What This Fix Does

1. **Removes problematic policies** that cause recursion
2. **Temporarily disables RLS** to break the circular dependency
3. **Creates a safe admin check function** that doesn't trigger policies
4. **Re-enables RLS** with non-recursive policies
5. **Sets proper permissions** for authenticated users

## After the Fix

1. Refresh your setup page at [http://localhost:3000/setup](http://localhost:3000/setup)
2. The diagnostic should now show "Database: Ready"
3. Continue with creating your first admin account

## Why This Happened

The original policies were trying to check if a user is an admin by querying the `user_roles` table, but the policies themselves were protecting that table, creating an infinite loop:

```
Policy checks if user is admin → Queries user_roles table → Triggers policy → Checks if user is admin → ...
```

The fix uses a `SECURITY DEFINER` function that bypasses RLS policies, breaking the recursion.
