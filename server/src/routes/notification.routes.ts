import { Router } from 'express';
import {
  getNotifications,
  markAllAsRead,
  markOneAsRead,
  getPushPublicKey,
  subscribePush,
  unsubscribePush,
  sendTestPush,
} from '../controllers/notification.controller';
import { authenticateUser } from '../middleware/auth.middleware';

const router = Router();

// Web Push Public Key (accessible for client subscription registration)
router.get('/push/public-key', getPushPublicKey);

// Authenticated notification and push endpoints
router.use(authenticateUser);

router.get('/', getNotifications);
router.patch('/mark-read', markAllAsRead);
router.patch('/:id/read', markOneAsRead);

// Push subscription management
router.post('/push/subscribe', subscribePush);
router.post('/push/unsubscribe', unsubscribePush);
router.post('/push/test', sendTestPush);

export default router;

