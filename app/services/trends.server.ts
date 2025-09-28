import type {
  DiscoverCategoryVariables,
  EpisodeLengthRangeInput,
  PodcastCategoryTrend,
  PodcastEpisode,
  PodcastTrendSnapshot
} from "../types/podcast";

const PODCHASER_GRAPHQL_ENDPOINT = "https://api.podchaser.com/graphql";

const ACCESS_TOKEN_MUTATION = /* GraphQL */ `
  mutation RequestAccessToken($client_id: String!, $client_secret: String!) {
    requestAccessToken(
      input: {
        grant_type: CLIENT_CREDENTIALS
        client_id: $client_id
        client_secret: $client_secret
      }
    ) {
      access_token
      expires_in
      token_type
    }
  }
`;

const DISCOVER_CATEGORY_QUERY = /* GraphQL */ `
  query DiscoverCategory(
    $searchTerm: String!
    $episodeCount: Int!
    $recentSince: DateTime
    $maxLengthRange: [RangeInput!]
  ) {
    podcasts(
      searchTerm: $searchTerm
      filters: { language: "en" }
      sort: { sortBy: DATE_OF_FIRST_EPISODE, direction: DESCENDING }
      first: 10
      page: 0
    ) {
      data {
        id
        title
        description
        imageUrl
        webUrl
        url
        ratingAverage
        ratingCount
        episodes(
          first: $episodeCount
          sort: { sortBy: AIR_DATE, direction: DESCENDING }
          filters: { airDate: { from: $recentSince }, length: $maxLengthRange }
        ) {
          data {
            id
            title
            description
            airDate
            audioUrl
            webUrl
            url
            imageUrl
            explicit
          }
        }
      }
    }
  }
`;

const CATEGORY_CONFIG = [
  {
    id: "technology",
    name: "テクノロジー",
    summary:
      "シリコンバレーの最新動向やAIトレンドを追うテック系人気番組から厳選。",
    searchTerm: "technology"
  },
  {
    id: "news",
    name: "ニュース",
    summary:
      "米国内外で話題の政治・経済ニュースを深掘りするジャーナル番組。",
    searchTerm: "us politics news"
  },
  {
    id: "business",
    name: "ビジネス",
    summary:
      "起業・マーケティング・戦略を扱うビジネスリーダー必聴の最新エピソード。",
    searchTerm: "business leadership"
  },
  {
    id: "health_fitness",
    name: "ヘルス＆フィットネス",
    summary:
      "ウェルビーイングやメンタルヘルス、最新フィットネストレンドを学べる番組。",
    searchTerm: "health fitness"
  },
  {
    id: "culture",
    name: "カルチャー",
    summary:
      "ポップカルチャーから社会問題まで、アメリカ文化を多角的に捉える番組を紹介。",
    searchTerm: "society culture"
  }
] as const;

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

const snapshotCache = new Map<number, { expiresAt: number; snapshot: PodcastTrendSnapshot }>();

let cachedToken: {
  token: string;
  expiresAt: number;
} | null = null;

interface AccessTokenResult {
  requestAccessToken?: {
    access_token: string;
    expires_in?: number;
  };
}

interface PodchaserEpisode {
  id: string;
  title: string;
  description?: string | null;
  airDate?: string | null;
  audioUrl?: string | null;
  webUrl?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  explicit: boolean;
}

interface PodchaserPodcast {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  webUrl?: string | null;
  url?: string | null;
  ratingAverage?: number | null;
  ratingCount?: number | null;
  episodes?: {
    data: PodchaserEpisode[];
  } | null;
}

interface DiscoverCategoryResult {
  podcasts?: {
    data: PodchaserPodcast[];
  } | null;
}

