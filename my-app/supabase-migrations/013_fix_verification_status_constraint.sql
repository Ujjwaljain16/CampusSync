-- Fix verification_status constraint to ensure it accepts the correct values
-- Drop the existing constraint if it exists
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_verification_status_check;

-- Add the correct constraint with the expected values
ALTER TABLE certificates ADD CONSTRAINT certificates_verification_status_check 
CHECK (verification_status IN ('pending', 'verified', 'rejected'));

-- Update any existing invalid values to 'pending' as a fallback
UPDATE certificates 
SET verification_status = 'pending' 
WHERE verification_status NOT IN ('pending', 'verified', 'rejected');
