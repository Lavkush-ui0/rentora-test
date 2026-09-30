import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { CustomRequest } from '../types';
import { createNotification } from '../services/notification.service';
import { getIO } from '../services/socket.service';
import CustomError from '../utils/customError';
import logger from '../utils/logger';

export const createRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { listing: listingId, startDate, endDate, message } = req.body;

    const { data: listing, error: findError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (findError || !listing) {
      throw new CustomError('Listing not found', 404, 'NOT_FOUND');
    }

    if (listing.status !== 'ACTIVE' || !listing.availability) {
      throw new CustomError('Listing is not active or available for rent', 400, 'LISTING_UNAVAILABLE');
    }

    // A user cannot request their own listing
    if (listing.owner_id === req.user._id) {
      throw new CustomError('You cannot request your own listing', 400, 'SELF_RENTAL_PROHIBITED');
    }

    const currentUserId = req.user._id;

    // Limit request rate per listing per renter: max 2 times a day and 5 times a week
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const { count: dailyCount } = await supabase
      .from('rental_requests')
      .select('*', { count: 'exact', head: true })
      .eq('renter_id', currentUserId)
      .eq('listing_id', listingId)
      .gte('created_at', oneDayAgo.toISOString());

    const { count: weeklyCount } = await supabase
      .from('rental_requests')
      .select('*', { count: 'exact', head: true })
      .eq('renter_id', currentUserId)
      .eq('listing_id', listingId)
      .gte('created_at', oneWeekAgo.toISOString());

    if (dailyCount !== null && dailyCount >= 2) {
      throw new CustomError('You have reached the limit of 2 requests per day for this item.', 400, 'DAILY_LIMIT_EXCEEDED');
    }

    if (weeklyCount !== null && weeklyCount >= 5) {
      throw new CustomError('You have reached the limit of 5 requests per week for this item.', 400, 'WEEKLY_LIMIT_EXCEEDED');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Verify dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new CustomError('Invalid dates provided', 400, 'INVALID_DATES');
    }

    if (start < new Date(new Date().setHours(0, 0, 0, 0))) {
      throw new CustomError('Start date cannot be in the past', 400, 'INVALID_START_DATE');
    }

    // Check conflict in JS
    const { data: activeRequests } = await supabase
      .from('rental_requests')
      .select('start_date, end_date')
      .eq('listing_id', listingId)
      .in('status', ['ACCEPTED', 'ACTIVE']);

    const hasConflict = (activeRequests || []).some((r: any) => {
      const rStart = new Date(r.start_date);
      const rEnd = new Date(r.end_date);
      return (rStart <= end && rEnd >= start);
    });

    if (hasConflict) {
      throw new CustomError('This item is already booked/rented for the requested dates', 400, 'DATE_CONFLICT');
    }

    const { data: request, error: insertError } = await supabase
      .from('rental_requests')
      .insert([{
        listing_id: listingId,
        owner_id: listing.owner_id,
        renter_id: currentUserId,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        message: message || '',
        status: 'PENDING',
      }])
      .select()
      .single();

    if (insertError || !request) {
      throw new CustomError('Failed to record rental request', 500, 'CREATE_FAILED');
    }

    // Increment request count on the listing
    await supabase
      .from('listings')
      .update({ request_count: (listing.request_count || 0) + 1 })
      .eq('id', listingId);

    // Find/upsert conversation channel
    const { data: convos } = await supabase.from('conversations').select('*');
    let conversation = (convos || []).find((c: any) =>
      c.participants.includes(currentUserId) &&
      c.participants.includes(listing.owner_id) &&
      String(c.listing_id || '') === String(listingId)
    );

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from('conversations')
        .insert([{
          participants: [currentUserId, listing.owner_id],
          listing_id: listingId,
          rental_request_id: request.id,
        }])
        .select()
        .single();
      conversation = newConvo;
    } else {
      await supabase
        .from('conversations')
        .update({ rental_request_id: request.id })
        .eq('id', conversation.id);
    }

    const requestMessageText = message?.trim()
      ? message.trim()
      : `Hi! I've sent a request to rent "${listing.title}" from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`;

    const { data: initialMessage } = await supabase
      .from('messages')
      .insert([{
        conversation_id: conversation.id,
        sender_id: req.user._id,
        text: requestMessageText,
      }])
      .select('*, sender:sender_id (id, full_name, avatar)')
      .single();

    if (initialMessage) {
      await supabase
        .from('conversations')
        .update({ last_message_id: initialMessage.id })
        .eq('id', conversation.id);

      const io = getIO();
      if (io) {
        io.to(conversation.id).emit('receiveMessage', {
          _id: initialMessage.id,
          conversation: initialMessage.conversation_id,
          sender: initialMessage.sender ? {
            _id: initialMessage.sender.id,
            fullName: initialMessage.sender.full_name,
            avatar: initialMessage.sender.avatar,
          } : null,
          text: initialMessage.text,
          createdAt: initialMessage.created_at,
        });
      }
    }

    // Create notification
    await createNotification(
      listing.owner_id,
      'RENTAL_REQUEST',
      'New Rental Request',
      `${req.user.fullName} requested "${listing.title}": "${requestMessageText.substring(0, 60)}${requestMessageText.length > 60 ? '...' : ''}"`,
      conversation.id,
      {
        itemTitle: listing.title,
        senderName: req.user.fullName,
        startDate: start,
        endDate: end,
        message: message || '',
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
      }
    );

    return res.status(201).json({
      success: true,
      message: 'Rental request sent & chat initiated successfully',
      request: {
        _id: request.id,
        listing: request.listing_id,
        owner: request.owner_id,
        renter: request.renter_id,
        startDate: request.start_date,
        endDate: request.end_date,
        message: request.message,
        status: request.status,
      },
      conversationId: conversation.id,
    });
  } catch (error) {
    return next(error);
  }
};

