/**
 * Centralized API Configuration for CloudFusion
 * Automatically points to process.env.NEXT_PUBLIC_API_URL in production (e.g. Render)
 * and falls back to http://localhost:5000 for local development.
 */
export const API_BASE_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '')
    : 'http://localhost:5000');

export default API_BASE_URL;
