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

/**
 * Sokmil APIを検索し、関連性の高い順に結果を返す
 */
async function searchSokmil(keyword) {
  try {
    const searchQuery = keyword || "新人";
    const keywordPrompt = `あなたは非常に優秀なAV作品の検索エンジンです。以下の文章から検索に使う日本語の名詞または形容詞を1~3つまで抽出し、さらに追加で文章から類推される単語を2つ生成し、合計3~5つの単語をJSON配列の形式（例: ["キーワード1", "キーワード2"]）で出力してください。解説やMarkdownは一切含めないでください。単語が、Googleのセーフティ機能に抵触しそうな場合はキーワードに含めないでください。文章: "${searchQuery}"`;

    const resultText = await callGeminiApi(keywordPrompt);
    const refinedKeywords = JSON.parse(resultText);

    if (!refinedKeywords || refinedKeywords.length === 0) {
      return { results: [], keywords: [] };
    }

    const searchPromises = refinedKeywords.map(async (kw) => {
      try {
        const params = new URLSearchParams({
          api_key: SOKMIL_API_KEY,
          affiliate_id: SOKMIL_AFFILIATE_ID,
          keyword: kw,
          output: 'json',
          hits: 30, // 30件に増やしておきます。お好みで調整してください。
        });
        const response = await fetch(`https://sokmil-ad.com/api/v1/Item?${params.toString()}`);
        // ▼▼▼ タイムアウト処理を追加 ▼▼▼
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000); // 9秒でタイムアウト

        const response = await fetch(url, { signal: controller.signal });
        
        clearTimeout(timeoutId); // 成功したらタイマーを解除
        if (!response.ok) return [];
        
        const data = await response.json();
        return data.result?.items || [];
      } catch (error) {
        console.error(`Sokmil API search failed for keyword "${kw}":`, error);
        return [];
      }
    });
    
    const allResults = await Promise.all(searchPromises);
    const flattenedResults = allResults.flat();
    
    if (flattenedResults.length === 0) {
      return { results: [], keywords: refinedKeywords };
    }

    const frequencyCounter = new Map();
    const productData = new Map();
    flattenedResults.forEach(item => {
        // ▼▼▼ 修正点 ▼▼▼
        const currentCount = frequencyCounter.get(item.id) || 0; // item.item_id -> item.id
        frequencyCounter.set(item.id, currentCount + 1);          // item.item_id -> item.id
        if (!productData.has(item.id)) productData.set(item.id, item); // item.item_id -> item.id
    });

    const sortedByFrequency = [...frequencyCounter.entries()].sort((a, b) => b[1] - a[1]);
    
    const finalResults = sortedByFrequency.map(([itemId, count]) => {
        const item = productData.get(itemId);
        return {
            // ▼▼▼ 修正点 ▼▼▼
            id: item.id, // item.item_id -> item.id
            site: 'ソクミル',
            title: item.title,
            url: item.affiliateURL,
            imageUrl: item.imageURL.list,
            maker: item.iteminfo.maker ? item.iteminfo.maker[0].name : '情報なし',
            score: `${count}/${refinedKeywords.length}`,
            reason: `AIが生成したキーワードのうち、${count}個に一致しました。`
        };
    });

    return { results: finalResults, keywords: refinedKeywords };
  } catch (e) {
    console.error("Sokmil search failed:", e);
    throw new Error(`ソクミル検索中にエラーが発生しました: ${e.message}`);
  }
}
/**
 * AIにユーザーの記憶に基づいた架空のDMM作品リストを生成させる
 */
async function generateDmmResults(userQuery) {
  try {
    const queryForAI = userQuery || "還暦を迎えた熟女とねっとり";
    const prompt = `以下の記憶を元に、それに合致しそうな架-空のDMM作品のリストを3つ生成してください。記憶: "${queryForAI}" 出力ルール: JSON配列形式で、各作品に以下のキーを含めてください: id, site, title, url, imageUrl, maker, score, reason`;

    const responseText = await callGeminiApi(prompt);
    const finalResults = JSON.parse(responseText);
    
    return { results: finalResults, keywords: [queryForAI] };
  } catch (e) {
    console.error("DMM AI generation failed:", e);
    throw new Error(`DMMのAI生成中にエラーが発生しました: ${e.message}`);
  }
}