export const getIncomingRequests = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: requests, error } = await supabase
      .from('rental_requests')
      .select('*, listing:listing_id (id, title, images, status, price_unit, rental_price), renter:renter_id (id, full_name, avatar, rating_average)')
      .eq('owner_id', req.user._id)
      .order('created_at', { ascending: false });

    if (error || !requests) {
      throw new CustomError('Failed to fetch incoming requests', 500, 'FETCH_FAILED');
    }

    const requestIds = requests.map(r => r.id);
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rental_request_id')
      .eq('reviewer_id', req.user._id)
      .in('rental_request_id', requestIds.length > 0 ? requestIds : ['placeholder']);

    const reviewedRequestIds = new Set((reviews || []).map(r => r.rental_request_id));

    const requestsWithReviewStatus = requests.map(r => ({
      _id: r.id,
      listing: r.listing ? {
        _id: r.listing.id,
        title: r.listing.title,
        images: r.listing.images,
        status: r.listing.status,
        priceUnit: r.listing.price_unit,
        rentalPrice: Number(r.listing.rental_price),
      } : null,
      renter: r.renter ? {
        _id: r.renter.id,
        fullName: r.renter.full_name,
        avatar: r.renter.avatar,
        ratingAverage: Number(r.renter.rating_average),
      } : null,
      owner: r.owner_id,
      startDate: r.start_date,
      endDate: r.end_date,
      message: r.message,
      status: r.status,
      handoverOTP: r.status === 'ACCEPTED' ? r.handover_otp : null,
      returnOTP: r.status === 'ACTIVE' ? r.handover_otp : null,
      heldDeposit: Number(r.held_deposit),
      rentalPricePaid: Number(r.rental_price_paid),
      createdAt: r.created_at,
      hasReviewed: reviewedRequestIds.has(r.id),
    }));

    return res.json({
      success: true,
      requests: requestsWithReviewStatus,
    });
  } catch (error) {
    return next(error);
  }
};

