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
        if (!response.ok) {
            console.error(`Sokmil API request to ${endpoint} failed with status ${response.status}`);
            return null;
        }
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

    // --- AIによるキーワードの生成と分類 ---
    const generationPrompt = `あなたは検索の専門家です。以下の文章から検索に有効そうなキーワードを10個まで生成し、JSON配列で出力してください。文章: "${searchQuery}"`;
    const generatedKeywordsText = await callGeminiApi(generationPrompt);
    const generatedKeywords = JSON.parse(generatedKeywordsText || "[]");

    const allWordsToClassify = [...new Set([searchQuery, ...generatedKeywords])];
    const classificationPrompt = `あなたはキーワード分類の専門家です。以下のリストを分析し、各単語を「タイトル」「シリーズ」「ジャンル」「出演者」の4つのカテゴリに最も適切に分類してください。人名は必ず「出演者」に、ジャンル名は必ず「ジャンル」に分類してください。分類が難しい一般的な単語は「タイトル」に含めてください。出力はJSON形式で、キーは"title", "series", "genre", "actor"とし、値は文字列配列にしてください。キーワードリスト: ${JSON.stringify(allWordsToClassify)}`;
    
    const classifiedKeywordsText = await callGeminiApi(classificationPrompt);
    const keywordsObject = JSON.parse(classifiedKeywordsText || "{}");

    keywordsObject.title = keywordsObject.title || [];
    keywordsObject.series = keywordsObject.series || [];
    keywordsObject.genre = keywordsObject.genre || [];
    keywordsObject.actor = keywordsObject.actor || [];

    const totalSearchesPerformed = Object.values(keywordsObject).reduce((sum, arr) => sum + arr.length, 0);
    const displayedKeywords = [...new Set(Object.values(keywordsObject).flat())];

    if (totalSearchesPerformed === 0) {
        return { results: [], keywords: [] };
    }

    // ▼▼▼ 各配列を専用の検索にのみ使用するようロジックを修正 ▼▼▼
    const searchPromises = [];
    const baseParams = {
        api_key: SOKMIL_API_KEY,
        affiliate_id: SOKMIL_AFFILIATE_ID,
        output: 'json',
        hits: 20
    };

    // 各検索パラメータとキーワードのペアを作成
    const searchTasks = [
        ...keywordsObject.title.map(kw => ({ params: { keyword: kw }, isActorSearch: false })),
        ...keywordsObject.genre.map(kw => ({ params: { genre: kw }, isActorSearch: false })),
        ...keywordsObject.series.map(kw => ({ params: { series: kw }, isActorSearch: false })),
        ...keywordsObject.actor.map(kw => ({ params: { artist: kw }, isActorSearch: true }))
    ];

    searchTasks.forEach(task => {
        const finalParams = new URLSearchParams({ ...baseParams, ...task.params });
        const promise = callSokmilApi('Item', finalParams).then(data => {
            const items = data?.result?.items || [];
            // 女優検索でヒットした作品に目印をつける
            if (task.isActorSearch) {
                items.forEach(item => item._isActorMatch = true);
            }
            return items;
        });
        searchPromises.push(promise);
    });
    // ▲▲▲ 検索ロジックの修正ここまで ▲▲▲

    const allResults = await Promise.all(searchPromises);
    const flattenedResults = allResults.flat();

    if (flattenedResults.length === 0) {
      return { results: [], keywords: displayedKeywords };
    }

    const frequencyCounter = new Map();
    const productData = new Map();
    flattenedResults.forEach(item => {
        if (!item || !item.id) return;
        const currentCount = frequencyCounter.get(item.id) || 0;
        frequencyCounter.set(item.id, currentCount + 1);
        
        if (!productData.has(item.id)) {
            productData.set(item.id, item);
        } else if (item._isActorMatch) {
            const existingItem = productData.get(item.id);
            existingItem._isActorMatch = true;
        }
    });

    const isActorSpecified = keywordsObject.actor.length > 0;
    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => {
        const itemA = productData.get(a[0]);
        const itemB = productData.get(b[0]);

        if (isActorSpecified) {
            const isItemASpecified = itemA._isActorMatch || false;
            const isItemBSpecified = itemB._isActorMatch || false;
            if (isItemASpecified && !isItemBSpecified) return -1;
            if (!isItemASpecified && isItemBSpecified) return 1;
        }
        
        return b[1] - a[1];
    });
    
    const finalResults = sortedByFrequency.slice(0, 50).map(([itemId, count]) => {
        const item = productData.get(itemId);
        const actors = item.iteminfo?.actor?.map(a => a.name).join(', ') || '情報なし';
        const genres = item.iteminfo?.genre?.map(g => g.name).join(', ') || '情報なし';
        const isSpecifiedActorWork = item._isActorMatch || false;
        
        let reasonText = `実行された${totalSearchesPerformed}回の専門検索のうち、${count}回ヒットしました。`;
        if (isSpecifiedActorWork) {
            reasonText = `[最優先] 指定された女優の作品の可能性が高いです。` + reasonText;
        }
        const scorePercentage = totalSearchesPerformed > 0 ? Math.round((count / totalSearchesPerformed) * 100) : 0;
        
        return {
            id: item.id, site: 'ソクミル', title: item.title, url: item.affiliateURL,
            imageUrl: item.imageURL?.list, maker: item.iteminfo?.maker?.[0]?.name || '情報なし',
            actors: actors, genres: genres, score: `${scorePercentage}%`, reason: reasonText,
        };
    });
    return { results: finalResults, keywords: displayedKeywords };
  } catch (e) {
    console.error("Sokmil search failed:", e);
    return { results: [], keywords: [], error: `ソクミル検索中にエラーが発生しました: ${e.message}` };
  }
}

/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    const prompt = `以下の記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
記憶: "${queryForAI}"
出力ルール: 
- JSON配列形式で、各作品に以下のキーを必ず含めてください: id, site, title, url, imageUrl, maker, actors, genres, score, reason。
- actorsとgenresの値は、カンマ区切りの文字列にしてください。(例: "女優A, 女優B")。
- scoreはAIによる一致度をパーセンテージの文字列（例: "85%"）で示してください。
- 存在しない項目は「情報なし」と記載してください。`;
    const responseText = await callGeminiApi(prompt);
    const finalResults = JSON.parse(responseText || "[]");
    return { results: finalResults, keywords: [queryForAI] };
  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
