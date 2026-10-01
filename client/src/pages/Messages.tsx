import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { chatService } from '../services/chatService';
import { getImageUrl, getAvatarUrl } from '../utils/imageUrl';
import { Send, MessageCircle, ArrowLeft, ExternalLink, ShoppingBag } from 'lucide-react';

export const Messages: React.FC = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<any>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<any>(null);

  // Fetch conversations list
  const fetchConversations = useCallback(async () => {
    try {
      const res = await chatService.getConversations();
      if (res.data?.success) setConversations(res.data.conversations);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, []);

  // Handle URL query parameters (?recipient=...&listing=...) to create or navigate to conversation
  useEffect(() => {
    const recipientParam = searchParams.get('recipient');
    const listingParam = searchParams.get('listing');

    if (!conversationId && recipientParam && user) {
      const initConversation = async () => {
        try {
          const res = await chatService.createConversation({
            recipientId: recipientParam,
            listingId: listingParam || undefined,
          });
          if (res.data?.success && res.data.conversation?._id) {
            navigate(`/messages/${res.data.conversation._id}`, { replace: true });
          }
        } catch (err) {
          console.error('[Messages] Failed to initialize conversation:', err);
        }
      };
      initConversation();
    }
  }, [conversationId, searchParams, user, navigate]);

  // Set active conversation when ID or conversations list changes
  useEffect(() => {
    if (!conversationId) {
      setActiveConvo(null);
      return;
    }
    const convo = conversations.find((c) => c._id === conversationId);
    if (convo) {
      setActiveConvo(convo);
    } else {
      // Direct load (e.g. from notification link): fetch single conversation
      chatService
        .getConversation(conversationId)
        .then((res) => {
          if (res.data?.success && res.data.conversation) {
            setActiveConvo(res.data.conversation);
          }
        })
        .catch((err) => {
          console.warn('[Messages] Could not fetch single conversation:', err);
        });
    }
  }, [conversationId, conversations]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMsgs(true);
      try {
        const res = await chatService.getMessages(conversationId);
        if (res.data?.success) {
          setMessages(res.data.messages);
          await chatService.markAsRead(conversationId);
          window.dispatchEvent(new Event('unreadMessagesUpdated'));
          fetchConversations();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingMsgs(false);
      }
    };
    fetchMessages();
  }, [conversationId, fetchConversations]);

  // Socket: join conversation room & update real-time messages and conversation list
  useEffect(() => {
    if (socket && conversationId) {
      socket.emit('joinConversation', conversationId);

      socket.on('receiveMessage', (msg: any) => {
        if (msg.conversation === conversationId || msg.conversation?._id === conversationId) {
          setMessages((prev) => [...prev, msg]);
          chatService.markAsRead(conversationId)
            .then(() => window.dispatchEvent(new Event('unreadMessagesUpdated')))
            .catch(() => {});
        }
        fetchConversations();
      });

      socket.on('typing', ({ userName }: any) => {
        setTypingUser(userName);
        clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => setTypingUser(null), 3000);
      });

      socket.on('stopTyping', () => setTypingUser(null));

      return () => {
        socket.off('receiveMessage');
        socket.off('typing');
        socket.off('stopTyping');
      };
    }
  }, [socket, conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleTyping = () => {
    if (!socket || !conversationId || !user) return;
    socket.emit('typing', { conversationId, userName: user.fullName });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit('stopTyping', { conversationId });
    }, 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !conversationId || sending) return;
    setSending(true);
    try {
      await chatService.sendMessage(conversationId, text.trim());
      setText('');
      if (socket) socket.emit('stopTyping', { conversationId });
      fetchConversations();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const getOtherParticipant = (convo: any) => {
    return convo?.participants?.find((p: any) => p._id !== user?.id);
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 overflow-hidden">
      {/* Conversations Sidebar */}
      <div
        className={`flex flex-col border-r border-gray-100 dark:border-slate-800 ${
          conversationId ? 'hidden md:flex w-80 flex-shrink-0' : 'flex w-full md:w-80'
        }`}
      >
        <div className="p-4 border-b border-gray-100 dark:border-slate-800">
          <h2 className="text-lg font-black font-outfit text-gray-900 dark:text-gray-100">Messages</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{conversations.length} conversations</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingConvos ? (
            <div className="space-y-1 p-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center space-x-3 p-3 rounded-2xl">
                  <div className="h-11 w-11 rounded-full bg-gray-100 dark:bg-slate-800 flex-shrink-0"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 dark:bg-slate-800 rounded-full w-2/3"></div>
                    <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded-full w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length > 0 ? (
            <div className="p-2">
              {conversations.map((convo) => {
                const other = getOtherParticipant(convo);
                const isActive = conversationId === convo._id;
                const hasUnread =
                  convo.lastMessage &&
                  !convo.lastMessage.readAt &&
                  (convo.lastMessage.sender?._id !== user?.id && convo.lastMessage.sender !== user?.id);

                return (
                  <Link
                    key={convo._id}
                    to={`/messages/${convo._id}`}
                    className={`flex items-center space-x-3 p-3 rounded-2xl transition-all mb-1 ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={getAvatarUrl(other?.avatar, other?.fullName)}
                        alt={other?.fullName}
                        className="h-11 w-11 rounded-full border border-gray-100 dark:border-slate-700 object-cover flex-shrink-0"
                      />
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-primary-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p
                          className={`text-sm font-bold truncate ${
                            isActive ? 'text-primary-700 dark:text-primary-400' : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {other?.fullName || 'Rentora Student'}
                        </p>
                        {convo.lastMessage?.createdAt && (
                          <span className="text-[10px] text-gray-400">
                            {formatTime(convo.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5 font-medium">
                        {convo.lastMessage?.text || (convo.listing?.title ? `re: ${convo.listing.title}` : 'Started a conversation')}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-16 px-4">
              <MessageCircle className="h-12 w-12 mx-auto text-gray-200 dark:text-gray-700 mb-3" />
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No conversations yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Send a rental request to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat Window */}
      {conversationId ? (
        <div className="flex flex-col flex-1 min-w-0">
          {/* Chat Header */}
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Link to="/messages" className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                {activeConvo && (() => {
                  const other = getOtherParticipant(activeConvo);
                  return (
                    <div className="flex items-center space-x-3">
                      <img
                        src={getAvatarUrl(other?.avatar, other?.fullName)}
                        alt={other?.fullName}
                        className="h-10 w-10 rounded-full border border-gray-100 dark:border-slate-700 object-cover"
                      />
                      <div>
                        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                          {other?.fullName || 'Student'}
                        </p>
                        <p className="text-xs text-green-500 font-medium">Verified Student</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {activeConvo?.listing?._id && (
                <Link
                  to={`/listing/${activeConvo.listing._id}`}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-primary-50 dark:bg-primary-950/30 text-primary-600 dark:text-primary-400 text-xs font-bold rounded-xl hover:bg-primary-100 transition-all"
                >
                  <span>View Item</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>

            {/* Rich Listing Preview Header Banner */}
            {activeConvo?.listing && (
              <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-slate-800/60 rounded-2xl border border-gray-100 dark:border-slate-800">
                <div className="flex items-center space-x-3 min-w-0">
                  <img
                    src={getImageUrl(activeConvo.listing.images?.[0])}
                    alt={activeConvo.listing.title}
                    className="h-10 w-10 rounded-xl object-cover border border-gray-200 dark:border-slate-700 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                      {activeConvo.listing.title}
                    </p>
                    <p className="text-[11px] font-semibold text-primary-600 dark:text-primary-400">
                      ₹{activeConvo.listing.rentalPrice} / {activeConvo.listing.priceUnit?.toLowerCase()}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/listing/${activeConvo.listing._id}`}
                  className="p-2 text-gray-400 hover:text-primary-600 transition-colors"
                  title="View Item"
                >
                  <ShoppingBag className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Messages List */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {loadingMsgs ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
              </div>
            ) : messages.length > 0 ? (
              messages.map((msg) => {
                const isMe = msg.sender?._id === user?.id || msg.sender === user?.id;
                return (
                  <div key={msg._id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {!isMe && (
                      <img
                        src={getAvatarUrl(msg.sender?.avatar, msg.sender?.fullName)}
                        alt=""
                        className="h-7 w-7 rounded-full border border-gray-100 dark:border-slate-700 mr-2 self-end flex-shrink-0"
                      />
                    )}
                    <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-primary-600 text-white rounded-br-md shadow-sm'
                            : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 rounded-bl-md'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">
                        {formatTime(msg.createdAt)}
                        {isMe && msg.readAt && <span className="ml-1 text-primary-500">✓ read</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                Start the conversation!
              </div>
            )}

            {/* Typing Indicator */}
            {typingUser && (
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1 bg-gray-100 dark:bg-slate-800 px-4 py-2.5 rounded-2xl">
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '100ms' }}></div>
                  <div className="h-2 w-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
                </div>
                <span className="text-xs text-gray-400">{typingUser} is typing...</span>
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form onSubmit={handleSend} className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="Type a message..."
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  handleTyping();
                }}
                className="flex-1 bg-gray-50 dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 px-4 py-3 rounded-2xl border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-primary-500 text-sm"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="h-11 w-11 flex-shrink-0 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl flex items-center justify-center transition-all disabled:opacity-40 shadow-md shadow-primary-500/20"
              >
                {sending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <Send className="h-4.5 w-4.5" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <div className="text-center space-y-3">
            <div className="h-20 w-20 mx-auto bg-gray-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center">
              <MessageCircle className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            </div>
            <p className="font-bold text-gray-500 dark:text-gray-400">Select a conversation to chat</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