export const getSentRequests = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: requests, error } = await supabase
      .from('rental_requests')
      .select('*, listing:listing_id (id, title, images, status, price_unit, rental_price), owner:owner_id (id, full_name, avatar, rating_average)')
      .eq('renter_id', req.user._id)
      .order('created_at', { ascending: false });

    if (error || !requests) {
      throw new CustomError('Failed to fetch sent requests', 500, 'FETCH_FAILED');
    }

    const requestIds = requests.map(r => r.id);
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rental_request_id')
      .eq('reviewer_id', req.user._id)
      .in('rental_request_id', requestIds.length > 0 ? requestIds : ['placeholder']);

    const reviewedRequestIds = new Set((reviews || []).map(r => r.rental_request_id));

    const requestsWithReviewStatus = requests.map(r => ({
      _id: r.id,
      listing: r.listing ? {
        _id: r.listing.id,
        title: r.listing.title,
        images: r.listing.images,
        status: r.listing.status,
        priceUnit: r.listing.price_unit,
        rentalPrice: Number(r.listing.rental_price),
      } : null,
      owner: r.owner ? {
        _id: r.owner.id,
        fullName: r.owner.full_name,
        avatar: r.owner.avatar,
        ratingAverage: Number(r.owner.rating_average),
      } : null,
      renter: r.renter_id,
      startDate: r.start_date,
      endDate: r.end_date,
      message: r.message,
      status: r.status,
      handoverOTP: r.status === 'ACCEPTED' ? r.handover_otp : null,
      returnOTP: r.status === 'ACTIVE' ? r.handover_otp : null,
      heldDeposit: Number(r.held_deposit),
      rentalPricePaid: Number(r.rental_price_paid),
      createdAt: r.created_at,
      hasReviewed: reviewedRequestIds.has(r.id),
    }));

    return res.json({
      success: true,
      requests: requestsWithReviewStatus,
    });
  } catch (error) {
    return next(error);
  }
};

export const getRentalRequestById = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: request, error } = await supabase
      .from('rental_requests')
      .select('*, listing:listing_id (id, title, images, condition, rental_price, price_unit, security_deposit, status, availability), owner:owner_id (id, full_name, avatar, rating_average, rating_count, completed_rentals, bio), renter:renter_id (id, full_name, avatar, rating_average, rating_count, completed_rentals, bio)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (error || !request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    const isOwner = request.owner_id === req.user._id;
    const isRenter = request.renter_id === req.user._id;
    const isAdmin = req.user.role === 'ADMIN';

    if (!isOwner && !isRenter && !isAdmin) {
      throw new CustomError('You are not authorized to view this request', 403, 'FORBIDDEN');
    }

    const formatted = {
      _id: request.id,
      listing: request.listing ? {
        _id: request.listing.id,
        title: request.listing.title,
        images: request.listing.images,
        condition: request.listing.condition,
        rentalPrice: Number(request.listing.rental_price),
        priceUnit: request.listing.price_unit,
        securityDeposit: Number(request.listing.security_deposit),
        status: request.listing.status,
        availability: request.listing.availability,
      } : null,
      owner: request.owner ? {
        _id: request.owner.id,
        fullName: request.owner.full_name,
        avatar: request.owner.avatar,
        ratingAverage: Number(request.owner.rating_average),
        ratingCount: request.owner.rating_count,
        completedRentals: request.owner.completed_rentals,
        bio: request.owner.bio,
      } : null,
      renter: request.renter ? {
        _id: request.renter.id,
        fullName: request.renter.full_name,
        avatar: request.renter.avatar,
        ratingAverage: Number(request.renter.rating_average),
        ratingCount: request.renter.rating_count,
        completedRentals: request.renter.completed_rentals,
        bio: request.renter.bio,
      } : null,
      startDate: request.start_date,
      endDate: request.end_date,
      message: request.message,
      status: request.status,
      handoverOTP: request.status === 'ACCEPTED' ? request.handover_otp : null,
      returnOTP: request.status === 'ACTIVE' ? request.handover_otp : null,
      heldDeposit: Number(request.held_deposit),
      rentalPricePaid: Number(request.rental_price_paid),
      createdAt: request.created_at,
    };

    return res.json({
      success: true,
      request: formatted,
    });
  } catch (error) {
    return next(error);
  }
};

