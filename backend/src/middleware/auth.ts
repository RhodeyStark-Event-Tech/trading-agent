import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../lib/logger.js';

const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
const supabaseServiceKey = process.env['SUPABASE_SERVICE_KEY'] ?? '';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Create a temporary Supabase client with the user's token to verify it
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      logger.warn({ error: error?.message }, 'Auth token verification failed');
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    next();
  } catch (err) {
    logger.error({ err }, 'Auth middleware error');
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
};
