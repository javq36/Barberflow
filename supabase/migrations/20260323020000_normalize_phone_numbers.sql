-- Normalize existing Colombian phone numbers to E.164 format
-- Phones starting with '3' and 10 digits long → prepend '+57'
UPDATE customers 
SET phone = '+57' || phone 
WHERE phone IS NOT NULL 
  AND phone !~ '^\+' 
  AND phone ~ '^3[0-9]{9}$';

-- Also normalize user phones (barbers, owners)
UPDATE users 
SET phone = '+57' || phone 
WHERE phone IS NOT NULL 
  AND phone !~ '^\+' 
  AND phone ~ '^3[0-9]{9}$';

-- Reset the failed outbox message so it retries with the corrected phone
UPDATE whatsapp_outbox 
SET status = 0,  -- Pending
    retry_count = 0,
    last_error = NULL,
    processed_at = NULL,
    next_retry_at = NULL,
    customer_phone = '+57' || customer_phone
WHERE status = 3  -- Failed
  AND customer_phone !~ '^\+'
  AND customer_phone ~ '^3[0-9]{9}$';