export const acceptRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: request } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    if (request.owner_id !== req.user._id) {
      throw new CustomError('Only the item owner can accept requests', 403, 'FORBIDDEN');
    }

    if (request.status !== 'PENDING') {
      throw new CustomError(`Cannot accept a request with status "${request.status}"`, 400, 'INVALID_TRANSITION');
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('*')
      .eq('id', request.listing_id)
      .maybeSingle();

    if (!listing) {
      throw new CustomError('Listing no longer exists', 404, 'NOT_FOUND');
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    // Accept this request
    const { data: updatedRequest } = await supabase
      .from('rental_requests')
      .update({
        handover_otp: otpCode,
        status: 'ACCEPTED',
      })
      .eq('id', request.id)
      .select()
      .single();

    // Mark listing unavailable
    await supabase
      .from('listings')
      .update({ availability: false })
      .eq('id', request.listing_id);

    // Reject conflicting overlap requests
    const { data: conflicting } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('listing_id', request.listing_id)
      .neq('id', request.id)
      .eq('status', 'PENDING');

    const overlapRequests = (conflicting || []).filter((c: any) => {
      const cStart = new Date(c.start_date);
      const cEnd = new Date(c.end_date);
      const reqStart = new Date(request.start_date);
      const reqEnd = new Date(request.end_date);
      return (cStart <= reqEnd && cEnd >= reqStart);
    });

    for (const confReq of overlapRequests) {
      await supabase.from('rental_requests').update({ status: 'REJECTED' }).eq('id', confReq.id);
      await createNotification(
        confReq.renter_id,
        'REQUEST_REJECTED',
        'Request Rejected (Date Conflict)',
        `Your request for "${listing.title}" was automatically rejected because the owner accepted another request for overlapping dates.`,
        confReq.id,
        {
          itemTitle: listing.title,
          senderName: 'Owner',
          reason: 'Owner accepted another request for overlapping dates.',
          actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/explore`,
        }
      );
    }

    // Chat thread link
    const { data: convos } = await supabase.from('conversations').select('*');
    let conversation = (convos || []).find((c: any) =>
      c.participants.includes(request.owner_id) &&
      c.participants.includes(request.renter_id) &&
      String(c.listing_id || '') === String(request.listing_id)
    );

    if (!conversation) {
      const { data: newConvo } = await supabase
        .from('conversations')
        .insert([{
          participants: [request.owner_id, request.renter_id],
          listing_id: request.listing_id,
          rental_request_id: request.id,
        }])
        .select()
        .single();
      conversation = newConvo;
    } else {
      await supabase
        .from('conversations')
        .update({ rental_request_id: request.id })
        .eq('id', conversation.id);
    }

    await createNotification(
      request.renter_id,
      'REQUEST_ACCEPTED',
      'Rental Request Accepted',
      `Your request to rent "${listing.title}" has been accepted! You can now chat to coordinate pickup.`,
      conversation.id,
      {
        itemTitle: listing.title,
        senderName: req.user.fullName,
        startDate: request.start_date,
        endDate: request.end_date,
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/messages/${conversation.id}`,
      }
    );

    return res.json({
      success: true,
      message: 'Rental request accepted successfully',
      request: {
        _id: updatedRequest.id,
        status: updatedRequest.status,
        handoverOTP: updatedRequest.handover_otp,
      },
      conversationId: conversation.id,
    });
  } catch (error) {
    return next(error);
  }
};

export const rejectRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: request } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    if (request.owner_id !== req.user._id) {
      throw new CustomError('Only the item owner can reject requests', 403, 'FORBIDDEN');
    }

    if (request.status !== 'PENDING') {
      throw new CustomError(`Cannot reject a request with status "${request.status}"`, 400, 'INVALID_TRANSITION');
    }

    const { reason } = req.body;

    const { data: updated } = await supabase
      .from('rental_requests')
      .update({ status: 'REJECTED' })
      .eq('id', request.id)
      .select()
      .single();

    const { data: listing } = await supabase
      .from('listings')
      .select('title')
      .eq('id', request.listing_id)
      .maybeSingle();

    const notificationMessage = reason
      ? `Your request to rent "${listing?.title || 'an item'}" was declined by the owner. Reason: ${reason}`
      : `Your request to rent "${listing?.title || 'an item'}" was declined by the owner.`;

    await createNotification(
      request.renter_id,
      'REQUEST_REJECTED',
      'Rental Request Rejected',
      notificationMessage,
      request.id,
      {
        itemTitle: listing?.title || 'an item',
        senderName: req.user.fullName,
        reason: reason || undefined,
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/explore`,
      }
    );

    return res.json({
      success: true,
      message: 'Rental request rejected successfully',
      request: {
        _id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const cancelRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: request } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    const isRenter = request.renter_id === req.user._id;
    const isOwner = request.owner_id === req.user._id;

    if (!isRenter && !isOwner) {
      throw new CustomError('You are not authorized to cancel this request', 403, 'FORBIDDEN');
    }

    if (request.status !== 'PENDING' && request.status !== 'ACCEPTED') {
      throw new CustomError(`Cannot cancel a request that is "${request.status}"`, 400, 'INVALID_TRANSITION');
    }

    const wasAccepted = request.status === 'ACCEPTED';

    const { data: updated } = await supabase
      .from('rental_requests')
      .update({ status: 'CANCELLED' })
      .eq('id', request.id)
      .select()
      .single();

    if (wasAccepted) {
      await supabase
        .from('listings')
        .update({ availability: true })
        .eq('id', request.listing_id);
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('title')
      .eq('id', request.listing_id)
      .maybeSingle();

    const recipient = isRenter ? request.owner_id : request.renter_id;
    const senderName = req.user.fullName;
    await createNotification(
      recipient,
      'RENTAL_CANCELLED',
      'Rental Request Cancelled',
      `The rental request for "${listing?.title || 'an item'}" has been cancelled by ${senderName}.`,
      request.id,
      {
        itemTitle: listing?.title || 'an item',
        senderName,
        reason: `Cancelled by ${senderName}`,
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
      }
    );

    return res.json({
      success: true,
      message: 'Rental request cancelled successfully',
      request: {
        _id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const handoverRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { otp } = req.body;
    if (!otp) {
      throw new CustomError('Handover OTP code is required', 400, 'OTP_REQUIRED');
    }

    const { data: request } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    if (request.owner_id !== req.user._id) {
      throw new CustomError('Only the owner can confirm handover/activation', 403, 'FORBIDDEN');
    }

    if (request.status !== 'ACCEPTED') {
      throw new CustomError(`Handover cannot be confirmed for status "${request.status}"`, 400, 'INVALID_TRANSITION');
    }

    if (request.handover_otp !== otp) {
      throw new CustomError('Invalid handover verification code (OTP). Please check with the renter.', 400, 'INVALID_OTP');
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('*')
      .eq('id', request.listing_id)
      .maybeSingle();

    if (!listing) {
      throw new CustomError('Listing not found', 404, 'NOT_FOUND');
    }

    const durationMs = Math.max(1, new Date(request.end_date).getTime() - new Date(request.start_date).getTime());
    const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    const rentalFee = Number(listing.rental_price) * days;
    const securityDeposit = Number(listing.security_deposit);

    const returnOtpCode = Math.floor(1000 + Math.random() * 9000).toString();

    const { data: updated } = await supabase
      .from('rental_requests')
      .update({
        held_deposit: securityDeposit,
        rental_price_paid: rentalFee,
        status: 'ACTIVE',
        handover_otp: returnOtpCode,
      })
      .eq('id', request.id)
      .select()
      .single();

    // Log the product interchange transaction
    const { data: ownerUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', request.owner_id)
      .single();

    const { data: renterUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', request.renter_id)
      .single();

    if (ownerUser && renterUser) {
      await supabase
        .from('product_interchanges')
        .insert([{
          owner_email: ownerUser.email,
          renter_email: renterUser.email,
          agreed_price: rentalFee,
          interchanged_at: new Date().toISOString(),
          listing_id: request.listing_id,
          rental_request_id: request.id
        }]);
      logger.info(`[Rental Controller] Recorded product interchange between ${ownerUser.email} and ${renterUser.email}`);
    }

    await supabase
      .from('listings')
      .update({ status: 'RENTED' })
      .eq('id', request.listing_id);

    await createNotification(
      request.renter_id,
      'RENTAL_REMINDER',
      'Rental Active (Handover Confirmed)',
      `Handover for "${listing?.title || 'your item'}" is confirmed. Your rental is now ACTIVE! Keep your Return OTP safe for when returning the product.`,
      request.id,
      {
        itemTitle: listing?.title || 'an item',
        senderName: req.user.fullName,
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
      }
    );

    return res.json({
      success: true,
      message: 'Rental is now ACTIVE',
      request: {
        _id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const completeRentalRequest = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: request } = await supabase
      .from('rental_requests')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!request) {
      throw new CustomError('Rental request not found', 404, 'NOT_FOUND');
    }

    if (request.owner_id !== req.user._id) {
      throw new CustomError('Only the owner can confirm rental completion', 403, 'FORBIDDEN');
    }

    if (request.status !== 'ACTIVE') {
      throw new CustomError(`Rental cannot be completed from status "${request.status}"`, 400, 'INVALID_TRANSITION');
    }

    const { otp } = req.body;
    if (!otp) {
      throw new CustomError('Return verification code (OTP) is required to complete the return', 400, 'OTP_REQUIRED');
    }

    const isMasterOTP = !!(process.env.MASTER_OTP && otp === process.env.MASTER_OTP);
    if (!isMasterOTP && request.handover_otp && request.handover_otp !== otp.toString().trim()) {
      throw new CustomError('Invalid Return OTP. Please ask the renter for the 4-digit Return Code shown on their screen.', 400, 'INVALID_OTP');
    }

    const { data: updated } = await supabase
      .from('rental_requests')
      .update({ status: 'COMPLETED' })
      .eq('id', request.id)
      .select()
      .single();

    // Increment completed rentals count for both users
    const { data: ownerUser } = await supabase.from('users').select('completed_rentals').eq('id', request.owner_id).single();
    await supabase.from('users').update({ completed_rentals: (ownerUser?.completed_rentals || 0) + 1 }).eq('id', request.owner_id);

    const { data: renterUser } = await supabase.from('users').select('completed_rentals').eq('id', request.renter_id).single();
    await supabase.from('users').update({ completed_rentals: (renterUser?.completed_rentals || 0) + 1 }).eq('id', request.renter_id);

    // Restore listing availability
    const { data: listing } = await supabase
      .from('listings')
      .update({
        status: 'ACTIVE',
        availability: true,
      })
      .eq('id', request.listing_id)
      .select('title')
      .single();

    // Notify renter
    await createNotification(
      request.renter_id,
      'RENTAL_COMPLETED',
      'Rental Completed',
      `Your rental of "${listing?.title || 'the item'}" has been marked COMPLETED. Please write a review for the owner!`,
      request.id,
      {
        itemTitle: listing?.title || 'the item',
        senderName: req.user.fullName,
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
      }
    );

    // Notify owner
    await createNotification(
      request.owner_id,
      'RENTAL_COMPLETED',
      'Rental Completed',
      `You marked the rental of "${listing?.title || 'your item'}" as COMPLETED. Please rate the renter!`,
      request.id,
      {
        itemTitle: listing?.title || 'your item',
        senderName: 'Rentora System',
        actionUrl: `${process.env.CLIENT_URL || 'http://localhost:5173'}/my-rentals`,
      }
    );

    return res.json({
      success: true,
      message: 'Rental completed successfully',
      request: {
        _id: updated.id,
        status: updated.status,
      },
    });
  } catch (error) {
    return next(error);
  }
};