async function getPodchaserAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const clientId = process.env.PODCHASER_API_KEY;
  const clientSecret = process.env.PODCHASER_API_SECRET;

  if (!clientId || !clientSecret) {
    console.warn("Podchaser credentials are not configured; serving fallback trends.");
    throw new Error("Podchaser credentials are not configured");
  }

  const response = await fetch(PODCHASER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: ACCESS_TOKEN_MUTATION,
      variables: {
        client_id: clientId,
        client_secret: clientSecret
      }
    })
  });

  const payload = (await response.json()) as {
    data?: AccessTokenResult;
    errors?: { message?: string }[];
  };

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join(", ");
    console.warn(
      "Podchaser token request failed",
      message ?? response.status
    );
    throw new Error(
      message ? `Podchaser token request failed: ${message}` : `Podchaser token request failed with ${response.status}`
    );
  }

  const tokenData = payload.data?.requestAccessToken;
  if (!tokenData?.access_token) {
    console.warn("Podchaser token response missing access_token");
    throw new Error("Podchaser token response missing access_token");
  }

  const expiresInSeconds = typeof tokenData.expires_in === "number" ? tokenData.expires_in : 3600;
  const safetyWindowMs = 60 * 1000;

  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000 - safetyWindowMs
  };

  return cachedToken.token;
}

