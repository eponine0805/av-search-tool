// netlify/functions/search.js

// --- 環境変数 ---
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SOKMIL_API_KEY = process.env.SOKMIL_API_KEY;
const SOKMIL_AFFILIATE_ID = process.env.SOKMIL_AFFILIATE_ID;
// ▼▼▼ DMM用の環境変数を追加 ▼▼▼
const DMM_API_KEY = process.env.DMM_API_KEY;
const DMM_AFFILIATE_ID = process.env.DMM_AFFILIATE_ID;


/**
 * Gemini APIを「JSONモード」で呼び出すためのヘルパー関数 (変更なし)
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

    // ▼▼▼ DMM検索の呼び出し先を新しい searchDmm 関数に変更 ▼▼▼
    if (type === 'dmm') {
      responseData = await searchDmm(userQuery);
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


// --- Sokmil API 関連の関数 ---

/**
 * Sokmil APIを呼び出して検索結果を取得するヘルパー関数 (変更なし)
 * @param {URLSearchParams} params APIリクエストのパラメータ
 * @returns {Promise<Array>} 検索結果のアイテム配列
 */
async function fetchSokmilApi(params) {
    const url = `https://sokmil-ad.com/api/v1/Item?${params.toString()}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000); // 9秒でタイムアウト
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
 * Sokmil APIを検索し、関連性の高い順に結果を返す（変更なし）
 */
async function searchSokmil(keyword) {
  try {
    const searchQuery = keyword || "還暦を迎えた60代とねっとりセックス";

    const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から日本語の名詞または形容詞あるいは人物名を1~5つまで抽出し、さらに文章から推測されるAVのジャンルを3つ生成し、それら合計4~8つの単語を「女優名」「キーワード」の2つのカテゴリに分類してください。
文章: "${searchQuery}"

出力ルール:
- JSONオブジェクト形式で出力してください。
- キーは "keywords", "actors" としてください。
- 各キーの値は、抽出や生成した単語の文字列配列にしてください。
- 解説やMarkdownは一切含めないでください。
- Googleのセーフティ機能に抵触しそうな単語は含めないでください。`;

    const resultText = await callGeminiApi(keywordPrompt);
    if (!resultText) {
      console.log("Gemini API returned an empty response. Returning no results.");
      return { results: [], keywords: [] };
    }

    const classifiedKeywords = JSON.parse(resultText);
    const { keywords = [], actors = [] } = classifiedKeywords;
    const allKeywords = [...keywords, ...actors];

    if (allKeywords.length === 0) {
      return { results: [], keywords: [] };
    }

    const baseParams = {
        api_key: SOKMIL_API_KEY,
        affiliate_id: SOKMIL_AFFILIATE_ID,
        output: 'json',
        hits: 30,
    };

    const keywordPromises = keywords.map(kw => fetchSokmilApi(new URLSearchParams({ ...baseParams, keyword: kw })));
    const actorPromises = actors.map(kw => fetchSokmilApi(new URLSearchParams({ ...baseParams, keyword: kw, article: 'actor' })));

    const allPromises = [...actorPromises, ...keywordPromises];
    const allResults = await Promise.all(allPromises);
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

    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);

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
        largeImageUrl: item.imageURL?.large || item.imageURL?.list || '',
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

// --- DMM API 関連の関数 ---

/**
 * DMM APIを呼び出して検索結果を取得するヘルパー関数
 * @param {URLSearchParams} params APIリクエストのパラメータ
 * @returns {Promise<Array>} 検索結果のアイテム配列
 */
