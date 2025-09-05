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
    generationConfig: {
      responseMimeType: "application/json",
    },
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
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw error;
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

        if (!response.ok) {
            console.error(`Sokmil API request to ${endpoint} failed with status ${response.status}`);
            return null;
        }
        return await response.json();
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`Sokmil API request to ${endpoint} timed out.`);
        } else {
            console.error(`Sokmil API request to ${endpoint} failed:`, error);
        }
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
        keywords: responseData.keywords || [],
        results: responseData.results || [],
        message: (!responseData.results || responseData.results.length === 0) ? "作品が見つかりませんでした。" : ""
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

/**
 * Sokmil APIを検索し、関連性の高い順に結果を返す
 */
async function searchSokmil(userQuery) {
  try {
    const searchQuery = userQuery || "新人";
    
    const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。ユーザーが入力した以下の文章を解析し、検索に使用するキーワードを「タイトル」「シリーズ」「ジャンル」「出演者」の4つのカテゴリに分類してください。
文章: "${searchQuery}"
出力ルール: JSON形式で、キーは"title", "series", "genre", "actor"とし、値は文字列配列にしてください。該当がない場合は空配列[]とします。解説やMarkdownは不要です。`;

    const resultText = await callGeminiApi(keywordPrompt);
    if (!resultText) {
        console.log("Gemini API returned an empty response.");
        return { results: [], keywords: [] };
    }

    const keywordsObject = JSON.parse(resultText);
    const allKeywords = Object.values(keywordsObject).flat();
    if (allKeywords.length === 0) {
        return { results: [], keywords: [] };
    }

    const isActorSpecified = keywordsObject.actor && keywordsObject.actor.length > 0;
    const specifiedActorIds = new Set();

    const searchPromises = [];
    const baseParams = {
        api_key: SOKMIL_API_KEY,
        affiliate_id: SOKMIL_AFFILIATE_ID,
        output: 'json'
    };

    keywordsObject.title.forEach(kw => {
        const params = new URLSearchParams({ ...baseParams, keyword: kw, hits: 20 });
        searchPromises.push(callSokmilApi('Item', params).then(data => data?.result?.items || []));
    });

    const categorySearches = [
        { type: 'Genre', keywords: keywordsObject.genre, idKey: 'genre_id', resultKey: 'genre' },
        { type: 'Series', keywords: keywordsObject.series, idKey: 'series_id', resultKey: 'series' },
        { type: 'Actor', keywords: keywordsObject.actor, idKey: 'actor_id', resultKey: 'actor' },
    ];
    
    categorySearches.forEach(({ type, keywords, idKey, resultKey }) => {
        keywords.forEach(kw => {
            const idSearchParams = new URLSearchParams({ ...baseParams, keyword: kw });
            const promise = callSokmilApi(type, idSearchParams)
                .then(idData => {
                    const foundItems = idData?.result?.[resultKey] || [];
                    if (type === 'Actor') {
                        foundItems.forEach(item => specifiedActorIds.add(item.id));
                    }
                    if (foundItems.length === 0) return [];
                    
                    const itemSearchPromises = foundItems.slice(0, 3).map(item => {
                        const itemSearchParams = new URLSearchParams({ ...baseParams, [idKey]: item.id, hits: 10 });
                        return callSokmilApi('Item', itemSearchParams).then(itemData => itemData?.result?.items || []);
                    });
                    return Promise.all(itemSearchPromises).then(results => results.flat());
                });
            searchPromises.push(promise);
        });
    });

    const allResults = await Promise.all(searchPromises);
    const flattenedResults = allResults.flat();

    if (flattenedResults.length === 0) {
      return { results: [], keywords: allKeywords };
    }

    const frequencyCounter = new Map();
    const productData = new Map();
    flattenedResults.forEach(item => {
        if (!item || !item.id) return;
        const currentCount = frequencyCounter.get(item.id) || 0;
        frequencyCounter.set(item.id, currentCount + 1);
        if (!productData.has(item.id)) productData.set(item.id, item);
    });

    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => {
        if (!isActorSpecified || specifiedActorIds.size === 0) {
            return b[1] - a[1];
        }
        const itemA = productData.get(a[0]);
        const itemB = productData.get(b[0]);
        const itemAActorIds = new Set(itemA.iteminfo?.actor?.map(act => act.id) || []);
        const itemBActorIds = new Set(itemB.iteminfo?.actor?.map(act => act.id) || []);
        const isItemASpecified = [...specifiedActorIds].some(id => itemAActorIds.has(id));
        const isItemBSpecified = [...specifiedActorIds].some(id => itemBActorIds.has(id));
        if (isItemASpecified && !isItemBSpecified) return -1;
        if (!isItemASpecified && isItemBSpecified) return 1;
        return b[1] - a[1];
    });
    
    const finalResults = sortedByFrequency.slice(0, 50).map(([itemId, count]) => {
        const item = productData.get(itemId);
        
        const actors = item.iteminfo?.actor?.map(a => a.name).join(', ') || '情報なし';
        const genres = item.iteminfo?.genre?.map(g => g.name).join(', ') || '情報なし';

        const itemActorIds = new Set(item.iteminfo?.actor?.map(act => act.id) || []);
        const isSpecifiedActorWork = isActorSpecified && [...specifiedActorIds].some(id => itemActorIds.has(id));
        
        let reasonText = `AIが抽出した${allKeywords.length}個のキーワードのうち、${count}個の検索条件に一致しました。`;
        if (isSpecifiedActorWork) {
            reasonText = `[最優先] 指定された女優の作品です。` + reasonText;
        }

        // ▼▼▼ スコア計算をパーセンテージに変更 ▼▼▼
        const scorePercentage = allKeywords.length > 0 ? Math.round((count / allKeywords.length) * 100) : 0;
        // ▲▲▲ スコア計算をパーセンテージに変更 ▲▲▲

        return {
            id: item.id,
            site: 'ソクミル',
            title: item.title,
            url: item.affiliateURL,
            imageUrl: item.imageURL?.list,
            maker: item.iteminfo?.maker?.[0]?.name || '情報なし',
            actors: actors,
            genres: genres,
            score: `${scorePercentage}%`, // ◀◀◀ 変更
            reason: reasonText,
        };
    });

    return { results: finalResults, keywords: allKeywords };

  } catch (e) {
    console.error("Sokmil search failed:", e);
    const keywords = (e instanceof SyntaxError && resultText) ? [resultText] : [];
    return { results: [], keywords: keywords, error: `ソクミル検索中にエラーが発生しました: ${e.message}` };
  }
}

/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    // ▼▼▼ プロンプトを修正 ▼▼▼
    const prompt = `以下の記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
記憶: "${queryForAI}"
出力ルール: 
- JSON配列形式で、各作品に以下のキーを必ず含めてください: id, site, title, url, imageUrl, maker, actors, genres, score, reason。
- actorsとgenresの値は、カンマ区切りの文字列にしてください。(例: "女優A, 女優B")。
- scoreはAIによる一致度をパーセンテージの文字列（例: "85%"）で示してください。
- 存在しない項目は「情報なし」と記載してください。`;
    // ▲▲▲ プロンプトを修正 ▲▲▲

    const responseText = await callGeminiApi(prompt);
    const finalResults = JSON.parse(responseText);
    
    return { results: finalResults, keywords: [queryForAI] };
  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
