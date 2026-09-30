-- RENTORA DATABASE MIGRATION SCHEMA SETUP
-- Copy and paste this script directly into your Supabase Dashboard SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STUDENT',
    course TEXT NOT NULL DEFAULT 'B.Tech',
    branch TEXT NOT NULL DEFAULT 'Not Set',
    year INT NOT NULL DEFAULT 1,
    college_name TEXT NOT NULL DEFAULT 'NIET Plot 19',
    avatar TEXT,
    bio TEXT DEFAULT '',
    rating_average DECIMAL(3, 2) DEFAULT 0.0,
    rating_count INT DEFAULT 0,
    completed_rentals INT DEFAULT 0,
    is_blocked BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    current_session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Listings Table
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    images TEXT[] DEFAULT ARRAY[]::TEXT[],
    condition TEXT NOT NULL,
    rental_price DECIMAL(10, 2) NOT NULL,
    price_unit TEXT NOT NULL DEFAULT 'DAY',
    security_deposit DECIMAL(10, 2) DEFAULT 0.0,
    availability BOOLEAN DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'PAUSED',
    approval_status TEXT NOT NULL DEFAULT 'PENDING',
    rejection_reason TEXT DEFAULT '',
    location TEXT NOT NULL,
    post_ip_address TEXT,
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    view_count INT DEFAULT 0,
    request_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Rental Requests Table
CREATE TABLE IF NOT EXISTS public.rental_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    renter_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    handover_otp TEXT,
    held_deposit DECIMAL(10, 2) DEFAULT 0.0,
    rental_price_paid DECIMAL(10, 2) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participants UUID[] NOT NULL,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    rental_request_id UUID REFERENCES public.rental_requests(id) ON DELETE SET NULL,
    last_message_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add Foreign Key for lastMessage inside Conversations (deferred to avoid circular dependency check during tables generation)
ALTER TABLE public.conversations 
ADD CONSTRAINT fk_conversations_last_message 
FOREIGN KEY (last_message_id) 
REFERENCES public.messages(id) 
ON DELETE SET NULL;

-- 7. Create OTPs Table
CREATE TABLE IF NOT EXISTS public.otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 9. Create Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    rental_request_id UUID NOT NULL REFERENCES public.rental_requests(id) ON DELETE CASCADE,
    rating INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Create Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Seed Default Categories Data
INSERT INTO public.categories (name, slug, description, icon, is_active) VALUES
('Books & Study Material', 'books-study-material', 'Academic books, notes, and preparation guides', 'BookOpen', true),
('Electronics & Technical', 'electronics-technical', 'Calculators, lab kits, components, and project gear', 'Cpu', true),
('Clothing & Accessories', 'clothing-accessories', 'Lab coats, formal wear, robes, and bags', 'Shirt', true),
('Sports Equipment', 'sports-equipment', 'Cricker bats, footballs, rackets, and athletic gear', 'Trophy', true),
('Gaming', 'gaming', 'Consoles, controllers, and game titles', 'Gamepad2', true),
('Other', 'other', 'Miscellaneous student utilities', 'Layers', true)
ON CONFLICT (slug) DO NOTHING;

-- 12. Create Product Interchanges Table (Exchanges/Rentals Handover Log)
CREATE TABLE IF NOT EXISTS public.product_interchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_email TEXT NOT NULL,
    renter_email TEXT NOT NULL,
    agreed_price DECIMAL(10, 2) NOT NULL,
    interchanged_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    rental_request_id UUID REFERENCES public.rental_requests(id) ON DELETE SET NULL
);

-- 13. Create Push Subscriptions Table (Web Push Offline Notifications)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


