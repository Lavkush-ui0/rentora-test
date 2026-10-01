import env from './env';

const resolveClientUrl = (url?: string): string => {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (!clean || clean.includes('vercel.app')) {
    return 'https://rentora.org.in';
  }
  return clean;
};

export const config = {
  PORT: env.PORT,
  MONGODB_URI: env.MONGODB_URI,
  JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
  CLIENT_URL: resolveClientUrl(env.CLIENT_URL),
  ALLOWED_EMAIL_DOMAIN: env.ALLOWED_EMAIL_DOMAIN,
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_KEY: env.SUPABASE_KEY,
  SMTP_HOST: env.SMTP_HOST,
  SMTP_PORT: env.SMTP_PORT,
  SMTP_USER: env.SMTP_USER,
  SMTP_PASS: env.SMTP_PASS,
  SMTP_SECURE: env.SMTP_SECURE,
  CLOUDINARY_CLOUD_NAME: env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: env.CLOUDINARY_API_SECRET,
  VAPID_PUBLIC_KEY: env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: env.VAPID_SUBJECT,
};
