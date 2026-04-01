import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const NEWS_API_KEY = process.env['NEWS_API_KEY'];
const NEWS_API_BASE = 'https://newsapi.org/v2';

type NewsApiArticle = {
  title: string;
  source: { name: string };
  publishedAt: string;
  description: string | null;
  url: string;
};

type NewsApiResponse = {
  status: string;
  totalResults: number;
  articles: NewsApiArticle[];
};

// Fetch headlines for specific tickers from NewsAPI
export const fetchHeadlines = async (
  tickers: string[],
): Promise<{ ticker: string; headlines: string[] }[]> => {
  if (!NEWS_API_KEY) {
    logger.warn('No NEWS_API_KEY set — using mock headlines');
    return tickers.map((ticker) => ({
      ticker,
      headlines: getMockHeadlines(ticker),
    }));
  }

  const results: { ticker: string; headlines: string[] }[] = [];

  for (const ticker of tickers) {
    try {
      const query = encodeURIComponent(ticker);
      const url = `${NEWS_API_BASE}/everything?q=${query}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${NEWS_API_KEY}`;

      const res = await fetch(url);
      if (!res.ok) {
        logger.error({ ticker, status: res.status }, 'NewsAPI request failed');
        results.push({ ticker, headlines: getMockHeadlines(ticker) });
        continue;
      }

      const data = (await res.json()) as NewsApiResponse;
      const headlines = data.articles.map((a) => a.title).filter(Boolean);

      // Cache in news_cache table
      for (const article of data.articles) {
        await supabase.from('news_cache').upsert(
          {
            ticker,
            headline: article.title,
            source: article.source.name,
            raw: article,
            published_at: article.publishedAt,
          },
          { onConflict: 'ticker,headline' },
        );
      }

      logger.info({ ticker, count: headlines.length }, 'Fetched headlines from NewsAPI');
      results.push({ ticker, headlines });
    } catch (err) {
      logger.error({ ticker, err }, 'Failed to fetch headlines');
      results.push({ ticker, headlines: getMockHeadlines(ticker) });
    }
  }

  return results;
};

// Fetch cached headlines from Supabase (for tickers with recent news)
export const getCachedHeadlines = async (
  ticker: string,
  hoursBack = 24,
): Promise<string[]> => {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('news_cache')
    .select('headline')
    .eq('ticker', ticker)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(20);

  return (data ?? []).map((d) => (d as { headline: string }).headline);
};

// Mock headlines for development when NewsAPI key isn't available
function getMockHeadlines(ticker: string): string[] {
  const templates = [
    `${ticker} reports stronger than expected quarterly earnings`,
    `Analysts upgrade ${ticker} to Overweight citing growth momentum`,
    `${ticker} announces new product line expansion into emerging markets`,
    `${ticker} shares rise on increased institutional buying activity`,
    `Market watchdog reviews ${ticker} for potential regulatory concerns`,
    `${ticker} CEO discusses AI integration strategy in investor call`,
    `${ticker} beats revenue estimates but guidance disappoints`,
    `Insider selling detected at ${ticker} — CFO sells $2M in shares`,
  ];
  // Return 4-6 random headlines
  const count = 4 + Math.floor(Math.random() * 3);
  return templates.sort(() => Math.random() - 0.5).slice(0, count);
}
