import { supabase } from '@/integrations/supabase/client';

export interface ChatMessage {
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

export interface ChatMessageInsert {
  seller_id: string;
  user_id: string;
  content: string;
  role?: 'manager' | 'admin';
}

/**
 * Fetch all messages for a specific seller
 */
export async function getSellerChatMessages(sellerId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('seller_chat_messages')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Fetch user information for each message
    const messagesWithUserInfo = await Promise.all(
      (data || []).map(async (message: any) => {
        return await fetchUserInfoForMessage(message);
      })
    );

    return messagesWithUserInfo;
  } catch (error) {
    console.error('Error fetching seller chat messages:', error);
    throw error;
  }
}

/**
 * Send a new message to a seller's chat
 */
export async function sendChatMessage(messageData: ChatMessageInsert): Promise<ChatMessage> {
  try {
    const { data, error } = await (supabase as any)
      .from('seller_chat_messages')
      .insert({
        ...messageData,
        role: messageData.role || 'manager',
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch user info for the new message
    const messageWithUserInfo = await fetchUserInfoForMessage(data);
    return messageWithUserInfo;
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
}

/**
 * Update an existing chat message
 */
export async function updateChatMessage(
  messageId: string, 
  content: string
): Promise<ChatMessage> {
  try {
    const { data, error } = await (supabase as any)
      .from('seller_chat_messages')
      .update({ content })
      .eq('id', messageId)
      .select()
      .single();

    if (error) throw error;

    // Fetch user info for the updated message
    const messageWithUserInfo = await fetchUserInfoForMessage(data);
    return messageWithUserInfo;
  } catch (error) {
    console.error('Error updating chat message:', error);
    throw error;
  }
}

/**
 * Delete a chat message
 */
export async function deleteChatMessage(messageId: string): Promise<void> {
  try {
    const { error } = await (supabase as any)
      .from('seller_chat_messages')
      .delete()
      .eq('id', messageId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting chat message:', error);
    throw error;
  }
}

/**
 * Subscribe to real-time updates for a seller's chat
 */
export function subscribeToSellerChat(
  sellerId: string,
  onMessage: (message: ChatMessage) => void,
  onUpdate: (message: ChatMessage) => void,
  onDelete: (messageId: string) => void
) {
  const channel = (supabase as any)
    .channel(`seller_chat_${sellerId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'seller_chat_messages',
        filter: `seller_id=eq.${sellerId}`,
      },
      async (payload: any) => {
        if (payload.eventType === 'INSERT') {
          const messageWithUserInfo = await fetchUserInfoForMessage(payload.new as ChatMessage);
          onMessage(messageWithUserInfo);
        } else if (payload.eventType === 'UPDATE') {
          const messageWithUserInfo = await fetchUserInfoForMessage(payload.new as ChatMessage);
          onUpdate(messageWithUserInfo);
        } else if (payload.eventType === 'DELETE') {
          onDelete(payload.old.id);
        }
      }
    )
    .subscribe();

  return channel;
}

/**
 * Unsubscribe from real-time updates
 */
export function unsubscribeFromSellerChat(channel: any) {
  (supabase as any).removeChannel(channel);
}

/**
 * Fetch user information for a message
 */
async function fetchUserInfoForMessage(message: ChatMessage): Promise<ChatMessage> {
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
    console.error('Error fetching user info for message:', error);
    return {
      ...message,
      user_name: 'Unknown User',
      user_email: '',
    };
  }
}

/**
 * Get chat statistics for a seller
 */
export async function getSellerChatStats(sellerId: string): Promise<{
  totalMessages: number;
  uniqueUsers: number;
  lastMessageAt: string | null;
}> {
  try {
    const { data, error } = await (supabase as any)
      .from('seller_chat_messages')
      .select('user_id, created_at')
      .eq('seller_id', sellerId);

    if (error) throw error;

    const totalMessages = data?.length || 0;
    const uniqueUsers = new Set(data?.map((msg: any) => msg.user_id)).size;
    const lastMessageAt = data?.length > 0 
      ? data.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
      : null;

    return {
      totalMessages,
      uniqueUsers,
      lastMessageAt,
    };
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    throw error;
  }
}