async function executePodchaserQuery<T, V extends object>(
  query: string,
  variables: V,
  token: string
): Promise<T> {
  const response = await fetch(PODCHASER_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = (await response.json()) as {
    data?: T;
    errors?: { message?: string }[];
  };

  if (!response.ok || payload.errors?.length) {
    const message = payload.errors?.map((error) => error.message).join(", ");
    console.warn(
      "Podchaser query failed",
      message ?? response.status,
      { queryExcerpt: query.slice(0, 80), variables }
    );
    throw new Error(
      message ? `Podchaser query failed: ${message}` : `Podchaser query failed with ${response.status}`
    );
  }

  if (!payload.data) {
    console.warn("Podchaser response missing data", { variables });
    throw new Error("Podchaser response missing data");
  }

  return payload.data;
}

function mapEpisode(
  episode: PodchaserEpisode,
  podcast: PodchaserPodcast,
  index: number
): PodcastEpisode {
  const airDate = episode.airDate ? new Date(episode.airDate) : null;
  const airTime = airDate?.getTime() ?? Date.now();
  const now = Date.now();
  const daysSince = Math.max(0, (now - airTime) / (1000 * 60 * 60 * 24));
  const recencyScore = Math.max(0, 60 - daysSince * 4);
  const ratingBase = (podcast.ratingAverage ?? 4) * 8;
  const countBonus = Math.min(20, (podcast.ratingCount ?? 0) / 500);
  const indexPenalty = index * 6;
  const rawScore = recencyScore + ratingBase + countBonus + 20 - indexPenalty;
  const popularityScore = Math.max(10, Math.min(100, Math.round(rawScore)));

  return {
    id: episode.id,
    title: episode.title,
    description: episode.description ?? "",
    audioUrl: episode.audioUrl ?? undefined,
    podcastTitle: podcast.title,
    podcastId: podcast.id,
    imageUrl: episode.imageUrl ?? podcast.imageUrl ?? undefined,
    thumbnailUrl: episode.imageUrl ?? podcast.imageUrl ?? undefined,
    sourceUrl: episode.webUrl ?? episode.url ?? podcast.webUrl ?? podcast.url ?? undefined,
    releaseDate: airDate ? airDate.toISOString() : new Date().toISOString(),
    explicit: Boolean(episode.explicit),
    popularityScore
  };
}

async function buildCategoryTrend(
  category: (typeof CATEGORY_CONFIG)[number],
  token: string,
  maxDurationSeconds?: number
): Promise<PodcastCategoryTrend> {
  try {
    const twoDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 2);
    const variables: DiscoverCategoryVariables = {
      searchTerm: category.searchTerm,
      episodeCount: 3,
      recentSince: twoDaysAgo.toISOString()
    };

    if (typeof maxDurationSeconds === "number") {
      const range: EpisodeLengthRangeInput = { max: Math.max(0, Math.floor(maxDurationSeconds)) };
      variables.maxLengthRange = [range];
    }

    const data = await executePodchaserQuery<DiscoverCategoryResult, DiscoverCategoryVariables>(
      DISCOVER_CATEGORY_QUERY,
      variables,
      token
    );

    const podcasts = data.podcasts?.data ?? [];
    const podcastWithEpisodes = podcasts.find((item) => item.episodes?.data?.length) ?? podcasts[0];

    if (!podcastWithEpisodes?.episodes?.data?.length) {
      console.warn(
        "No Podchaser episodes found within constraints; falling back",
        category.id,
        {
          podcastCount: podcasts.length,
          maxDurationSeconds
        }
      );
      return fallbackCategoryTrend(category.id);
    }

    const episodes = podcastWithEpisodes.episodes.data.slice(0, 3);

    return {
      id: category.id,
      name: category.name,
      summary: category.summary,
      sampleEpisodes: episodes.map((episode, index) =>
        mapEpisode(episode, podcastWithEpisodes, index)
      ),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("Failed to fetch Podchaser data", category.id, error);
    return fallbackCategoryTrend(category.id);
  }
}

const FALLBACK_SNAPSHOT: PodcastTrendSnapshot = {
  generatedAt: new Date().toISOString(),
  categories: CATEGORY_CONFIG.map((config, configIndex) => ({
    id: config.id,
    name: config.name,
    summary: config.summary,
    updatedAt: new Date().toISOString(),
    sampleEpisodes: [
      {
        id: `${config.id}-ep-1`,
        title: "サンプルエピソード 1",
        description:
          "Podchaser APIの認証情報が未設定、または直近48時間に該当カテゴリでエピソードが見つからなかったため、サンプルデータを表示しています。環境変数にAPIキーを追加し、条件を満たす番組があると最新トレンドが取得されます。",
        audioUrl: undefined,
        podcastTitle: `デモポッドキャスト ${configIndex + 1}`,
        podcastId: `${config.id}-podcast`,
        imageUrl: undefined,
        thumbnailUrl: undefined,
        sourceUrl: undefined,
        releaseDate: new Date(Date.now() - configIndex * 86400000).toISOString(),
        explicit: false,
        popularityScore: 50 + configIndex * 5
      }
    ]
  }))
};

function fallbackCategoryTrend(categoryId: string): PodcastCategoryTrend {
  const fallback = FALLBACK_SNAPSHOT.categories.find(
    (category) => category.id === categoryId
  );
  if (!fallback) {
    throw new Error(`Fallback data missing for category ${categoryId}`);
  }

  return {
    ...fallback,
    updatedAt: new Date().toISOString()
  };
}

export async function getPodcastTrends(
  {
    forceRefresh = false,
    maxDurationSeconds
  }: { forceRefresh?: boolean; maxDurationSeconds?: number } = {}
): Promise<PodcastTrendSnapshot> {
  const now = Date.now();
  const cacheKey = maxDurationSeconds ?? -1;
  const cached = snapshotCache.get(cacheKey);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.snapshot;
  }

  if (!process.env.PODCHASER_API_KEY || !process.env.PODCHASER_API_SECRET) {
    console.warn("Podchaser credentials missing; reverting to fallback trend snapshot.");
    const snapshot: PodcastTrendSnapshot = {
      ...FALLBACK_SNAPSHOT,
      generatedAt: new Date().toISOString()
    };
    snapshotCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      snapshot
    });
    return snapshot;
  }

  try {
    const token = await getPodchaserAccessToken();
    const categories = await Promise.all(
      CATEGORY_CONFIG.map((config) => buildCategoryTrend(config, token, maxDurationSeconds))
    );

    const snapshot: PodcastTrendSnapshot = {
      generatedAt: new Date().toISOString(),
      categories
    };

    snapshotCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      snapshot
    });

    return snapshot;
  } catch (error) {
    console.warn("Falling back to sample data due to Podchaser error", error);
    const snapshot: PodcastTrendSnapshot = {
      ...FALLBACK_SNAPSHOT,
      generatedAt: new Date().toISOString()
    };
    snapshotCache.set(cacheKey, {
      expiresAt: now + CACHE_TTL_MS,
      snapshot
    });
    return snapshot;
  }
}

export function getCategoryMetadata() {
  return CATEGORY_CONFIG.map(({ id, name, summary }) => ({
    id,
    name,
    summary
  }));
}

export async function findEpisodeById(
  episodeId: string,
  options?: { maxDurationSeconds?: number }
): Promise<{ episode: PodcastEpisode; category: PodcastCategoryTrend } | null> {
  const snapshot = await getPodcastTrends(options);

  for (const category of snapshot.categories) {
    const episode = category.sampleEpisodes.find((item) => item.id === episodeId);
    if (episode) {
      return { episode, category };
    }
  }

  return null;
}
