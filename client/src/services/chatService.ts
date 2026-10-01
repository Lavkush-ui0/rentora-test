import api from './api';

export const chatService = {
  createConversation: (
    recipientIdOrData: string | { recipientId: string; listingId?: string; rentalRequestId?: string },
    listingId?: string,
    rentalRequestId?: string
  ) => {
    if (typeof recipientIdOrData === 'object') {
      return api.post('/conversations', recipientIdOrData);
    }
    return api.post('/conversations', { recipientId: recipientIdOrData, listingId, rentalRequestId });
  },
  getConversations: () => api.get('/conversations'),
  getConversation: (conversationId: string) => api.get(`/conversations/${conversationId}`),
  getMessages: (conversationId: string) => api.get(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, text: string) =>
    api.post(`/conversations/${conversationId}/messages`, { text }),
  markAsRead: (conversationId: string) => api.patch(`/conversations/${conversationId}/read`),
};

export default chatService;
