import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'cloudfusion_master_jwt_secret_key_32_bytes_min_prod';
const BCRYPT_SALT_ROUNDS = 12;

// Zod Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  recaptchaToken: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential token is required'),
});

// Helper function to set authentication httpOnly cookies
function setAuthCookie(res: Response, token: string) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Helper function to verify Google reCAPTCHA v3 tokens
async function verifyRecaptchaToken(token?: string): Promise<boolean> {
  const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6LeIxAcTAAAAAGG-vFI1TnRW8mzNF655A-B3qX6r';
  if (!token) return true; // Standard checkbox fallback

  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
    });
    const data: any = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return true; // Graceful fallback
  }
}

// 1. User Registration
export async function registerUser(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({ error: errorMsg });
      return;
    }

    const { email, password, name, recaptchaToken } = parseResult.data;

    // Verify reCAPTCHA token
    const isHuman = await verifyRecaptchaToken(recaptchaToken);
    if (!isHuman) {
      res.status(400).json({ error: 'reCAPTCHA verification failed. Bot request detected.' });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: 'USER',
        storageQuota: {
          create: {
            totalQuotaBytes: BigInt(55834574848), // 52 GB
            usedQuotaBytes: BigInt(0),
          },
        },
        auditLogs: {
          create: {
            action: 'USER_REGISTER',
            details: `User registered with email ${email}`,
            ipAddress: req.ip || '127.0.0.1',
          },
        },
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const token = jwt.sign(
      { userId: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(res, token);

    res.status(201).json({
      message: 'User account registered successfully.',
      token,
      user: newUser,
    });
  } catch (error: any) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Server error during user registration.' });
  }
}

// 2. User Login
export async function loginUser(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({ error: errorMsg });
      return;
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    // Log login event
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        details: 'Successful login session started',
        ipAddress: req.ip || '127.0.0.1',
      },
    });

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(res, token);

    res.status(200).json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error: any) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Server error during authentication.' });
  }
}

// 3. User Logout
export async function logoutUser(_req: Request, res: Response): Promise<void> {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  res.status(200).json({ message: 'Logged out successfully.' });
}

// 4. Get Authenticated User Profile
export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, role: true, isMfaEnabled: true, createdAt: true },
    });

    if (!user) {
      res.status(440).json({ error: 'User profile not found.' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user profile.' });
  }
}

// 5. Google OAuth Authentication
export async function googleOAuth(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = googleAuthSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid Google OAuth credential.' });
      return;
    }

    // Decode Google ID Token (Payload extraction)
    const { credential } = parseResult.data;
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const googlePayload = JSON.parse(jsonPayload);

    const email = googlePayload.email;
    const name = googlePayload.name || googlePayload.given_name || 'Google User';

    if (!email) {
      res.status(400).json({ error: 'Unable to verify email from Google account.' });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const dummyPasswordHash = await bcrypt.hash(Math.random().toString(36), BCRYPT_SALT_ROUNDS);
      user = await prisma.user.create({
        data: {
          email,
          passwordHash: dummyPasswordHash,
          name,
          role: 'USER',
          storageQuota: {
            create: {
              totalQuotaBytes: BigInt(55834574848),
              usedQuotaBytes: BigInt(0),
            },
          },
          auditLogs: {
            create: {
              action: 'USER_REGISTER',
              details: `User registered via Google OAuth (${email})`,
              ipAddress: req.ip || '127.0.0.1',
            },
          },
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    setAuthCookie(res, token);

    res.status(200).json({
      message: 'Google authentication successful.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Google OAuth Error:', error);
    res.status(500).json({ error: 'Google authentication failed.' });
  }
}
