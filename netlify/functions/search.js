// netlify/functions/search.js

// --- 環境変数 ---
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID;

// Sokmil APIのベースURL
const SOKMIL_BASE_URL = 'https://sokmil-ad.com/api/v1';

/**
 * Gemini APIを「JSONモード」で呼び出すためのヘルパー関数
 */
async function callGeminiApi(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API Error Response:", errorText);
      throw new Error(`Gemini API request failed with status ${response.status}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "{}";
  }
}

/**
 * Sokmil APIを呼び出す共通ヘルパー関数
 */
async function callSokmilApi(endpoint, params) {
    const url = `${SOKMIL_BASE_URL}/${endpoint}?${params.toString()}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') console.error(`Sokmil API request to ${endpoint} timed out.`);
        else console.error(`Sokmil API request to ${endpoint} failed:`, error);
        return null;
    }
}

/**
 * Netlify Functionのメインハンドラ
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }
  try {
    const { userQuery, type } = JSON.parse(event.body);
    let responseData = {};
    if (type === 'dmm') {
      responseData = await generateDmmResults(userQuery);
    } else if (type === 'sokmil') {
      responseData = await searchSokmil(userQuery);
    } else {
      return { statusCode: 400, body: JSON.stringify({ message: '無効な検索タイプです。' }) };
    }
    const bodyResponse = {
        keywords: responseData.keywords || {},
        results: responseData.results || [],
        message: responseData.message || ((!responseData.results || responseData.results.length === 0) ? "作品が見つかりませんでした。" : "")
    };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyResponse),
    };
  } catch (error) {
    console.error("Handler Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `サーバー内部でエラーが発生しました: ${error.message}` }),
    };
  }
};

const normalizeToArray = (entity) => {
    if (!entity) return [];
    if (Array.isArray(entity)) return entity;
    return [entity];
};

/**
 * Sokmil APIを検索し、関連性の高い順に結果を返す
 */
async function searchSokmil(userQuery) {
  try {
    const searchQuery = userQuery || "新人";
    const baseParams = {
        api_key: SOKMIL_API_KEY,
        affiliate_id: SOKMIL_AFFILIATE_ID,
        output: 'json'
    };
    const keywordsForDisplay = { actor: null, series: null, genres: [], titles: [] };
    
    // --- 事前調査フェーズ ---
    const getSingleEntity = async (entityType) => {
        const res = await callSokmilApi(entityType, new URLSearchParams({ ...baseParams, keyword: searchQuery, hits: 1 }));
        return normalizeToArray(res?.result?.[entityType.toLowerCase()])[0] || null;
    };

    const getMultipleGenres = async () => {
        const res = await callSokmilApi('Genre', new URLSearchParams({ ...baseParams, keyword: searchQuery, hits: 3 }));
        return normalizeToArray(res?.result?.genre);
    };

    const getTitleKeywords = async () => {
        const prompt = `以下の文章から女優名、ジャンル名、シリーズ名を除いた、作品の内容を表す一般的なキーワード（名詞、形容詞）を最大3つ抽出し、JSON配列で出力してください。文章: "${searchQuery}"`;
        const text = await callGeminiApi(prompt);
        return JSON.parse(text || "[]");
    };

    const [actor, series, genres, titles] = await Promise.all([
        getSingleEntity('Actor'),
        getSingleEntity('Series'),
        getMultipleGenres(),
        getTitleKeywords()
    ]);

    if (actor) keywordsForDisplay.actor = actor.name;
    if (series) keywordsForDisplay.series = series.name;
    if (genres.length > 0) keywordsForDisplay.genres = genres.map(g => g.name);
    if (titles.length > 0) keywordsForDisplay.titles = titles;

    // --- 作品検索フェーズ ---
    const searchPromises = [];

    // 各検索に優先度とカテゴリ名をタグ付けする
    if (actor) {
        const params = new URLSearchParams({ ...baseParams, article: 'actor', article_id: actor.id, hits: 40 });
        searchPromises.push(callSokmilApi('Item', params).then(d => (d?.result?.items || []).map(i => ({...i, _source: '女優', _priority: 1}))));
    }
    if (series) {
        const params = new URLSearchParams({ ...baseParams, article: 'series', article_id: series.id, hits: 40 });
        searchPromises.push(callSokmilApi('Item', params).then(d => (d?.result?.items || []).map(i => ({...i, _source: 'シリーズ', _priority: 2}))));
    }
    if (genres.length > 0) {
        genres.forEach(g => {
            const params = new URLSearchParams({ ...baseParams, article: 'genre', article_id: g.id, hits: 20 });
            searchPromises.push(callSokmilApi('Item', params).then(d => (d?.result?.items || []).map(i => ({...i, _source: 'ジャンル', _priority: 3}))));
        });
    }
    if (titles.length > 0) {
        titles.forEach(t => {
            const params = new URLSearchParams({ ...baseParams, keyword: t, hits: 20 });
            searchPromises.push(callSokmilApi('Item', params).then(d => (d?.result?.items || []).map(i => ({...i, _source: 'タイトル', _priority: 4}))));
        });
    }

    if (searchPromises.length === 0) {
        return { results: [], keywords: keywordsForDisplay, message: "検索キーワードが見つかりませんでした。" };
    }

    const allResults = await Promise.all(searchPromises);
    const flattenedResults = allResults.flat();

    // 重複を排除しつつ、最も高い優先度を保持
    const productData = new Map();
    flattenedResults.forEach(item => {
        if (!productData.has(item.id) || item._priority < productData.get(item.id)._priority) {
            productData.set(item.id, item);
        }
    });

    const uniqueResults = Array.from(productData.values());

    // 優先度でソート
    uniqueResults.sort((a, b) => a._priority - b._priority);

    const formattedResults = uniqueResults.map(item => ({
        id: item.id, site: 'ソクミル', title: item.title, url: item.affiliateURL,
        imageUrl: item.imageURL?.list, maker: item.iteminfo?.maker?.[0]?.name || '情報なし',
        actors: item.iteminfo?.actor?.map(a => a.name).join(', ') || '情報なし',
        genres: item.iteminfo?.genre?.map(g => g.name).join(', ') || '情報なし',
        sourceCategory: item._source // ヒットカテゴリを追加
    }));

    return { results: formattedResults, keywords: keywordsForDisplay };

  } catch (e) {
    console.error("Sokmil search failed:", e);
    return { results: [], keywords: {}, error: `ソクミル検索中にエラーが発生しました: ${e.message}` };
  }
}

/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    const prompt = `記憶: "${queryForAI}" に合致しそうな架空のDMM作品リストを3つ生成してください。
出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, actors, genres`;
    const responseText = await callGeminiApi(prompt);
    const finalResults = JSON.parse(responseText || "[]");
    return { results: finalResults, keywords: { generated: [queryForAI] }, message: "AIが架空の作品を生成しました。" };
  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
