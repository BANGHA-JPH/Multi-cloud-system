import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    id?: string;
    email: string;
    role: string;
  };
}

export type AuthRequest = AuthenticatedRequest;

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401).json({ error: 'Access denied. Authentication token required.' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'cloudfusion_master_jwt_secret_key_32_bytes_min_prod';
    const decoded = jwt.verify(token, secret) as { userId: string; email: string; role: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired authentication token.' });
  }
}
