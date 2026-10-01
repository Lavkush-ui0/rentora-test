import { Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { CustomRequest } from '../types';
import { getIO } from '../services/socket.service';
import { createNotification } from '../services/notification.service';
import CustomError from '../utils/customError';
import logger from '../utils/logger';

export const createConversation = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { recipientId, listingId, rentalRequestId } = req.body;
    const currentUserId = req.user._id;

    if (recipientId === currentUserId) {
      throw new CustomError('You cannot start a conversation with yourself', 400, 'SELF_CONVERSATION_PROHIBITED');
    }

    const { data: recipient } = await supabase
      .from('users')
      .select('id')
      .eq('id', recipientId)
      .maybeSingle();

    if (!recipient) {
      throw new CustomError('Recipient user not found', 404, 'NOT_FOUND');
    }

    // Find all conversations containing req.user._id
    const { data: convos } = await supabase
      .from('conversations')
      .select('*');

    let conversation = (convos || []).find((c: any) =>
      c.participants.includes(currentUserId) &&
      c.participants.includes(recipientId) &&
      String(c.listing_id || '') === String(listingId || '')
    );

    if (!conversation) {
      const { data: newConvo, error: insertErr } = await supabase
        .from('conversations')
        .insert([{
          participants: [currentUserId, recipientId],
          listing_id: listingId || null,
          rental_request_id: rentalRequestId || null
        }])
        .select()
        .single();

      if (insertErr || !newConvo) {
        throw new CustomError('Failed to establish conversation', 500, 'CREATE_FAILED');
      }
      conversation = newConvo;
    }

    // Populate
    const { data: fullConvo } = await supabase
      .from('conversations')
      .select('*, listing:listing_id(id, title, images, rental_price, price_unit, status)')
      .eq('id', conversation.id)
      .single();

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, avatar, rating_average, is_blocked')
      .in('id', fullConvo.participants);

    const { data: lastMsg } = fullConvo.last_message_id ? await supabase
      .from('messages')
      .select('*')
      .eq('id', fullConvo.last_message_id)
      .maybeSingle() : { data: null };

    const populated = {
      _id: fullConvo.id,
      participants: (users || []).map((u: any) => ({
        _id: u.id,
        fullName: u.full_name,
        avatar: u.avatar,
        ratingAverage: Number(u.rating_average),
        isBlocked: u.is_blocked
      })),
      listing: fullConvo.listing ? {
        _id: fullConvo.listing.id,
        title: fullConvo.listing.title,
        images: fullConvo.listing.images,
        rentalPrice: Number(fullConvo.listing.rental_price),
        priceUnit: fullConvo.listing.price_unit,
        status: fullConvo.listing.status,
      } : null,
      lastMessage: lastMsg ? {
        _id: lastMsg.id,
        text: lastMsg.text,
        sender: lastMsg.sender_id,
        readAt: lastMsg.read_at,
        createdAt: lastMsg.created_at
      } : null,
      updatedAt: fullConvo.updated_at,
    };

    return res.status(201).json({
      success: true,
      conversation: populated,
    });
  } catch (error) {
    return next(error);
  }
};

export const getConversations = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const currentUserId = req.user._id;

    const { data: convos, error } = await supabase
      .from('conversations')
      .select('*, listing:listing_id(id, title, images, rental_price, price_unit)');

    if (error || !convos) {
      throw new CustomError('Failed to fetch chat channels', 500, 'FETCH_FAILED');
    }

    const myConvos = convos.filter((c: any) => c.participants.includes(currentUserId));

    const populatedConvos = await Promise.all(myConvos.map(async (c: any) => {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, avatar, rating_average, is_blocked')
        .in('id', c.participants);

      const { data: lastMsg } = c.last_message_id ? await supabase
        .from('messages')
        .select('*')
        .eq('id', c.last_message_id)
        .maybeSingle() : { data: null };

      return {
        _id: c.id,
        participants: (users || []).map((u: any) => ({
          _id: u.id,
          fullName: u.full_name,
          avatar: u.avatar,
          ratingAverage: Number(u.rating_average),
          isBlocked: u.is_blocked
        })),
        listing: c.listing ? {
          _id: c.listing.id,
          title: c.listing.title,
          images: c.listing.images,
          rentalPrice: Number(c.listing.rental_price),
          priceUnit: c.listing.price_unit,
        } : null,
        lastMessage: lastMsg ? {
          _id: lastMsg.id,
          text: lastMsg.text,
          sender: lastMsg.sender_id,
          readAt: lastMsg.read_at,
          createdAt: lastMsg.created_at
        } : null,
        updatedAt: c.updated_at,
      };
    }));

    // Sort by updatedAt descending
    populatedConvos.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return res.json({
      success: true,
      conversations: populatedConvos,
    });
  } catch (error) {
    return next(error);
  }
};

