// User-related types
export type UserVerificationType = "blue" | "business" | "government" | "none";

interface TwitterUser {
  id: string;
  username: string;
  display_name: string;
  verified: boolean;
  verification_type: UserVerificationType;
  created_at: Date;
  description: string | null;
  location: string | null;
  url: string | null;
  protected: boolean;
  followers_count: number;
  following_count: number;
  tweet_count: number;
  listed_count: number;
}

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

// Search and filtering types
type ResultType = "mixed" | "recent" | "popular";

interface SearchParameters {
  query: string;
  max_results?: number;
  result_type?: ResultType;
  lang?: string;
  until?: string;
  since_id?: string;
  max_id?: string;
  include_entities?: boolean;
}

// API response types
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    result_count: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
    previous_token?: string;
  };
  includes?: {
    users?: TwitterUser[];
    tweets?: Tweet[];
    media?: MediaEntity[];
  };
}

// API endpoint function types
interface TwitterAPIEndpoints {
  getTweet(id: string): Promise<{ data: Tweet }>;
  getUserByUsername(username: string): Promise<{ data: TwitterUser }>;
  search(params: SearchParameters): Promise<PaginatedResponse<Tweet>>;
  postTweet(data: {
    text: string;
    reply?: { in_reply_to_tweet_id: string };
  }): Promise<{ data: Tweet }>;
  deleteTweet(id: string): Promise<void>;
}
