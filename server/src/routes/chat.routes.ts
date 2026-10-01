import { Router } from 'express';
import {
  createConversation,
  getConversations,
  getConversationById,
  getMessages,
  sendMessage,
  markAsRead,
} from '../controllers/chat.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// All chat routes are protected
router.use(authenticateUser);

router.post('/', createConversation);
router.get('/', getConversations);
router.get('/:id', getConversationById);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.patch('/:id/read', markAsRead);

export default router;