export const getConversationById = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { id } = req.params;
    const currentUserId = req.user._id;

    const { data: c, error } = await supabase
      .from('conversations')
      .select('*, listing:listing_id(id, title, images, rental_price, price_unit)')
      .eq('id', id)
      .maybeSingle();

    if (error || !c) {
      throw new CustomError('Conversation not found', 404, 'NOT_FOUND');
    }

    if (!c.participants.includes(currentUserId)) {
      throw new CustomError('You are not authorized to access this conversation', 403, 'FORBIDDEN');
    }

    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, avatar, rating_average, is_blocked')
      .in('id', c.participants);

    const { data: lastMsg } = c.last_message_id ? await supabase
      .from('messages')
      .select('*')
      .eq('id', c.last_message_id)
      .maybeSingle() : { data: null };

    const populated = {
      _id: c.id,
      participants: (users || []).map((u: any) => ({
        _id: u.id,
        fullName: u.full_name,
        avatar: u.avatar,
        ratingAverage: Number(u.rating_average),
        isBlocked: u.is_blocked,
      })),
      listing: c.listing ? {
        _id: c.listing.id,
        title: c.listing.title,
        images: c.listing.images,
        rentalPrice: Number(c.listing.rental_price),
        priceUnit: c.listing.price_unit,
      } : null,
      lastMessage: lastMsg ? {
        _id: lastMsg.id,
        text: lastMsg.text,
        sender: lastMsg.sender_id,
        readAt: lastMsg.read_at,
        createdAt: lastMsg.created_at,
      } : null,
      updatedAt: c.updated_at,
    };

    return res.json({
      success: true,
      conversation: populated,
    });
  } catch (error) {
    return next(error);
  }
};

export const getMessages = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: convo } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!convo) {
      throw new CustomError('Conversation not found', 404, 'NOT_FOUND');
    }

    const isParticipant = convo.participants.includes(req.user._id);
    if (!isParticipant) {
      throw new CustomError('You are not authorized to access this conversation', 403, 'FORBIDDEN');
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id (id, full_name, avatar)')
      .eq('conversation_id', convo.id)
      .order('created_at', { ascending: true });

    if (error || !messages) {
      throw new CustomError('Failed to fetch messages.', 500, 'FETCH_FAILED');
    }

    const formatted = messages.map((m: any) => ({
      _id: m.id,
      conversation: m.conversation_id,
      sender: m.sender ? {
        _id: m.sender.id,
        fullName: m.sender.full_name,
        avatar: m.sender.avatar,
      } : null,
      text: m.text,
      readAt: m.read_at,
      createdAt: m.created_at,
    }));

    return res.json({
      success: true,
      messages: formatted,
    });
  } catch (error) {
    return next(error);
  }
};

export const sendMessage = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { text } = req.body;
    if (!text || text.trim() === '') {
      throw new CustomError('Message content is required', 400, 'BAD_REQUEST');
    }

    const { data: convo } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!convo) {
      throw new CustomError('Conversation not found', 404, 'NOT_FOUND');
    }

    const currentUserId = req.user._id;

    const isParticipant = convo.participants.includes(currentUserId);
    if (!isParticipant) {
      throw new CustomError('You are not authorized to send messages here', 403, 'FORBIDDEN');
    }

    const otherParticipantId = convo.participants.find((p: string) => p !== currentUserId);

    const { data: otherUser } = await supabase
      .from('users')
      .select('is_blocked')
      .eq('id', otherParticipantId)
      .maybeSingle();

    if (otherUser && otherUser.is_blocked) {
      throw new CustomError('Cannot send message: Recipient account is blocked', 400, 'RECIPIENT_BLOCKED');
    }

    const { data: message, error: insertErr } = await supabase
      .from('messages')
      .insert([{
        conversation_id: convo.id,
        sender_id: currentUserId,
        text: text.trim()
      }])
      .select('*, sender:sender_id (id, full_name, avatar)')
      .single();

    if (insertErr || !message) {
      throw new CustomError('Failed to record message', 500, 'SEND_FAILED');
    }

    // Update conversation last_message_id and updated_at
    await supabase
      .from('conversations')
      .update({
        last_message_id: message.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', convo.id);

    const formattedMessage = {
      _id: message.id,
      conversation: message.conversation_id,
      sender: message.sender ? {
        _id: message.sender.id,
        fullName: message.sender.full_name,
        avatar: message.sender.avatar,
      } : null,
      text: message.text,
      createdAt: message.created_at,
    };

    // Broadcast message via Socket.IO room
    const io = getIO();
    if (io) {
      io.to(convo.id).emit('receiveMessage', formattedMessage);
      logger.info(`[Socket.IO] Broadcasted message to conversation room: ${convo.id}`);
    }

    // Send direct live notification to other user
    if (otherParticipantId) {
      await createNotification(
        otherParticipantId,
        'NEW_MESSAGE',
        `New Message from ${req.user.fullName}`,
        text.substring(0, 60) + (text.length > 60 ? '...' : ''),
        convo.id
      );
    }

    return res.status(201).json({
      success: true,
      message: formattedMessage,
    });
  } catch (error) {
    return next(error);
  }
};

export const markAsRead = async (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new CustomError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { data: convo } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!convo) {
      throw new CustomError('Conversation not found', 404, 'NOT_FOUND');
    }

    const currentUserId = req.user._id;

    const isParticipant = convo.participants.includes(currentUserId);
    if (!isParticipant) {
      throw new CustomError('You are not authorized', 403, 'FORBIDDEN');
    }

    const readAtDate = new Date().toISOString();
    await supabase
      .from('messages')
      .update({ read_at: readAtDate })
      .eq('conversation_id', convo.id)
      .neq('sender_id', currentUserId)
      .is('read_at', null);

    // Relay read receipt event via sockets
    const io = getIO();
    if (io) {
      io.to(convo.id).emit('messagesMarkedRead', {
        conversationId: convo.id,
        readAt: readAtDate,
      });
    }

    return res.json({
      success: true,
      message: 'Conversation messages marked as read',
    });
  } catch (error) {
    return next(error);
  }
};
