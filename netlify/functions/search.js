// netlify/functions/search.js

// --- 環境変数 ---
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID;

/**
 * Gemini APIを「JSONモード」で呼び出すためのヘルパー関数
 * @param {string} prompt Geminiに送信するプロンプト文字列
 * @returns {Promise<string>} GeminiからのJSONテキスト応答
 */
async function callGeminiApi(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
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
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
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

    if (!responseData.results || responseData.results.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "作品が見つかりませんでした。", keywords: responseData.keywords || [] })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error("Handler Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: `サーバー内部でエラーが発生しました: ${error.message}` }),
    };
  }
};


// ▼▼▼ ここから変更 ▼▼▼

/**
 * Sokmil APIを呼び出して検索結果を取得するヘルパー関数
 * @param {URLSearchParams} params APIリクエストのパラメータ
 * @returns {Promise<Array>} 検索結果のアイテム配列
 */
async function fetchSokmilApi(params) {
    const url = `https://sokmil-ad.com/api/v1/Item?${params.toString()}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒でタイムアウト
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Sokmil API request failed with status ${response.status} for params: "${params.toString()}"`);
            return [];
        }
        const data = await response.json();
        return data.result?.items || [];
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`Sokmil API request timed out for params: "${params.toString()}"`);
        } else {
            console.error(`Sokmil API search failed for params "${params.toString()}":`, error);
        }
        return [];
    }
}


/**
 * Sokmil APIを検索し、関連性の高い順に結果を返す（新ロジック）
 */
async function searchSokmil(keyword) {
  try {
    const searchQuery = keyword || "還暦を迎えた熟女とねっとり";

    // 1. Gemini API を使用してキーワードを「タイトル」「ジャンル」「女優」に分類
    const keywordPrompt = `あなたは非常に優秀な検索アシスタントです。あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使うタイトルに含まれていそうな日本語の名詞または形容詞あるいは女優名を1~5つまで抽出し、さらに追加で文章から類推されるAVのジャンルを3つ生成し、それらを「女優名」「キーワード」の2つのカテゴリに分類してください。
文章: "${searchQuery}"

出力ルール:
- JSONオブジェクト形式で出力してください。
- キーは "keyword", "actors" としてください。
- 各キーの値は、抽出した単語の文字列配列にしてください。
- 該当する単語がない場合は、空の配列 [] にしてください。
- 解説やMarkdownは一切含めないでください。
- Googleのセーフティ機能に抵触しそうな単語は含めないでください。`;

    const resultText = await callGeminiApi(keywordPrompt);
    if (!resultText) {
      console.log("Gemini API returned an empty response. Returning no results.");
      return { results: [], keywords: [] };
    }

    const classifiedKeywords = JSON.parse(resultText);
    const { kyeword = [], actors = [] } = classifiedKeywords;
    const allKeywords = [...actors, ...keyword];

    if (allKeywords.length === 0) {
      return { results: [], keywords: [] };
    }

    // 2. 分類されたカテゴリごとにAPI検索のPromiseを作成
    const baseParams = {
        api_key: SOKMIL_API_KEY,
        affiliate_id: SOKMIL_AFFILIATE_ID,
        output: 'json',
        hits: 20, // 各キーワードでの取得件数を増やして網羅性を高める
    };

    const titlePromises = titles.map(kw => fetchSokmilApi(new URLSearchParams({ ...baseParams, keyword: kw })));
    const actorPromises = actors.map(kw => fetchSokmilApi(new URLSearchParams({ ...baseParams, keyword: kw, article: 'actor' })));

    // 3. すべての検索を並列実行し、結果を一つにまとめる
    const allPromises = [...actorPromises, ...titlePromises];
    const allResults = await Promise.all(allPromises);
    const flattenedResults = allResults.flat();

    if (flattenedResults.length === 0) {
      return { results: [], keywords: allKeywords };
    }

    // 4. 作品IDごとに出現回数をカウントして、関連度をスコアリング
    const frequencyCounter = new Map();
    const productData = new Map();
    flattenedResults.forEach(item => {
      if (!item || !item.id) return;
      const currentCount = frequencyCounter.get(item.id) || 0;
      frequencyCounter.set(item.id, currentCount + 1);
      if (!productData.has(item.id)) productData.set(item.id, item);
    });

    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);

    // 5. 最終的なレスポンスデータを生成
    const totalKeywordsCount = allKeywords.length;
    const finalResults = sortedByFrequency.map(([itemId, count]) => {
      const item = productData.get(itemId);
      const itemActors = item.iteminfo?.actor?.map(a => a.name).join(', ') || '情報なし';
      const itemGenres = item.iteminfo?.genre?.map(g => g.name).join(', ') || '情報なし';

      return {
        id: item.id,
        site: 'ソクミル',
        title: item.title,
        url: item.affiliateURL,
        imageUrl: item.imageURL?.list || '',
        maker: item.iteminfo?.maker?.[0]?.name || '情報なし',
        actors: itemActors,
        genres: itemGenres,
        score: `${count}/${totalKeywordsCount}`,
        reason: `キーワード(${totalKeywordsCount}個)のうち、${count}個の検索条件に一致しました。`
      };
    });

    return { results: finalResults, keywords: allKeywords };
  } catch (e) {
    console.error("Sokmil search failed:", e);
    throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
  }
}

// ▲▲▲ ここまで変更 ▲▲▲


/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    
    const prompt = `以下の記憶を元に、それに合致しそうな架空のDMM作品のリストを3つ生成してください。
記憶: "${queryForAI}"

出力ルール:
- JSON配列形式で、各作品に以下のキーを必ず含めてください: "id", "site", "title", "url", "imageUrl", "maker", "actors", "genres", "score", "reason"。
- "actors"と"genres"の値は、カンマ区切りの文字列にしてください。(例: "女優A, 女優B")。
- 存在しない項目は「情報なし」と記載してください。`;

    const responseText = await callGeminiApi(prompt);
    const finalResults = JSON.parse(responseText);

    return { results: finalResults, keywords: [queryForAI] };
  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
