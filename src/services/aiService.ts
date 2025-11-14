import { api } from './api';

export interface ConversationalChatRequest {
  text: string;
  conversation_history?: { role: 'user' | 'assistant'; content: string }[];
  user_id?: string;
}

export interface ConversationalChatResponse {
  response_text: string;
  action: {
    type: string;
    device?: string;
    location?: string;
    state?: 'on' | 'off';
    [key: string]: any;
  } | null;
  conversation_history: { role: 'user' | 'assistant'; content: string }[];
  timestamp: string;
}

export const aiApi = {
  /**
   * Sends a message to the conversational AI.
   * @param data The chat request data.
   * @returns The AI's response.
   */
  postConversationalChat: (data: ConversationalChatRequest) => {
    return api.post<ConversationalChatResponse>('/ai/chat', data);
  },
};