async function fetchDmmApi(params) {
    // DMM APIのエンドポイントURL
    const url = `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000); // 9秒でタイムアウト
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`DMM API request failed with status ${response.status} for params: "${params.toString()}"`);
            return [];
        }
        const data = await response.json();
        // DMM APIのレスポンス構造に合わせる
        return data.result?.items || [];
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`DMM API request timed out for params: "${params.toString()}"`);
        } else {
            console.error(`DMM API search failed for params "${params.toString()}":`, error);
        }
        return [];
    }
}
/**
 * DMM APIを検索し、articleパラメータを利用して女優を優先し、関連性の高い順に結果を返す
 */
async function searchDmm(keyword) {
  try {
    const searchQuery = keyword || "還暦を迎えた60代とねっとりセックス";

    const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から日本語の名詞または形容詞あるいは人物名を1~5つまで抽出し、さらに文章から推測されるAVのジャンルを3つ生成し、それら合計4~8つの単語を「女優名」「キーワード」の2つのカテゴリに分類してください。
文章: "${searchQuery}"

出力ルール:
- JSONオブジェクト形式で出力してください。
- キーは "keywords", "actors" としてください。
- 各キーの値は、抽出や生成した単語の文字列配列にしてください。
- 解説やMarkdownは一切含めないでください。
- Googleのセーフティ機能に抵触しそうな単語は含めないでください。`;

    const resultText = await callGeminiApi(keywordPrompt);
    if (!resultText) {
      console.log("Gemini API returned an empty response. Returning no results.");
      return { results: [], keywords: [] };
    }

    const classifiedKeywords = JSON.parse(resultText);
    const { keywords = [], actors = [] } = classifiedKeywords;
    const allKeywords = [...keywords, ...actors];

    if (allKeywords.length === 0) {
      return { results: [], keywords: [] };
    }

    const baseParams = {
      api_id: DMM_API_KEY,
      affiliate_id: DMM_AFFILIATE_ID,
      site: 'FANZA',
      service: 'digital',
      floor: 'videoa',
      output: 'json',
      hits: 30,
      sort: 'match',
    };

    // ▼▼▼ ここからロジックを修正 ▼▼▼

    // 1. 「キーワード」と「女優」でAPIリクエストを分けて作成
    const keywordPromises = keywords.map(kw => fetchDmmApi(new URLSearchParams({ ...baseParams, keyword: kw })));
    const actorPromises = actors.map(kw => fetchDmmApi(new URLSearchParams({ ...baseParams, keyword: kw, article: 'actress' })));

    // 2. すべての検索を並列実行し、結果を一つにまとめる (元のシンプルなロジックに戻す)
    const allPromises = [...actorPromises, ...keywordPromises];
    const allResults = await Promise.all(allPromises);
    const flattenedResults = allResults.flat();

    if (flattenedResults.length === 0) {
      return { results: [], keywords: allKeywords };
    }

    // 3. 作品IDごとに出現回数をカウントして、関連度をスコアリング
    const frequencyCounter = new Map();
    const productData = new Map();
    flattenedResults.forEach(item => {
      if (!item || !item.content_id) return;
      const currentCount = frequencyCounter.get(item.content_id) || 0;
      frequencyCounter.set(item.content_id, currentCount + 1);
      if (!productData.has(item.content_id)) productData.set(item.content_id, item);
    });

    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);

    // 4. 最終的なレスポンスデータを生成
    const totalKeywordsCount = allKeywords.length;
    const finalResults = sortedByFrequency.map(([itemId, count]) => {
      const item = productData.get(itemId);
      const itemActors = item.iteminfo?.actress?.map(a => a.name).join(', ') || '情報なし';
      const itemGenres = item.iteminfo?.genre?.map(g => g.name).join(', ') || '情報なし';

      return {
        id: item.content_id,
        site: 'DMM',
        title: item.title,
        url: item.affiliateURL,
        imageUrl: item.imageURL?.list || '',
        largeImageUrl: item.imageURL?.large || item.imageURL?.list || '',
        maker: item.iteminfo?.maker?.[0]?.name || '情報なし',
        actors: itemActors,
        genres: itemGenres,
        score: `${count}/${totalKeywordsCount}`, // 元のスコア表示に戻す
        reason: `キーワード(${totalKeywordsCount}個)のうち、${count}個の検索条件に一致しました。` // 元の理由表示に戻す
      };
    });

    return { results: finalResults, keywords: allKeywords };
  } catch (e) {
    console.error("DMM search failed:", e);
    throw new Error(`DMM検索中にエラーが発生しました: ${e.message}`);
  }
}
