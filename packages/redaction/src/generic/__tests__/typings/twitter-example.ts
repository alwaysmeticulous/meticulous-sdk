interface MediaEntity {
  type: "photo" | "video" | "animated_gif";
  media_key: string;
  url: string;
  preview_image_url?: string;
  duration_ms?: number;
  height: number;
  width: number;
  alt_text?: string;
}

interface URLEntity {
  url: string;
  expanded_url: string;
  display_url: string;
  unwound_url?: string;
  title?: string;
  description?: string;
}

export type Tweet = OriginalTweet | Quote;

export interface OriginalTweet {
  id: string;
  text: string;
  type: "tweet";
  details: {
    author_id: string;
    conversation_id: string;
    created_at: Date;
    in_reply_to_user_id?: string;
  } | null;
  referenced_tweets?: {
    type: "replied_to" | "quoted" | "retweeted";
    id: string;
  }[];
  entities?: {
    mentions: Array<{
      start: number;
      end: number;
      username: string;
      id: string;
    }>;
    hashtags?: Array<{
      id: number;
      start: number;
      end: number;
      tag: string;
    }>;
    urls: URLEntity[];
    media?: MediaEntity[];
  };
  metrics: Record<string, number>;
}

export interface Quote {
  id: string;
  text: string;
  type: "quote";
  author_id: string;
  conversation_id: string;
  created_at: string;
  quote_text: string;
}
