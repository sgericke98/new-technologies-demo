'use client'

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, MessageCircle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  id: string;
  seller_id: string;
  user_id: string;
  content: string;
  role: 'manager' | 'admin';
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
}

interface SellerChatProps {
  sellerId: string;
  sellerName: string;
}

export function SellerChat({ sellerId, sellerName }: SellerChatProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Fetch initial messages
  useEffect(() => {
    fetchMessages();
  }, [sellerId]);

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`seller_chat_${sellerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'seller_chat_messages',
          filter: `seller_id=eq.${sellerId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            try {
              const messageWithUser = await fetchUserInfo(payload.new as ChatMessage);
              setMessages(prev => {
                // Check if message already exists to avoid duplicates
                const exists = prev.some(msg => msg.id === messageWithUser.id);
                if (exists) return prev;
                return [...prev, messageWithUser];
              });
            } catch (error) {
              // Silently handle errors to avoid disrupting the chat experience
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => 
              prev.map(msg => 
                msg.id === payload.new.id ? { ...msg, ...payload.new } : msg
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(msg => msg.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sellerId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollAreaRef.current) {
        const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }
    };

    // Use setTimeout to ensure DOM is updated
    setTimeout(scrollToBottom, 100);
  }, [messages]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('seller_chat_messages')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch user information for each message
      const messagesWithUserInfo = await Promise.all(
        (data || []).map(async (message: any) => {
          return await fetchUserInfo(message);
        })
      );

      setMessages(messagesWithUserInfo);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInfo = async (message: ChatMessage): Promise<ChatMessage> => {
    try {
      const { data: userData } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', message.user_id)
        .single();

      return {
        ...message,
        user_name: userData?.name || 'Unknown User',
        user_email: userData?.email || '',
      };
    } catch (error) {
      return {
        ...message,
        user_name: 'Unknown User',
        user_email: '',
      };
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !profile?.id) return;

    const messageContent = newMessage.trim();

    try {
      setSending(true);
      const { data, error } = await (supabase as any)
        .from('seller_chat_messages')
        .insert({
          seller_id: sellerId,
          user_id: profile.id,
          content: messageContent,
          role: 'manager',
        })
        .select()
        .single();

      if (error) throw error;

      // Add the message to local state immediately for better UX
      const messageWithUser = await fetchUserInfo({
        ...data,
        user_name: profile.name || 'You',
        user_email: profile.email || '',
      });
      
      setMessages(prev => {
        // Check if message already exists to avoid duplicates
        const exists = prev.some(msg => msg.id === data.id);
        if (exists) return prev;
        return [...prev, messageWithUser];
      });

      // Show success toast
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully.",
        duration: 2000,
      });

      // Don't invalidate any queries for chat messages to avoid page re-renders
      // Chat messages are handled by real-time subscriptions and local state updates

      setNewMessage('');
    } catch (error) {
      toast({
        title: "Error sending message",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return `${Math.floor(diffInHours * 60)}m ago`;
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="h-[600px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Chat - {sellerName}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading messages...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Chat - {sellerName}
          <Badge variant="secondary" className="ml-auto">
            <Users className="h-3 w-3 mr-1" />
            {messages.length} messages
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea ref={scrollAreaRef} className="flex-1 px-6">
          <div className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage = message.user_id === profile?.id;
                const isAdmin = message.role === 'admin';
                
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-3",
                      isOwnMessage ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-xs",
                        isAdmin ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {getInitials(message.user_name || 'U')}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className={cn(
                      "flex flex-col max-w-[70%]",
                      isOwnMessage ? "items-end" : "items-start"
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {message.user_name}
                        </span>
                        <Badge 
                          variant={isAdmin ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {message.role}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(message.created_at)}
                        </span>
                      </div>
                      
                      <div
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm",
                          isOwnMessage
                            ? "bg-blue-600 text-white"
                            : isAdmin
                            ? "bg-red-50 text-red-900 border border-red-200"
                            : "bg-gray-100 text-gray-900"
                        )}
                      >
                        {message.content}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
        
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1"
              disabled={sending}
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              size="icon"
              className="shrink-0"
              title={sending ? "Sending..." : "Send message"}
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
